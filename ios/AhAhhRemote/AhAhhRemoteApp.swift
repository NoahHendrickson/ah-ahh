import SwiftUI

@main
struct AhAhhRemoteApp: App {
    @State private var client = RemoteClient()
    @Environment(\.scenePhase) private var scenePhase
    @AppStorage("keepAwake") private var keepAwake = true

    init() {
        // Artwork is fetched straight from Apple's CDN; keep plenty of it on disk.
        URLCache.shared = URLCache(memoryCapacity: 16 << 20, diskCapacity: 200 << 20)
    }

    var body: some Scene {
        WindowGroup {
            Group {
                if client.pairing == nil {
                    PairingView()
                } else {
                    MainView()
                }
            }
            .environment(client)
            .onOpenURL { client.pair(with: $0) }
            .onChange(of: scenePhase, initial: true) { _, phase in
                client.setActive(phase == .active)
            }
            .onChange(of: keepAwake && scenePhase == .active && client.pairing != nil, initial: true) { _, on in
                UIApplication.shared.isIdleTimerDisabled = on
            }
        }
    }
}

enum Theme {
    static let bg = Color(red: 14 / 255, green: 14 / 255, blue: 17 / 255) // --bg
    static let surface = Color(red: 27 / 255, green: 27 / 255, blue: 33 / 255) // --surface
    static let text2 = Color.white.opacity(0.7)
    static let text3 = Color.white.opacity(0.45)
}

@MainActor func haptic() {
    UIImpactFeedbackGenerator(style: .light).impactOccurred()
}
