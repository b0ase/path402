import Foundation
import Clawminer

struct BlockInfo: Identifiable {
    let id: String  // hash
    let height: Int
    let hash: String
    let minerAddress: String
    let isOwn: Bool
    let timestamp: Int64
}

struct DaemonStatus {
    var running = false
    var nodeID = ""
    var uptimeMs: Int64 = 0
    var peers: Int = 0
    var hashRate: Int = 0
    var blocksMined: Int = 0
    var mempoolSize: Int = 0
    var headersSyncing = false
    var headersEnabled = false
    var highestHeight: Int = 0
    var chainTip: Int = 1
    var walletAddress = ""
    var walletPubKey = ""
}

@MainActor
final class DaemonViewModel: ObservableObject {
    @Published var status = DaemonStatus()
    @Published var daemonStarted = false
    @Published var walletStatusMessage = ""
    @Published var recentBlocks: [BlockInfo] = []

    private var pollTimer: Timer?

    var uptimeFormatted: String {
        let s = status.uptimeMs / 1000
        let m = s / 60
        let h = m / 60
        let d = h / 24
        if d > 0 { return "\(d)d \(h % 24)h" }
        if h > 0 { return "\(h)h \(m % 60)m" }
        if m > 0 { return "\(m)m \(s % 60)s" }
        return "\(s)s"
    }

    var nodeIDShort: String {
        let id = status.nodeID
        if id.count > 16 {
            return "\(id.prefix(8))...\(id.suffix(4))"
        }
        return id
    }

    var syncPercent: Double {
        guard status.chainTip > 0 else { return 0 }
        return min(Double(status.highestHeight) / Double(status.chainTip) * 100, 100)
    }

    func start() {
        guard !daemonStarted else { return }

        let dataDir = Self.dataDirectory()
        DispatchQueue.global(qos: .userInitiated).async {
            var error: NSError?
            MobileStart("", dataDir, &error)
            if let error = error {
                print("Daemon start error: \(error)")
                return
            }
            DispatchQueue.main.async {
                self.daemonStarted = true
                self.startPolling()
            }
        }
    }

    func stop() {
        pollTimer?.invalidate()
        pollTimer = nil
        DispatchQueue.global(qos: .userInitiated).async {
            MobileStop()
            DispatchQueue.main.async {
                self.daemonStarted = false
                self.status = DaemonStatus()
            }
        }
    }

    func generateWallet() {
        DispatchQueue.global(qos: .userInitiated).async {
            let json = MobileGenerateWallet()
            DispatchQueue.main.async {
                self.handleWalletResult(json, verb: "Generated")
            }
        }
    }

    func importWallet(_ wif: String) {
        DispatchQueue.global(qos: .userInitiated).async {
            let json = MobileImportWallet(wif)
            DispatchQueue.main.async {
                self.handleWalletResult(json, verb: "Imported")
            }
        }
    }

    func exportWIF(completion: @escaping (String?) -> Void) {
        DispatchQueue.global(qos: .userInitiated).async {
            let json = MobileExportWIF()
            guard let data = json.data(using: .utf8),
                  let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                DispatchQueue.main.async { completion(nil) }
                return
            }
            if let error = obj["error"] as? String, !error.isEmpty {
                DispatchQueue.main.async { completion(nil) }
                return
            }
            let wif = obj["wif"] as? String
            DispatchQueue.main.async { completion(wif) }
        }
    }

    // MARK: - Private

    private func startPolling() {
        pollTimer = Timer.scheduledTimer(withTimeInterval: 2.0, repeats: true) { [weak self] _ in
            Task { @MainActor in
                self?.pollStatus()
            }
        }
    }

    private func pollStatus() {
        DispatchQueue.global(qos: .userInitiated).async {
            let json = MobileGetStatus()
            guard let data = json.data(using: .utf8),
                  let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }

            let running = obj["running"] as? Bool ?? false
            let nodeID = obj["node_id"] as? String ?? ""
            let uptimeMs = obj["uptime_ms"] as? Int64 ?? 0
            let peers = obj["peers"] as? Int ?? 0

            let mining = obj["mining"] as? [String: Any] ?? [:]
            let hashRate = (mining["hash_rate"] as? Double).map(Int.init) ?? 0
            let blocksMined = mining["blocks_mined"] as? Int ?? 0
            let mempoolSize = mining["mempool_size"] as? Int ?? 0

            let headers = obj["headers"] as? [String: Any] ?? [:]
            let headersEnabled = headers["enabled"] as? Bool ?? false
            let headersSyncing = headers["is_syncing"] as? Bool ?? false
            let highestHeight = headers["highest_height"] as? Int ?? 0
            let chainTip = headers["chain_tip"] as? Int ?? 1

            let wallet = obj["wallet"] as? [String: Any] ?? [:]
            let address = wallet["address"] as? String ?? ""
            let pubKey = wallet["public_key"] as? String ?? ""

            // Parse recent blocks
            let blocksJson = MobileGetBlocks(5)
            var parsedBlocks: [BlockInfo] = []
            if let bData = blocksJson.data(using: .utf8),
               let arr = try? JSONSerialization.jsonObject(with: bData) as? [[String: Any]] {
                for item in arr {
                    let block = BlockInfo(
                        id: item["hash"] as? String ?? "",
                        height: item["height"] as? Int ?? 0,
                        hash: item["hash"] as? String ?? "",
                        minerAddress: item["miner_address"] as? String ?? "",
                        isOwn: item["is_own"] as? Bool ?? false,
                        timestamp: item["timestamp"] as? Int64 ?? 0
                    )
                    parsedBlocks.append(block)
                }
            }

            DispatchQueue.main.async {
                self.status = DaemonStatus(
                    running: running,
                    nodeID: nodeID,
                    uptimeMs: uptimeMs,
                    peers: peers,
                    hashRate: hashRate,
                    blocksMined: blocksMined,
                    mempoolSize: mempoolSize,
                    headersSyncing: headersSyncing,
                    headersEnabled: headersEnabled,
                    highestHeight: highestHeight,
                    chainTip: chainTip,
                    walletAddress: address,
                    walletPubKey: pubKey
                )
                self.recentBlocks = parsedBlocks
            }
        }
    }

    private func handleWalletResult(_ json: String, verb: String) {
        guard let data = json.data(using: .utf8),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }

        if let error = obj["error"] as? String, !error.isEmpty {
            walletStatusMessage = error
            return
        }
        let address = obj["address"] as? String ?? ""
        let pubKey = obj["public_key"] as? String ?? ""
        status.walletAddress = address
        status.walletPubKey = pubKey
        walletStatusMessage = "\(verb) wallet"
    }

    private static func dataDirectory() -> String {
        let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        let dir = support.appendingPathComponent("clawminer")
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir.path
    }
}
