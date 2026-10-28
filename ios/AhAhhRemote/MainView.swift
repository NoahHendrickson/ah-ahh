import SwiftUI

/// Once paired: Home / Search / Library tabs with a mini player above the tab bar.
struct MainView: View {
    @State private var nowPlaying = false

    var body: some View {
        TabView {
            tab("Home", "house.fill") { HomeView() }
            tab("Search", "magnifyingglass") { SearchView() }
            tab("Library", "square.stack.fill") { LibraryView() }
        }
        .tint(.white)
        .miniPlayerAccessory { MiniPlayer { nowPlaying = true } }
        .sheet(isPresented: $nowPlaying) {
            RemoteView()
                .presentationBackground(Theme.bg)
        }
    }

    private func tab(_ title: String, _ symbol: String, @ViewBuilder content: () -> some View) -> some View {
        NavigationStack {
            content().resourceDestinations()
        }
        .miniPlayerInset { MiniPlayer { nowPlaying = true } }
        .tabItem { Label(title, systemImage: symbol) }
    }
}

private extension View {
    /// iOS 26+: the system's tab bar accessory.
    @ViewBuilder func miniPlayerAccessory(@ViewBuilder _ content: () -> some View) -> some View {
        if #available(iOS 26, *) {
            tabViewBottomAccessory(content: content)
        } else {
            self
        }
    }

    /// Before iOS 26: a bar pinned above each tab's tab bar.
    @ViewBuilder func miniPlayerInset(@ViewBuilder _ content: () -> some View) -> some View {
        if #available(iOS 26, *) {
            self
        } else {
            safeAreaInset(edge: .bottom, spacing: 0) {
                content()
                    .frame(height: 56)
                    .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .padding(.horizontal, 8)
                    .padding(.bottom, 6)
            }
        }
    }
}

struct MiniPlayer: View {
    @Environment(RemoteClient.self) private var client
    let open: () -> Void

    private var hasItem: Bool { client.state.title != nil }

    var body: some View {
        HStack(spacing: 12) {
            Group {
                if let image = client.artwork, hasItem {
                    Image(uiImage: image).resizable().scaledToFill()
                } else {
                    ZStack {
                        Theme.surface
                        Image(systemName: "music.note").font(.system(size: 14)).foregroundStyle(Theme.text3)
                    }
                }
            }
            .frame(width: 36, height: 36)
            .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))

            VStack(alignment: .leading, spacing: 1) {
                Text(client.state.title ?? (client.connected ? "Nothing playing" : "Connecting…"))
                    .font(.subheadline.weight(.semibold))
                Text(client.connected ? client.state.artist : "Reconnecting to \(client.pairing?.name ?? "your PC")…")
                    .font(.caption)
                    .foregroundStyle(Theme.text2)
            }
            .lineLimit(1)
            .frame(maxWidth: .infinity, alignment: .leading)

            Button {
                haptic()
                client.togglePlay()
            } label: {
                Image(systemName: client.state.playing ? "pause.fill" : "play.fill")
                    .font(.system(size: 20))
                    .contentTransition(.symbolEffect(.replace))
                    .frame(width: 40, height: 40)
                    .contentShape(Rectangle())
            }
            .disabled(!hasItem)
            .accessibilityLabel(client.state.playing ? "Pause" : "Play")
            Button {
                haptic()
                client.next()
            } label: {
                Image(systemName: "forward.fill")
                    .font(.system(size: 18))
                    .frame(width: 40, height: 40)
                    .contentShape(Rectangle())
            }
            .disabled(!hasItem)
            .accessibilityLabel("Next")
        }
        .buttonStyle(.plain)
        .foregroundStyle(.white)
        .padding(.leading, 12)
        .padding(.trailing, 6)
        .frame(maxHeight: .infinity)
        .contentShape(Rectangle())
        .onTapGesture(perform: open)
        .accessibilityAction(named: "Now Playing", open)
    }
}
