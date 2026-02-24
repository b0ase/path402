import SwiftUI

struct HomeView: View {
    @EnvironmentObject var vm: DaemonViewModel

    var body: some View {
        ZStack {
            Color.bgBlack.ignoresSafeArea()

            ScrollView {
                VStack(spacing: 24) {
                    // Hero
                    VStack(spacing: 8) {
                        Image("ClawLogo")
                            .resizable()
                            .scaledToFit()
                            .frame(width: 80, height: 80)

                        Text("CLAWMINER")
                            .font(.system(size: 28, weight: .black, design: .monospaced))
                            .foregroundColor(.orangePrimary)

                        Text("$402 Proof-of-Indexing Miner")
                            .font(.system(size: 13, design: .monospaced))
                            .foregroundColor(.textSecondary)

                        Text("v\(version)")
                            .font(.system(size: 11, design: .monospaced))
                            .foregroundColor(.textDim)
                    }
                    .padding(.top, 32)

                    // Node ID
                    if !vm.nodeIDShort.isEmpty {
                        HStack {
                            Circle()
                                .fill(vm.status.peers > 0 ? Color.greenActive : Color.orangePrimary)
                                .frame(width: 8, height: 8)
                            Text(vm.nodeIDShort)
                                .font(.system(size: 12, design: .monospaced))
                                .foregroundColor(.textSecondary)
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 8)
                        .background(Color.bgCard)
                        .cornerRadius(8)
                    }

                    // Stats Row
                    HStack(spacing: 0) {
                        StatCell(label: "Uptime", value: vm.daemonStarted ? vm.uptimeFormatted : "\u{2014}")
                        Divider()
                            .frame(height: 40)
                            .background(Color.borderCard)
                        StatCell(
                            label: "Peers",
                            value: vm.daemonStarted ? "\(vm.status.peers)" : "\u{2014}",
                            valueColor: vm.status.peers > 0 ? .greenActive : .white
                        )
                        Divider()
                            .frame(height: 40)
                            .background(Color.borderCard)
                        StatCell(label: "Hash Rate", value: vm.daemonStarted ? "\(vm.status.hashRate) H/s" : "\u{2014} H/s")
                    }
                    .padding(.vertical, 16)
                    .background(Color.bgCard)
                    .cornerRadius(12)
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(Color.borderCard, lineWidth: 1)
                    )
                    .padding(.horizontal, 16)

                    Spacer(minLength: 40)

                    // Branding
                    Text("b0ase.com")
                        .font(.system(size: 11, design: .monospaced))
                        .foregroundColor(.textDim)
                        .padding(.bottom, 16)
                }
            }
        }
    }

    private var version: String {
        "0.1.0"
    }
}

private struct StatCell: View {
    let label: String
    let value: String
    var valueColor: Color = .white

    var body: some View {
        VStack(spacing: 4) {
            Text(label.uppercased())
                .font(.system(size: 10, weight: .medium, design: .monospaced))
                .foregroundColor(.textSecondary)
            Text(value)
                .font(.system(size: 16, weight: .bold, design: .monospaced))
                .foregroundColor(valueColor)
        }
        .frame(maxWidth: .infinity)
    }
}
