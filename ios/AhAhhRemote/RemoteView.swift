import SwiftUI

struct RemoteView: View {
    @Environment(RemoteClient.self) private var client
    @AppStorage("keepAwake") private var keepAwake = true
    @State private var seekDrag: Double? // fraction, while dragging
    @State private var volumeDrag: Double?

    private var hasItem: Bool { client.state.title != nil }

    var body: some View {
        VStack(spacing: 0) {
            header
            Spacer(minLength: 12)
            artwork
                .padding(.horizontal, 8)
            Spacer(minLength: 20)
            meta
            scrubber
                .padding(.top, 14)
            controls
                .padding(.top, 10)
            volume
                .padding(.top, 18)
        }
        .padding(.horizontal, 24)
        .padding(.bottom, 12)
        .foregroundStyle(.white)
        .background { backdrop }
    }

    // MARK: Sections

    private var header: some View {
        HStack(spacing: 8) {
            Circle()
                .fill(client.connected ? Color.green : Color.orange)
                .frame(width: 8, height: 8)
            Text(client.pairing?.name ?? "")
                .font(.subheadline.weight(.semibold))
                .lineLimit(1)
            if !client.connected {
                Text("Reconnecting…")
                    .font(.subheadline)
                    .foregroundStyle(Theme.text3)
            }
            Spacer()
            Menu {
                Toggle("Keep screen awake", systemImage: "sun.max", isOn: $keepAwake)
                Button("Forget this PC", systemImage: "xmark.circle", role: .destructive) {
                    client.forget()
                }
            } label: {
                Image(systemName: "ellipsis")
                    .font(.system(size: 17, weight: .semibold))
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .foregroundStyle(Theme.text2)
        }
        .frame(height: 44)
    }

    private var artwork: some View {
        Color.clear
            .aspectRatio(1, contentMode: .fit)
            .overlay {
                if let image = client.artwork, hasItem {
                    Image(uiImage: image)
                        .resizable()
                        .scaledToFill()
                } else {
                    ZStack {
                        Theme.surface
                        Image(systemName: "music.note")
                            .font(.system(size: 64))
                            .foregroundStyle(Theme.text3)
                    }
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .shadow(color: .black.opacity(0.45), radius: 24, y: 12)
            .frame(maxWidth: .infinity)
    }

    private var meta: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(client.state.title ?? (client.connected ? "Nothing playing" : "Connecting…"))
                .font(.title2.weight(.bold))
            Text(client.state.artist.isEmpty ? " " : client.state.artist)
                .font(.body)
                .foregroundStyle(Theme.text2)
            Text(client.state.album.isEmpty ? " " : client.state.album)
                .font(.subheadline)
                .foregroundStyle(Theme.text3)
        }
        .lineLimit(1)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var scrubber: some View {
        let duration = client.state.durationMs / 1000
        return TimelineView(.animation(minimumInterval: 0.1, paused: !client.state.playing || seekDrag != nil)) { context in
            let position = seekDrag.map { $0 * duration } ?? client.position(at: context.date)
            VStack(spacing: 2) {
                BarSlider(value: duration > 0 ? position / duration : 0, drag: $seekDrag) { fraction in
                    client.seek(to: fraction * duration)
                }
                HStack {
                    Text(formatTime(position))
                    Spacer()
                    Text(formatTime(duration))
                }
                .font(.caption.monospacedDigit())
                .foregroundStyle(Theme.text3)
            }
        }
        .disabled(!hasItem || duration <= 0)
    }

    private var controls: some View {
        HStack {
            ToggleButton(symbol: "shuffle", active: client.state.shuffle) { client.toggleShuffle() }
            Spacer()
            ControlButton(symbol: "backward.fill", size: 30) { client.previous() }
                .disabled(!hasItem)
            Spacer()
            Button {
                haptic()
                client.togglePlay()
            } label: {
                Image(systemName: client.state.playing ? "pause.fill" : "play.fill")
                    .font(.system(size: 32, weight: .bold))
                    .foregroundStyle(Theme.bg)
                    .contentTransition(.symbolEffect(.replace))
                    .frame(width: 78, height: 78)
                    .background(.white, in: Circle())
            }
            .buttonStyle(PressStyle())
            .disabled(!hasItem)
            Spacer()
            ControlButton(symbol: "forward.fill", size: 30) { client.next() }
                .disabled(!hasItem)
            Spacer()
            ToggleButton(symbol: client.state.repeat == 1 ? "repeat.1" : "repeat", active: client.state.repeat != 0) {
                client.cycleRepeat()
            }
        }
    }

    private var volume: some View {
        HStack(spacing: 12) {
            Image(systemName: "speaker.fill")
            BarSlider(value: client.state.volume, drag: $volumeDrag, onChange: { client.setVolume($0, final: false) }) {
                client.setVolume($0, final: true)
            }
            Image(systemName: "speaker.wave.3.fill")
        }
        .font(.footnote)
        .foregroundStyle(Theme.text3)
    }

    private var backdrop: some View {
        ZStack {
            Theme.bg
            if let image = client.artwork, hasItem {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFill()
                    .blur(radius: 60)
                    .opacity(0.55)
                    .clipped()
            }
            LinearGradient(colors: [Theme.bg.opacity(0.2), Theme.bg.opacity(0.85)], startPoint: .top, endPoint: .bottom)
        }
        .ignoresSafeArea()
    }
}

private func formatTime(_ seconds: Double) -> String {
    let s = Int(max(seconds, 0))
    return "\(s / 60):" + String(format: "%02d", s % 60)
}

// MARK: Controls

/// Thin bar like the desktop slider; thickens while dragging. Reports the final value on release.
private struct BarSlider: View {
    var value: Double
    @Binding var drag: Double?
    var onChange: ((Double) -> Void)?
    var onEnd: (Double) -> Void
    @Environment(\.isEnabled) private var isEnabled

    var body: some View {
        GeometryReader { geo in
            let fraction = min(max(drag ?? value, 0), 1)
            let width = max(geo.size.width, 1)
            ZStack(alignment: .leading) {
                Capsule().fill(.white.opacity(0.16))
                Capsule().fill(.white.opacity(isEnabled ? 1 : 0.4)).frame(width: fraction * width)
            }
            .frame(height: drag == nil ? 5 : 10)
            .frame(maxHeight: .infinity)
            .contentShape(Rectangle())
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { g in
                        let f = min(max(g.location.x / width, 0), 1)
                        drag = f
                        onChange?(f)
                    }
                    .onEnded { g in
                        let f = min(max(g.location.x / width, 0), 1)
                        drag = nil
                        onEnd(f)
                    }
            )
            .animation(.easeOut(duration: 0.15), value: drag == nil)
        }
        .frame(height: 30)
    }
}

private struct ControlButton: View {
    let symbol: String
    let size: CGFloat
    let action: () -> Void
    @Environment(\.isEnabled) private var isEnabled

    var body: some View {
        Button {
            haptic()
            action()
        } label: {
            Image(systemName: symbol)
                .font(.system(size: size))
                .frame(width: 64, height: 64)
                .contentShape(Rectangle())
                .opacity(isEnabled ? 1 : 0.35)
        }
        .buttonStyle(PressStyle())
    }
}

/// Shuffle / repeat: dim when off, white with a dot when on (like the desktop .icon-btn.active).
private struct ToggleButton: View {
    let symbol: String
    let active: Bool
    let action: () -> Void

    var body: some View {
        Button {
            haptic()
            action()
        } label: {
            Image(systemName: symbol)
                .font(.system(size: 20, weight: .semibold))
                .foregroundStyle(active ? .white : Theme.text3)
                .frame(width: 48, height: 48)
                .overlay(alignment: .bottom) {
                    if active {
                        Circle().fill(.white).frame(width: 4, height: 4).offset(y: -4)
                    }
                }
                .contentShape(Rectangle())
        }
        .buttonStyle(PressStyle())
    }
}

private struct PressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.9 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}
