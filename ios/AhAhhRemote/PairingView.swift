import AVFoundation
import SwiftUI
import VisionKit

struct PairingView: View {
    @Environment(RemoteClient.self) private var client
    @State private var scanning = false
    @State private var scannerUnavailable = false

    var body: some View {
        VStack(spacing: 0) {
            Spacer()
            Image(systemName: "play.fill")
                .font(.system(size: 34, weight: .bold))
                .foregroundStyle(Theme.bg)
                .offset(x: 3)
                .frame(width: 84, height: 84)
                .background(.white, in: Circle())
                .padding(.bottom, 28)
            Text("ah ahh remote")
                .font(.largeTitle.bold())
            Text("Control the music on your PC without leaving your game.")
                .font(.body)
                .foregroundStyle(Theme.text2)
                .multilineTextAlignment(.center)
                .padding(.top, 8)
            Text("On your PC: **ah ahh → Settings → Phone remote** → turn it on, then scan the code.")
                .font(.callout)
                .foregroundStyle(Theme.text3)
                .multilineTextAlignment(.center)
                .padding(.top, 24)
            Spacer()

            Group {
                if let name = client.pairingName {
                    HStack(spacing: 10) {
                        ProgressView()
                        Text("Connecting to \(name)…")
                    }
                    .foregroundStyle(Theme.text2)
                } else if let error = client.pairingError {
                    Text(error)
                        .foregroundStyle(.orange)
                        .multilineTextAlignment(.center)
                }
            }
            .font(.callout)
            .frame(minHeight: 44)

            Button(action: startScanning) {
                Label("Scan code", systemImage: "qrcode.viewfinder")
                    .font(.headline)
                    .foregroundStyle(Theme.bg)
                    .frame(maxWidth: .infinity, minHeight: 54)
                    .background(.white, in: Capsule())
            }
            .padding(.top, 12)

            if let url = client.retryURL, client.pairingName == nil {
                Button("Try again") { client.pair(with: url) }
                    .font(.headline)
                    .foregroundStyle(.white)
                    .frame(minHeight: 44)
                    .padding(.top, 6)
            }

            Text("Or point the Camera app at the code.")
                .font(.footnote)
                .foregroundStyle(Theme.text3)
                .padding(.top, 12)
        }
        .padding(.horizontal, 28)
        .padding(.bottom, 16)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.bg)
        .foregroundStyle(.white)
        .fullScreenCover(isPresented: $scanning) {
            ScannerScreen { code in
                scanning = false
                if let url = URL(string: code) { client.pair(with: url) }
            }
        }
        .alert("Can't scan here", isPresented: $scannerUnavailable) {
            Button("OK") {}
        } message: {
            Text("Scanning needs camera access (Settings → ah ahh → Camera). You can also point the Camera app at the code.")
        }
    }

    private func startScanning() {
        haptic()
        Task {
            if AVCaptureDevice.authorizationStatus(for: .video) == .notDetermined {
                _ = await AVCaptureDevice.requestAccess(for: .video)
            }
            if DataScannerViewController.isSupported && DataScannerViewController.isAvailable {
                scanning = true
            } else {
                scannerUnavailable = true
            }
        }
    }
}

private struct ScannerScreen: View {
    let onCode: (String) -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        QRScanner(onCode: onCode)
            .ignoresSafeArea()
            .overlay(alignment: .topTrailing) {
                Button { dismiss() } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(.white)
                        .frame(width: 44, height: 44)
                        .background(.black.opacity(0.5), in: Circle())
                }
                .padding()
            }
            .overlay(alignment: .bottom) {
                Text("Scan the code in ah ahh's Settings")
                    .font(.callout.weight(.medium))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 10)
                    .background(.black.opacity(0.5), in: Capsule())
                    .padding(.bottom, 40)
            }
    }
}

private struct QRScanner: UIViewControllerRepresentable {
    let onCode: (String) -> Void

    func makeUIViewController(context: Context) -> DataScannerViewController {
        let scanner = DataScannerViewController(
            recognizedDataTypes: [.barcode(symbologies: [.qr])],
            qualityLevel: .fast,
            isHighlightingEnabled: true
        )
        scanner.delegate = context.coordinator
        return scanner
    }

    func updateUIViewController(_ scanner: DataScannerViewController, context: Context) {
        if !scanner.isScanning { try? scanner.startScanning() }
    }

    func makeCoordinator() -> Coordinator { Coordinator(onCode: onCode) }

    @MainActor final class Coordinator: NSObject, DataScannerViewControllerDelegate {
        let onCode: (String) -> Void
        private var done = false

        init(onCode: @escaping (String) -> Void) { self.onCode = onCode }

        func dataScanner(_ scanner: DataScannerViewController, didAdd addedItems: [RecognizedItem], allItems: [RecognizedItem]) {
            for case .barcode(let code) in addedItems {
                guard !done, let value = code.payloadStringValue, value.hasPrefix("ahahh://") else { continue }
                done = true
                scanner.stopScanning()
                UINotificationFeedbackGenerator().notificationOccurred(.success)
                onCode(value)
            }
        }
    }
}
