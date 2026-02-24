import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var vm: DaemonViewModel

    var body: some View {
        ZStack {
            Color.bgBlack.ignoresSafeArea()

            ScrollView {
                VStack(spacing: 16) {
                    // Settings Card
                    VStack(alignment: .leading, spacing: 16) {
                        Text("SETTINGS")
                            .font(.system(size: 12, weight: .bold, design: .monospaced))
                            .foregroundColor(.orangePrimary)

                        SettingsRow(label: "VERSION", value: "v0.2.0")

                        SettingsRow(
                            label: "NODE ID",
                            value: vm.status.nodeID.isEmpty ? (vm.daemonStarted ? "Starting\u{2026}" : "\u{2014}") : vm.status.nodeID,
                            selectable: true
                        )
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(16)
                    .background(Color.bgCard)
                    .cornerRadius(12)
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(Color.borderCard, lineWidth: 1)
                    )

                    Spacer(minLength: 40)

                    VStack(spacing: 4) {
                        Text("CLAWMINER")
                            .font(.system(size: 12, weight: .bold, design: .monospaced))
                            .foregroundColor(.orangePrimary)
                        Text("$402 Proof-of-Indexing Miner")
                            .font(.system(size: 11, design: .monospaced))
                            .foregroundColor(.textSecondary)
                        Text("b0ase.com")
                            .font(.system(size: 11, design: .monospaced))
                            .foregroundColor(.textDim)
                    }
                    .padding(.bottom, 16)
                }
                .frame(maxWidth: .infinity)
                .padding(16)
            }
        }
    }
}

private struct SettingsRow: View {
    let label: String
    let value: String
    var selectable: Bool = false

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(.system(size: 10, weight: .medium, design: .monospaced))
                .foregroundColor(.textSecondary)
            if selectable {
                Text(value)
                    .font(.system(size: 13, design: .monospaced))
                    .foregroundColor(.white)
                    .textSelection(.enabled)
            } else {
                Text(value)
                    .font(.system(size: 13, design: .monospaced))
                    .foregroundColor(.white)
            }
        }
    }
}
