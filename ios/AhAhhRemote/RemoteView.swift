import SwiftUI

struct RemoteView: View {
    @Environment(RemoteClient.self) private var client
    @AppStorage("keepAwake") private var keepAwake = true
    @State private var seekDrag: Double? // fraction, while dragging
    @State private var volumeDrag: Double?
    @State private var showQueue = false
    @Environment(\.dismiss) private var dismiss

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
        .sheet(isPresented: $showQueue) {
            QueueView()
                .presentationDetents([.medium, .large])
                .presentationBackground(Theme.bg)
        }
    }

    /// Browsing, Up Next and favorites need a PC new enough to report its queue.
    private var canBrowse: Bool { client.state.queueRevision != nil }

    // MARK: Sections

    private var header: some View {
        HStack(spacing: 8) {
            Button { dismiss() } label: {
                Image(systemName: "chevron.down")
                    .font(.system(size: 17, weight: .semibold))
                    .frame(width: 36, height: 44)
                    .contentShape(Rectangle())
            }
            .accessibilityLabel("Close")
            .foregroundStyle(Theme.text2)
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
            if canBrowse {
                Button { showQueue = true } label: {
                    Image(systemName: "list.bullet")
                        .font(.system(size: 17, weight: .semibold))
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .foregroundStyle(Theme.text2)
                .accessibilityLabel("Up Next")
            }
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
        HStack(spacing: 12) {
            metaText
            if canBrowse && hasItem {
                let favorite = client.state.favorite == true
                Button {
                    haptic()
                    client.setFavorite(!favorite)
                } label: {
                    Image(systemName: favorite ? "heart.fill" : "heart")
                        .font(.system(size: 22, weight: .semibold))
                        .foregroundStyle(favorite ? .white : Theme.text2)
                        .contentTransition(.symbolEffect(.replace))
                        .frame(width: 44, height: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(PressStyle())
                .accessibilityLabel(favorite ? "Unfavorite" : "Favorite")
            }
        }
    }

    private var metaText: some View {
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

// MARK: Up Next

/// The PC's queue: the current song and what's next. Tap a song to jump to it; swipe to remove,
/// or Edit to drag songs into a new order.
struct QueueView: View {
    @Environment(RemoteClient.self) private var client
    @State private var phase: Phase<Queue> = .loading

    var body: some View {
        NavigationStack {
            PhaseView(phase, retry: load) { queue in
                let current = queue.items.filter { $0.index == queue.position }
                let upcoming = queue.items.filter { $0.index > queue.position }
                List {
                    ForEach(current, id: \.index) { row($0, current: true) }
                    Section {
                        ForEach(upcoming, id: \.index) { row($0, current: false) }
                            .onDelete { offsets in remove(offsets.map { upcoming[$0].index }) }
                            .onMove { source, destination in move(upcoming, source, destination) }
                    } header: {
                        if !upcoming.isEmpty { Text("Up Next") }
                    }
                    if queue.items.isEmpty { EmptyNote("Nothing in the queue.").listRowBackground(Color.clear) }
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
            }
            .page()
            .navigationTitle("Up Next")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { EditButton() }
        }
        // Reloads whenever the PC says the queue changed.
        .task(id: client.state.queueRevision) { await load() }
    }

    private func row(_ item: Queue.Item, current: Bool) -> some View {
        Button { client.jumpTo(item.index) } label: {
            HStack(spacing: 12) {
                ArtworkImage(url: item.artwork, points: 44, radius: 4)
                    .frame(width: 44, height: 44)
                VStack(alignment: .leading, spacing: 2) {
                    Text(item.title).foregroundStyle(.white)
                    Text(item.artist).font(.subheadline).foregroundStyle(Theme.text2)
                }
                .lineLimit(1)
                Spacer()
                if current {
                    Image(systemName: "waveform")
                        .font(.system(size: 15, weight: .semibold))
                        .symbolEffect(.variableColor.iterative, isActive: client.state.playing)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(RowStyle())
        .listRowBackground(current ? Theme.surface : Color.clear)
        .listRowSeparator(.hidden)
        .listRowInsets(EdgeInsets(top: 6, leading: 20, bottom: 6, trailing: 20))
    }

    /// Removes songs right away here; the PC's queue change then reloads the real list.
    private func remove(_ indexes: [Int]) {
        guard var queue = phase.value else { return }
        // Highest first, so earlier removals don't shift the later indexes.
        for index in indexes.sorted(by: >) {
            client.removeFromQueue(index)
            queue.items.removeAll { $0.index == index }
            for i in queue.items.indices where queue.items[i].index > index { queue.items[i].index -= 1 }
        }
        phase = .loaded(queue)
    }

    /// `destination` is a gap in `upcoming` (before removal), like List's onMove.
    private func move(_ upcoming: [Queue.Item], _ source: IndexSet, _ destination: Int) {
        guard var queue = phase.value, let offset = source.first else { return }
        let to = destination > offset ? destination - 1 : destination
        guard to != offset else { return }
        client.moveInQueue(from: upcoming[offset].index, to: upcoming[to].index)
        var items = upcoming
        items.move(fromOffsets: source, toOffset: destination)
        let first = upcoming[0].index
        for i in items.indices { items[i].index = first + i }
        queue.items = queue.items.filter { $0.index <= queue.position } + items
        phase = .loaded(queue)
    }

    private func load() async {
        do {
            phase = .loaded(try await client.queue())
        } catch is CancellationError {
        } catch {
            if phase.value == nil { phase = .failed(error.localizedDescription) }
        }
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
