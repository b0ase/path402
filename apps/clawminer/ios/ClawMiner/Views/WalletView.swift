import SwiftUI
import CoreImage.CIFilterBuiltins

struct WalletView: View {
    @EnvironmentObject var vm: DaemonViewModel
    @State private var showGenerateAlert = false
    @State private var showExportSheet = false
    @State private var showScanner = false
    @State private var exportedWIF: String?

    var body: some View {
        ZStack {
            Color.bgBlack.ignoresSafeArea()

            ScrollView {
                VStack(spacing: 16) {
                    // Wallet Card
                    VStack(alignment: .leading, spacing: 12) {
                        Text("WALLET")
                            .font(.system(size: 12, weight: .bold, design: .monospaced))
                            .foregroundColor(.orangePrimary)

                        WalletField(label: "ADDRESS", value: vm.status.walletAddress)
                        WalletField(label: "PUBLIC KEY", value: vm.status.walletPubKey)

                        if !vm.walletStatusMessage.isEmpty {
                            Text(vm.walletStatusMessage)
                                .font(.system(size: 11, design: .monospaced))
                                .foregroundColor(.textSecondary)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(16)
                    .background(Color.bgCard)
                    .cornerRadius(12)
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(Color.borderCard, lineWidth: 1)
                    )

                    // Buttons
                    VStack(spacing: 12) {
                        WalletButton(title: "Generate New Wallet", icon: "plus.circle.fill") {
                            showGenerateAlert = true
                        }

                        WalletButton(title: "Import QR", icon: "qrcode.viewfinder") {
                            showScanner = true
                        }

                        WalletButton(title: "Export WIF QR", icon: "qrcode") {
                            vm.exportWIF { wif in
                                if let wif = wif {
                                    exportedWIF = wif
                                    showExportSheet = true
                                }
                            }
                        }
                    }
                }
                .padding(16)
            }
        }
        .alert("Generate New Wallet", isPresented: $showGenerateAlert) {
            Button("Cancel", role: .cancel) {}
            Button("Generate", role: .destructive) {
                vm.generateWallet()
            }
        } message: {
            Text("This will replace your current wallet. Back up your WIF first.")
        }
        .sheet(isPresented: $showScanner) {
            QRScannerView { code in
                showScanner = false
                if let code = code {
                    vm.importWallet(code)
                }
            }
        }
        .sheet(isPresented: $showExportSheet) {
            if let wif = exportedWIF {
                QRExportView(wif: wif)
            }
        }
    }
}

private struct WalletField: View {
    let label: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(.system(size: 10, weight: .medium, design: .monospaced))
                .foregroundColor(.textSecondary)
            Text(value.isEmpty ? "\u{2014}" : value)
                .font(.system(size: 12, design: .monospaced))
                .foregroundColor(.white)
                .textSelection(.enabled)
                .lineLimit(2)
        }
    }
}

private struct WalletButton: View {
    let title: String
    let icon: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack {
                Image(systemName: icon)
                    .font(.system(size: 16))
                Text(title)
                    .font(.system(size: 14, weight: .semibold, design: .monospaced))
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.system(size: 12))
                    .foregroundColor(.textSecondary)
            }
            .foregroundColor(.orangePrimary)
            .padding(14)
            .background(Color.bgCard)
            .cornerRadius(10)
            .overlay(
                RoundedRectangle(cornerRadius: 10)
                    .stroke(Color.borderCard, lineWidth: 1)
            )
        }
    }
}

struct QRExportView: View {
    let wif: String
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack {
            Color.bgBlack.ignoresSafeArea()

            VStack(spacing: 20) {
                Text("PRIVATE KEY")
                    .font(.system(size: 14, weight: .bold, design: .monospaced))
                    .foregroundColor(.orangePrimary)

                Text("Never share this with anyone")
                    .font(.system(size: 12, design: .monospaced))
                    .foregroundColor(.redError)

                if let image = generateQRCode(from: wif) {
                    Image(uiImage: image)
                        .interpolation(.none)
                        .resizable()
                        .scaledToFit()
                        .frame(width: 240, height: 240)
                        .padding(16)
                        .background(Color.white)
                        .cornerRadius(12)
                }

                Text(wif)
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundColor(.textSecondary)
                    .textSelection(.enabled)
                    .lineLimit(3)
                    .padding(.horizontal)

                Button("Close") {
                    dismiss()
                }
                .font(.system(size: 14, weight: .semibold, design: .monospaced))
                .foregroundColor(.orangePrimary)
                .padding(.vertical, 12)
                .padding(.horizontal, 40)
                .background(Color.bgCard)
                .cornerRadius(8)
                .overlay(
                    RoundedRectangle(cornerRadius: 8)
                        .stroke(Color.orangePrimary.opacity(0.3), lineWidth: 1)
                )
            }
            .padding(24)
        }
    }

    private func generateQRCode(from string: String) -> UIImage? {
        let context = CIContext()
        let filter = CIFilter.qrCodeGenerator()
        filter.message = Data(string.utf8)
        filter.correctionLevel = "M"

        guard let output = filter.outputImage else { return nil }
        let scale = 240.0 / output.extent.width
        let scaled = output.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
        guard let cgImage = context.createCGImage(scaled, from: scaled.extent) else { return nil }
        return UIImage(cgImage: cgImage)
    }
}
