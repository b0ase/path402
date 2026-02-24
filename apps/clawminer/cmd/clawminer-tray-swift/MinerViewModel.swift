import Foundation
import AppKit
import UserNotifications

// MARK: - API Response Models

struct StatusResponse: Codable {
    let mining: MiningStatus
    let peers: PeerInfo
    let wallet: WalletInfo?
    let nodeId: String
    let uptimeMs: Int

    enum CodingKeys: String, CodingKey {
        case mining, peers, wallet
        case nodeId = "node_id"
        case uptimeMs = "uptime_ms"
    }
}

struct WalletInfo: Codable {
    let address: String?
    let balanceSatoshis: Int64?
    let funded: Bool?
    let lowBalance: Bool?

    enum CodingKeys: String, CodingKey {
        case address
        case balanceSatoshis = "balance_satoshis"
        case funded
        case lowBalance = "low_balance"
    }
}

struct MiningStatus: Codable {
    let blocksMined: Int
    let difficulty: Int
    let hashRate: Double
    let isMining: Bool
    let lastBlock: String
    let mempoolSize: Int
    let minerAddress: String
    let network: NetworkStats

    enum CodingKeys: String, CodingKey {
        case blocksMined = "blocks_mined"
        case difficulty
        case hashRate = "hash_rate"
        case isMining = "is_mining"
        case lastBlock = "last_block"
        case mempoolSize = "mempool_size"
        case minerAddress = "miner_address"
        case network
    }
}

struct NetworkStats: Codable {
    let adjustmentPeriod: Int
    let blocksInPeriod: Int
    let blocksUntilAdjust: Int
    let difficulty: Int
    let target: String
    let targetBlockTimeS: Int
    let totalNetworkBlocks: Int

    enum CodingKeys: String, CodingKey {
        case adjustmentPeriod = "adjustment_period"
        case blocksInPeriod = "blocks_in_period"
        case blocksUntilAdjust = "blocks_until_adjust"
        case difficulty
        case target
        case targetBlockTimeS = "target_block_time_s"
        case totalNetworkBlocks = "total_network_blocks"
    }
}

struct PeerInfo: Codable {
    let connected: Int
    let known: Int
    let peerId: String

    enum CodingKeys: String, CodingKey {
        case connected, known
        case peerId = "peer_id"
    }
}

struct BlockInfo: Codable, Identifiable {
    var id: String { hash }
    let hash: String
    let height: Int
    let minerAddress: String
    let timestamp: Int64
    let bits: Int
    let nonce: Int
    let isOwn: Bool
    let itemCount: Int

    enum CodingKeys: String, CodingKey {
        case hash, height
        case minerAddress = "miner_address"
        case timestamp, bits, nonce
        case isOwn = "is_own"
        case itemCount = "item_count"
    }
}

struct BlockCount: Codable {
    let own: Int
    let total: Int
}

// MARK: - ViewModel

class MinerViewModel: ObservableObject {
    @Published var isConnected = false
    @Published var isMining = false
    @Published var blocksMined = 0
    @Published var difficulty = 0
    @Published var hashRate: Double = 0
    @Published var lastBlock = ""
    @Published var minerAddress = ""
    @Published var mempoolSize = 0

    // Network
    @Published var peersConnected = 0
    @Published var peerId = ""
    @Published var totalNetworkBlocks = 0
    @Published var blocksUntilAdjust = 0

    // Blocks
    @Published var recentBlocks: [BlockInfo] = []
    @Published var ownBlockCount = 0
    @Published var totalBlockCount = 0

    // Wallet balance
    @Published var balanceSatoshis: Int64 = 0
    @Published var isFunded: Bool = true
    @Published var isLowBalance: Bool = false

    // System
    @Published var uptimeMs = 0

    private var hasShownLowBalanceNotification = false
    private var pollTimer: Timer?
    private let baseURL = "http://127.0.0.1:8402"
    private let decoder = JSONDecoder()

    func startPolling() {
        poll() // immediate first poll
        pollTimer = Timer.scheduledTimer(withTimeInterval: 3.0, repeats: true) { [weak self] _ in
            self?.poll()
        }
    }

    func stopPolling() {
        pollTimer?.invalidate()
        pollTimer = nil
    }

    private func poll() {
        fetchStatus()
        fetchBlocks()
        fetchBlockCount()
    }

