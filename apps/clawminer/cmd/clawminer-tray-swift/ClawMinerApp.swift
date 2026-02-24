import SwiftUI
import AppKit

@main
struct ClawMinerApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate

    var body: some Scene {
        Settings { EmptyView() }
    }
}

class AppDelegate: NSObject, NSApplicationDelegate, NSPopoverDelegate {
    var statusItem: NSStatusItem?
    var popover: NSPopover?
    var viewModel = MinerViewModel()
    var daemonProcess: Process?
    var ownsDaemon = false
    var eventMonitor: Any?

    func applicationDidFinishLaunching(_ notification: Notification) {
        // Hide dock icon — menu bar only
        NSApp.setActivationPolicy(.accessory)

        // Status bar item
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        if let button = statusItem?.button {
            // Try to load crab icon from bundle resources
            if let iconPath = Bundle.main.resourcePath.map({ $0 + "/tray-icon.png" }),
               let img = NSImage(contentsOfFile: iconPath) {
                img.size = NSSize(width: 18, height: 18)
                img.isTemplate = false  // Keep orange color
                button.image = img
            } else {
                button.title = "🦞"
            }
            button.action = #selector(togglePopover)
            button.target = self
        }

        // Popover
        popover = NSPopover()
        popover?.contentSize = NSSize(width: 320, height: 700)
        popover?.behavior = .transient
        popover?.delegate = self
        popover?.contentViewController = NSHostingController(
            rootView: PopoverView(viewModel: viewModel)
        )

        // Start daemon if needed
        if !isDaemonRunning() {
            startDaemon()
        }

        // Request notification permission for low balance alerts
        viewModel.requestNotificationPermission()

        // Start polling
        viewModel.startPolling()

        // Close popover when clicking outside
        eventMonitor = NSEvent.addGlobalMonitorForEvents(matching: [.leftMouseDown, .rightMouseDown]) { [weak self] _ in
            self?.popover?.performClose(nil)
        }
    }

    func applicationWillTerminate(_ notification: Notification) {
        stopDaemon()
        if let monitor = eventMonitor {
            NSEvent.removeMonitor(monitor)
        }
    }

    @objc func togglePopover() {
        guard let button = statusItem?.button, let popover = popover else { return }
        if popover.isShown {
            popover.performClose(nil)
        } else {
            popover.show(relativeTo: button.bounds, of: button, preferredEdge: .minY)
            NSApp.activate(ignoringOtherApps: true)
        }
    }

    func isDaemonRunning() -> Bool {
        guard let url = URL(string: "http://127.0.0.1:8402/health") else { return false }
        var request = URLRequest(url: url)
        request.timeoutInterval = 2
        let sem = DispatchSemaphore(value: 0)
        var running = false
        URLSession.shared.dataTask(with: request) { _, response, _ in
            if let http = response as? HTTPURLResponse, http.statusCode == 200 {
                running = true
            }
            sem.signal()
        }.resume()
        sem.wait()
        return running
    }

    func startDaemon() {
        guard let exe = Bundle.main.executablePath else { return }
        let dir = (exe as NSString).deletingLastPathComponent
        let daemonPath = dir + "/clawminerd"

        guard FileManager.default.fileExists(atPath: daemonPath) else {
            print("[tray] clawminerd not found at \(daemonPath)")
            return
        }

        let process = Process()
        process.executableURL = URL(fileURLWithPath: daemonPath)
        process.arguments = []

        do {
            try process.run()
            daemonProcess = process
            ownsDaemon = true
            print("[tray] Started daemon PID \(process.processIdentifier)")
        } catch {
            print("[tray] Failed to start daemon: \(error)")
        }
    }

    func stopDaemon() {
        guard let process = daemonProcess, ownsDaemon else { return }
        process.terminate()
        process.waitUntilExit()
        print("[tray] Daemon stopped")
    }
}
