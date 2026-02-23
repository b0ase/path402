import SwiftUI

struct MiningView: View {
    @EnvironmentObject var vm: DaemonViewModel

    private let numberFormatter: NumberFormatter = {
        let f = NumberFormatter()
        f.numberStyle = .decimal
        return f
    }()

    var body: some View {
        ZStack {
            Color.bgBlack.ignoresSafeArea()

            ScrollView {
                VStack(spacing: 16) {
                    // Mining Card
                    VStack(alignment: .leading, spacing: 12) {
                        Text("MINING")
                            .font(.system(size: 12, weight: .bold, design: .monospaced))
                            .foregroundColor(.orangePrimary)

                        ProgressView(value: Double(min(vm.status.hashRate, 100)), total: 100)
                            .tint(.orangePrimary)

                        HStack {
                            MiningStatRow(label: "Blocks Mined", value: formatted(vm.status.blocksMined))
                            Spacer()
                            MiningStatRow(label: "Mempool", value: formatted(vm.status.mempoolSize))
                        }
                    }
                    .padding(16)
                    .background(Color.bgCard)
                    .cornerRadius(12)
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(Color.borderCard, lineWidth: 1)
                    )

                    // Recent Blocks Card
                    VStack(alignment: .leading, spacing: 12) {
                        Text("RECENT BLOCKS")
                            .font(.system(size: 12, weight: .bold, design: .monospaced))
                            .foregroundColor(.orangePrimary)

                        if vm.recentBlocks.isEmpty {
                            Text("No blocks yet")
                                .font(.system(size: 12, design: .monospaced))
                                .foregroundColor(.textDim)
                        } else {
                            ForEach(vm.recentBlocks) { block in
                                HStack(spacing: 8) {
                                    Text("#\(block.height)")
                                        .font(.system(size: 12, weight: .bold, design: .monospaced))
                                        .foregroundColor(.white)
                                    Text(String(block.hash.prefix(12)) + "...")
                                        .font(.system(size: 11, design: .monospaced))
                                        .foregroundColor(.textSecondary)
                                    Spacer()
                                    Text(block.isOwn ? "own" : "peer")
                                        .font(.system(size: 10, weight: .semibold, design: .monospaced))
                                        .foregroundColor(block.isOwn ? .orangePrimary : .textDim)
                                        .padding(.horizontal, 8)
                                        .padding(.vertical, 2)
                                        .background(
                                            RoundedRectangle(cornerRadius: 10)
                                                .fill(block.isOwn ? Color.orangePrimary.opacity(0.15) : Color.white.opacity(0.05))
                                        )
                                }
                            }
                        }
                    }
                    .padding(16)
                    .background(Color.bgCard)
                    .cornerRadius(12)
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(Color.borderCard, lineWidth: 1)
                    )

                    // Header Sync Card
                    VStack(alignment: .leading, spacing: 12) {
                        HStack {
                            Text("HEADER SYNC")
                                .font(.system(size: 12, weight: .bold, design: .monospaced))
                                .foregroundColor(.orangePrimary)
                            Spacer()
                            Text(syncStatusLabel)
                                .font(.system(size: 11, weight: .medium, design: .monospaced))
                                .foregroundColor(syncStatusColor)
                        }

                        ProgressView(value: vm.syncPercent, total: 100)
                            .tint(.orangePrimary)

                        HStack {
                            Text(syncPercentText)
                                .font(.system(size: 14, weight: .bold, design: .monospaced))
                                .foregroundColor(.white)
                            Spacer()
                            Text(syncHeightText)
                                .font(.system(size: 12, design: .monospaced))
                                .foregroundColor(.textSecondary)
                        }
                    }
                    .padding(16)
                    .background(Color.bgCard)
                    .cornerRadius(12)
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(Color.borderCard, lineWidth: 1)
                    )
                }
                .padding(16)
            }
        }
    }

    private var syncStatusLabel: String {
        if !vm.status.headersEnabled { return "Disabled" }
        return vm.status.headersSyncing ? "Syncing\u{2026}" : "Synced"
    }

    private var syncStatusColor: Color {
        if !vm.status.headersEnabled { return .textDim }
        return vm.status.headersSyncing ? .orangeLight : .greenActive
    }

    private var syncPercentText: String {
        if !vm.status.headersEnabled { return "\u{2014}" }
        return String(format: "%.1f%%", vm.syncPercent)
    }

    private var syncHeightText: String {
        if !vm.status.headersEnabled { return "" }
        return "\(formatted(vm.status.highestHeight)) / \(formatted(vm.status.chainTip))"
    }

    private func formatted(_ n: Int) -> String {
        numberFormatter.string(from: NSNumber(value: n)) ?? "\(n)"
    }
}

private struct MiningStatRow: View {
    let label: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label.uppercased())
                .font(.system(size: 10, weight: .medium, design: .monospaced))
                .foregroundColor(.textSecondary)
            Text(value)
                .font(.system(size: 18, weight: .bold, design: .monospaced))
                .foregroundColor(.white)
        }
    }
}