    private func fetchStatus() {
        guard let url = URL(string: "\(baseURL)/status") else { return }
        var request = URLRequest(url: url)
        request.timeoutInterval = 3

        URLSession.shared.dataTask(with: request) { [weak self] data, response, error in
            DispatchQueue.main.async {
                guard let self = self else { return }

                if let data = data,
                   let http = response as? HTTPURLResponse,
                   http.statusCode == 200,
                   let status = try? self.decoder.decode(StatusResponse.self, from: data) {
                    self.isConnected = true
                    self.isMining = status.mining.isMining
                    self.blocksMined = status.mining.blocksMined
                    self.difficulty = status.mining.difficulty
                    self.hashRate = status.mining.hashRate
                    self.lastBlock = status.mining.lastBlock
                    self.minerAddress = status.mining.minerAddress
                    self.mempoolSize = status.mining.mempoolSize
                    self.peersConnected = status.peers.connected
                    self.peerId = status.peers.peerId
                    self.totalNetworkBlocks = status.mining.network.totalNetworkBlocks
                    self.blocksUntilAdjust = status.mining.network.blocksUntilAdjust
                    self.uptimeMs = status.uptimeMs

                    // Wallet balance
                    if let wallet = status.wallet {
                        self.balanceSatoshis = wallet.balanceSatoshis ?? 0
                        self.isFunded = wallet.funded ?? true
                        let lowBal = wallet.lowBalance ?? false
                        self.isLowBalance = lowBal

                        if lowBal && !self.hasShownLowBalanceNotification {
                            self.sendLowBalanceNotification(
                                address: wallet.address ?? self.minerAddress,
                                satoshis: wallet.balanceSatoshis ?? 0
                            )
                            self.hasShownLowBalanceNotification = true
                        } else if !lowBal && self.hasShownLowBalanceNotification {
                            self.hasShownLowBalanceNotification = false
                        }
                    }
                } else {
                    self.isConnected = false
                }
            }
        }.resume()
    }

    private func fetchBlocks() {
        guard let url = URL(string: "\(baseURL)/api/blocks?limit=5") else { return }
        var request = URLRequest(url: url)
        request.timeoutInterval = 3

        URLSession.shared.dataTask(with: request) { [weak self] data, _, _ in
            DispatchQueue.main.async {
                guard let self = self, let data = data,
                      let blocks = try? self.decoder.decode([BlockInfo].self, from: data) else { return }
                self.recentBlocks = blocks
            }
        }.resume()
    }

    private func fetchBlockCount() {
        guard let url = URL(string: "\(baseURL)/api/blocks/count") else { return }
        var request = URLRequest(url: url)
        request.timeoutInterval = 3

        URLSession.shared.dataTask(with: request) { [weak self] data, _, _ in
            DispatchQueue.main.async {
                guard let self = self, let data = data,
                      let counts = try? self.decoder.decode(BlockCount.self, from: data) else { return }
                self.ownBlockCount = counts.own
                self.totalBlockCount = counts.total
            }
        }.resume()
    }

    // MARK: - Actions

    func toggleMining() {
        let endpoint = isMining ? "/api/mining/stop" : "/api/mining/start"
        guard let url = URL(string: "\(baseURL)\(endpoint)") else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 3

        URLSession.shared.dataTask(with: request) { [weak self] _, _, _ in
            // Next poll will update the state
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                self?.fetchStatus()
            }
        }.resume()
    }

    func openDashboard() {
        if let url = URL(string: baseURL) {
            NSWorkspace.shared.open(url)
        }
    }

    func copyAddress() {
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(minerAddress, forType: .string)
    }

    func copyPeerId() {
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(peerId, forType: .string)
    }

    // MARK: - Formatting Helpers

    var formattedUptime: String {
        let seconds = uptimeMs / 1000
        if seconds < 60 { return "\(seconds)s" }
        let minutes = seconds / 60
        if minutes < 60 { return "\(minutes)m" }
        let hours = minutes / 60
        let mins = minutes % 60
        return "\(hours)h \(mins)m"
    }

    var formattedHashRate: String {
        if hashRate >= 1000 {
            return String(format: "%.1f kH/s", hashRate / 1000)
        }
        return String(format: "%.1f H/s", hashRate)
    }

    func timeAgo(timestampMs: Int64) -> String {
        let now = Int64(Date().timeIntervalSince1970 * 1000)
        let diff = (now - timestampMs) / 1000
        if diff < 60 { return "\(diff)s ago" }
        if diff < 3600 { return "\(diff / 60)m ago" }
        if diff < 86400 { return "\(diff / 3600)h ago" }
        return "\(diff / 86400)d ago"
    }

    func truncateHash(_ hash: String) -> String {
        if hash.count > 12 {
            return String(hash.prefix(8)) + "..." + String(hash.suffix(4))
        }
        return hash
    }

    func truncateAddress(_ addr: String) -> String {
        if addr.count > 16 {
            return String(addr.prefix(8)) + "..." + String(addr.suffix(6))
        }
        return addr
    }

    var formattedBalance: String {
        if balanceSatoshis >= 100_000_000 {
            let bsv = Double(balanceSatoshis) / 100_000_000
            return String(format: "%.4f BSV", bsv)
        }
        return "\(balanceSatoshis) sat"
    }

    // MARK: - Notifications

    func requestNotificationPermission() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) { granted, error in
            if let error = error {
                print("[tray] Notification auth error: \(error)")
            }
        }
    }

    private func sendLowBalanceNotification(address: String, satoshis: Int64) {
        let content = UNMutableNotificationContent()
        content.title = "ClawMiner — Low Balance"
        content.body = "Fund \(address) with BSV to continue earning $402 tokens. Balance: \(satoshis) sat"
        content.sound = .default

        let request = UNNotificationRequest(
            identifier: "low-balance",
            content: content,
            trigger: nil
        )
        UNUserNotificationCenter.current().add(request) { error in
            if let error = error {
                print("[tray] Notification error: \(error)")
            }
        }
    }
}
