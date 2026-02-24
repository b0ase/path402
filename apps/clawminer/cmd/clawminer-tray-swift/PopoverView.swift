import SwiftUI

// MARK: - Colors

extension Color {
    static let clawOrange = Color(red: 249/255, green: 115/255, blue: 22/255)     // #F97316
    static let clawDark = Color(red: 26/255, green: 26/255, blue: 26/255)          // #1A1A1A
    static let clawCard = Color(red: 38/255, green: 38/255, blue: 38/255)          // #262626
    static let clawBorder = Color(red: 64/255, green: 64/255, blue: 64/255)        // #404040
    static let clawDimText = Color(red: 163/255, green: 163/255, blue: 163/255)    // #A3A3A3
    static let clawGreen = Color(red: 34/255, green: 197/255, blue: 94/255)        // #22C55E
    static let clawRed = Color(red: 239/255, green: 68/255, blue: 68/255)          // #EF4444
}

// MARK: - Main Popover View

struct PopoverView: View {
    @ObservedObject var viewModel: MinerViewModel

    var body: some View {
        VStack(spacing: 0) {
            // Header
            headerSection

            VStack(spacing: 10) {
                // Connection status
                if !viewModel.isConnected {
                    disconnectedBanner
                }

                // Mining section
                miningSection

                // Network section
                networkSection

                // Recent blocks
                blocksSection

                // Wallet
                walletSection

                // Actions
                actionsSection
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
        }
        .frame(width: 320)
        .background(Color.clawDark)
    }

    // MARK: - Header

    var headerSection: some View {
        HStack(spacing: 10) {
            Text("\u{1F99E}")
                .font(.system(size: 24))

            VStack(alignment: .leading, spacing: 2) {
                Text("ClawMiner")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundColor(.white)
                Text("$402 Token Miner")
                    .font(.system(size: 11))
                    .foregroundColor(.clawDimText)
            }

            Spacer()

            // Status indicator
            HStack(spacing: 5) {
                Circle()
                    .fill(viewModel.isConnected ? (viewModel.isMining ? Color.clawGreen : Color.clawOrange) : Color.clawRed)
                    .frame(width: 8, height: 8)
                Text(viewModel.isConnected ? (viewModel.isMining ? "Mining" : "Idle") : "Offline")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(viewModel.isConnected ? (viewModel.isMining ? .clawGreen : .clawOrange) : .clawRed)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(
            LinearGradient(
                colors: [Color.clawOrange.opacity(0.15), Color.clawDark],
                startPoint: .top,
                endPoint: .bottom
            )
        )
    }

    // MARK: - Disconnected Banner

    var disconnectedBanner: some View {
        HStack(spacing: 8) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundColor(.clawRed)
                .font(.system(size: 12))
            Text("Daemon not responding")
                .font(.system(size: 11))
                .foregroundColor(.clawRed)
            Spacer()
        }
        .padding(10)
        .background(Color.clawRed.opacity(0.1))
        .cornerRadius(8)
    }

    // MARK: - Mining Section

    var miningSection: some View {
        SectionCard(title: "Mining", icon: "hammer.fill") {
            VStack(spacing: 8) {
                StatRow(label: "Hash Rate", value: viewModel.formattedHashRate)
                StatRow(label: "Blocks Mined", value: "\(viewModel.blocksMined)")
                StatRow(label: "Difficulty", value: "\(viewModel.difficulty)")
                StatRow(label: "Mempool", value: "\(viewModel.mempoolSize) items")
                StatRow(label: "Uptime", value: viewModel.formattedUptime)

                // Toggle mining button
                Button(action: { viewModel.toggleMining() }) {
                    HStack {
                        Image(systemName: viewModel.isMining ? "stop.fill" : "play.fill")
                            .font(.system(size: 11))
                        Text(viewModel.isMining ? "Stop Mining" : "Start Mining")
                            .font(.system(size: 12, weight: .semibold))
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 7)
                    .background(viewModel.isMining ? Color.clawRed.opacity(0.2) : Color.clawOrange.opacity(0.2))
                    .foregroundColor(viewModel.isMining ? .clawRed : .clawOrange)
                    .cornerRadius(6)
                }
                .buttonStyle(.plain)
                .padding(.top, 4)
            }
        }
    }

    // MARK: - Network Section

    var networkSection: some View {
        SectionCard(title: "Network", icon: "network") {
            VStack(spacing: 8) {
                StatRow(label: "Peers", value: "\(viewModel.peersConnected)")
                StatRow(label: "Network Blocks", value: "\(viewModel.totalNetworkBlocks)")
                StatRow(label: "Next Adjustment", value: "in \(viewModel.blocksUntilAdjust) blocks")

                if !viewModel.peerId.isEmpty {
                    HStack {
                        Text("Peer ID")
                            .font(.system(size: 11))
                            .foregroundColor(.clawDimText)
                        Spacer()
                        Button(action: { viewModel.copyPeerId() }) {
                            HStack(spacing: 3) {
                                Text(viewModel.truncateHash(viewModel.peerId))
                                    .font(.system(size: 11, design: .monospaced))
                                    .foregroundColor(.white)
                                Image(systemName: "doc.on.doc")
                                    .font(.system(size: 9))
                                    .foregroundColor(.clawOrange)
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    // MARK: - Blocks Section

    var blocksSection: some View {
        SectionCard(title: "Recent Blocks", icon: "cube.fill") {
            VStack(spacing: 6) {
                if viewModel.recentBlocks.isEmpty {
                    Text("No blocks yet")
                        .font(.system(size: 11))
                        .foregroundColor(.clawDimText)
                        .frame(maxWidth: .infinity, alignment: .center)
                        .padding(.vertical, 8)
                } else {
                    ForEach(viewModel.recentBlocks.prefix(4)) { block in
                        BlockRow(block: block, viewModel: viewModel)
                    }
                }

                // Block count summary
                HStack {
                    Text("\(viewModel.ownBlockCount) own")
                        .font(.system(size: 10, weight: .medium))
                        .foregroundColor(.clawOrange)
                    Text("/")
                        .font(.system(size: 10))
                        .foregroundColor(.clawDimText)
                    Text("\(viewModel.totalBlockCount) total")
                        .font(.system(size: 10))
                        .foregroundColor(.clawDimText)
                    Spacer()
                }
                .padding(.top, 2)
            }
        }
    }

    // MARK: - Wallet Section

    var walletSection: some View {
        SectionCard(title: "Wallet", icon: "creditcard.fill") {
            VStack(spacing: 8) {
                if viewModel.isLowBalance {
                    lowBalanceBanner
                }

                if !viewModel.minerAddress.isEmpty {
                    HStack {
                        Text("Address")
                            .font(.system(size: 11))
                            .foregroundColor(.clawDimText)
                        Spacer()
                        Button(action: { viewModel.copyAddress() }) {
                            HStack(spacing: 3) {
                                Text(viewModel.truncateAddress(viewModel.minerAddress))
                                    .font(.system(size: 11, design: .monospaced))
                                    .foregroundColor(.white)
                                Image(systemName: "doc.on.doc")
                                    .font(.system(size: 9))
                                    .foregroundColor(.clawOrange)
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }

                StatRow(label: "Balance", value: viewModel.formattedBalance)

                if !viewModel.lastBlock.isEmpty {
                    StatRow(label: "Last Block", value: viewModel.truncateHash(viewModel.lastBlock))
                }
            }
        }
    }

    var lowBalanceBanner: some View {
        HStack(spacing: 8) {
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundColor(.clawRed)
                .font(.system(size: 12))
            Text("Low balance — fund address to continue minting")
                .font(.system(size: 11))
                .foregroundColor(.clawRed)
            Spacer()
        }
        .padding(10)
        .background(Color.clawRed.opacity(0.1))
        .cornerRadius(8)
    }

    // MARK: - Actions Section

    var actionsSection: some View {
        VStack(spacing: 8) {
            Button(action: { viewModel.openDashboard() }) {
                HStack {
                    Image(systemName: "safari")
                        .font(.system(size: 12))
                    Text("Open Dashboard")
                        .font(.system(size: 12, weight: .medium))
                    Spacer()
                    Image(systemName: "arrow.up.right")
                        .font(.system(size: 10))
                }
                .foregroundColor(.clawOrange)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(Color.clawCard)
                .cornerRadius(8)
            }
            .buttonStyle(.plain)

            Button(action: { NSApplication.shared.terminate(nil) }) {
                HStack {
                    Image(systemName: "power")
                        .font(.system(size: 12))
                    Text("Quit ClawMiner")
                        .font(.system(size: 12, weight: .medium))
                    Spacer()
                }
                .foregroundColor(.clawDimText)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(Color.clawCard)
                .cornerRadius(8)
            }
            .buttonStyle(.plain)
        }
    }
}

// MARK: - Section Card

struct SectionCard<Content: View>: View {
    let title: String
    let icon: String
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.system(size: 11))
                    .foregroundColor(.clawOrange)
                Text(title)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(.clawOrange)
            }

            content
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.clawCard)
        .cornerRadius(10)
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(Color.clawBorder.opacity(0.5), lineWidth: 0.5)
        )
    }
}

// MARK: - Stat Row

struct StatRow: View {
    let label: String
    let value: String

    var body: some View {
        HStack {
            Text(label)
                .font(.system(size: 11))
                .foregroundColor(.clawDimText)
            Spacer()
            Text(value)
                .font(.system(size: 11, design: .monospaced))
                .foregroundColor(.white)
        }
    }
}

// MARK: - Block Row

struct BlockRow: View {
    let block: BlockInfo
    let viewModel: MinerViewModel

    var body: some View {
        HStack(spacing: 8) {
            // Height badge
            Text("#\(block.height)")
                .font(.system(size: 10, weight: .bold, design: .monospaced))
                .foregroundColor(block.isOwn ? .clawOrange : .clawDimText)
                .frame(width: 40, alignment: .leading)

            // Hash
            Text(viewModel.truncateHash(block.hash))
                .font(.system(size: 10, design: .monospaced))
                .foregroundColor(.white.opacity(0.7))

            Spacer()

            // Own/Peer badge
            Text(block.isOwn ? "own" : "peer")
                .font(.system(size: 9, weight: .medium))
                .foregroundColor(block.isOwn ? .clawOrange : .clawDimText)
                .padding(.horizontal, 6)
                .padding(.vertical, 2)
                .background(block.isOwn ? Color.clawOrange.opacity(0.15) : Color.clawBorder.opacity(0.3))
                .cornerRadius(4)

            // Time
            Text(viewModel.timeAgo(timestampMs: block.timestamp))
                .font(.system(size: 9))
                .foregroundColor(.clawDimText)
                .frame(width: 42, alignment: .trailing)
        }
        .padding(.vertical, 3)
    }
}
