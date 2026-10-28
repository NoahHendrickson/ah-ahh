import SwiftUI

// MARK: Apple Music API JSON (as the PC passes it through). Decoded tolerantly: bad fields become nil.

/// A song, album, playlist, artist, station, or library-* item.
struct Resource: Decodable, Identifiable, Hashable, Sendable {
    let id: String
    let type: String
    let attributes: Attributes
    let views: [String: Page]

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        type = (try? c.decode(String.self, forKey: .type)) ?? ""
        attributes = (try? c.decode(Attributes.self, forKey: .attributes)) ?? Attributes()
        views = (try? c.decode([String: Page].self, forKey: .views)) ?? [:]
    }

    private enum CodingKeys: String, CodingKey { case id, type, attributes, views }

    static func == (a: Resource, b: Resource) -> Bool { a.id == b.id && a.type == b.type }
    func hash(into h: inout Hasher) {
        h.combine(id)
        h.combine(type)
    }

    var name: String { attributes.name ?? "" }
    var isPlayable: Bool { attributes.playParams }
    var isSong: Bool { type == "songs" || type == "library-songs" }
    var isLibrary: Bool { type.hasPrefix("library-") }
    /// Albums and playlists open a detail screen; so do artists.
    var opens: Bool { type.hasSuffix("albums") || type.hasSuffix("playlists") || type == "artists" }
    /// Can be handed to the `playItem` command.
    var canPlay: Bool { opens ? type != "artists" : type == "stations" || isSong }

    var subtitle: String {
        if type == "artists" { return "Artist" }
        if type == "stations" { return "Station" }
        if type.hasSuffix("playlists") { return attributes.curatorName ?? "Playlist" }
        return attributes.artistName ?? ""
    }
}

struct Attributes: Decodable, Sendable {
    var name: String?
    var artistName: String?
    var albumName: String?
    var curatorName: String?
    var artwork: Artwork?
    var durationInMillis: Double?
    var trackNumber: Int?
    var contentRating: String?
    var releaseDate: String?
    var genreNames: [String]?
    var description: Notes?
    var editorialNotes: Notes?
    /// Only whether it's there matters: items without playParams can't be played.
    var playParams = false

    init() {}

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        func get<T: Decodable>(_ key: CodingKeys) -> T? { try? c.decodeIfPresent(T.self, forKey: key) }
        name = get(.name)
        artistName = get(.artistName)
        albumName = get(.albumName)
        curatorName = get(.curatorName)
        artwork = get(.artwork)
        durationInMillis = get(.durationInMillis)
        trackNumber = (get(.trackNumber) as Double?).map { Int($0) }
        contentRating = get(.contentRating)
        releaseDate = get(.releaseDate)
        genreNames = get(.genreNames)
        description = get(.description)
        editorialNotes = get(.editorialNotes)
        playParams = c.contains(.playParams)
    }

    private enum CodingKeys: String, CodingKey {
        case name, artistName, albumName, curatorName, artwork, durationInMillis, trackNumber, contentRating
        case releaseDate, genreNames, description, editorialNotes, playParams
    }

    struct Notes: Decodable, Sendable {
        var standard: String?
        var short: String?
    }
}

struct Artwork: Decodable, Sendable {
    var url: String

    /// The URL for a square image `px` pixels wide.
    func url(_ px: Int) -> String { artworkURL(url, px) }
}

func artworkURL(_ template: String, _ px: Int) -> String {
    template.replacingOccurrences(of: "{w}", with: "\(px)")
        .replacingOccurrences(of: "{h}", with: "\(px)")
        .replacingOccurrences(of: "{f}", with: "jpg")
}

/// A collection response (or a relationship / view): `data` plus the `next` page's href.
struct Page: Decodable, Sendable {
    var data: [Resource] = []
    var next: String?

    init() {}

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        data = ((try? c.decode([Lossy<Resource>].self, forKey: .data)) ?? []).compactMap(\.value)
        next = try? c.decode(String.self, forKey: .next)
    }

    private enum CodingKeys: String, CodingKey { case data, next }
}

struct SearchResponse: Decodable, Sendable {
    struct Results: Decodable, Sendable {
        var songs: Page?
        var albums: Page?
        var artists: Page?
        var playlists: Page?
    }

    var results: Results
}

/// Skips an element that doesn't decode instead of failing the whole list.
private struct Lossy<T: Decodable>: Decodable {
    let value: T?
    init(from decoder: Decoder) throws { value = try? T(from: decoder) }
}

/// GET /v1/queue: the current song and what's up next. `index` is absolute.
struct Queue: Decodable, Sendable {
    struct Item: Decodable, Sendable {
        var index: Int
        var id: String
        var title: String
        var artist: String
        var artwork: String?
    }

    var position: Int
    var items: [Item]
}

/// Apple's descriptions contain light HTML (<br>, <i>); show them as text.
func plainText(_ html: String?) -> String? {
    guard let html else { return nil }
    let text = html.replacing(/<br\s*\/?>/.ignoresCase(), with: "\n").replacing(/<[^>]+>/, with: "")
        .replacingOccurrences(of: "&amp;", with: "&").replacingOccurrences(of: "&quot;", with: "\"")
        .replacingOccurrences(of: "&#39;", with: "'").trimmingCharacters(in: .whitespacesAndNewlines)
    return text.isEmpty ? nil : text
}

func formatDuration(_ ms: Double) -> String {
    let s = Int(ms / 1000)
    return "\(s / 60):" + String(format: "%02d", s % 60)
}

// MARK: Artwork images

/// Downloaded artwork, kept in memory (and on disk by URLCache) so scrolling back is instant.
@MainActor final class ImageCache {
    static let shared = ImageCache()
    private let images = NSCache<NSString, UIImage>()
    private var loading: [String: Task<UIImage?, Never>] = [:]

    func cached(_ url: String) -> UIImage? { images.object(forKey: url as NSString) }

    func load(_ url: String) async -> UIImage? {
        if let image = cached(url) { return image }
        if let task = loading[url] { return await task.value }
        guard let u = URL(string: url) else { return nil }
        let task = Task<UIImage?, Never> {
            guard let data = try? await URLSession.shared.data(from: u).0 else { return nil }
            return await Task.detached { await UIImage(data: data)?.byPreparingForDisplay() }.value
        }
        loading[url] = task
        let image = await task.value
        loading[url] = nil
        if let image { images.setObject(image, forKey: url as NSString) }
        return image
    }
}

/// Square artwork from an Apple `{w}x{h}` template. Size it with a frame; `points` picks the resolution.
struct ArtworkImage: View {
    let url: String?
    var points: CGFloat
    var round = false
    var radius: CGFloat = 6
    @Environment(\.displayScale) private var scale
    @State private var image: UIImage?

    var body: some View {
        let src = url.map { artworkURL($0, Int(points * scale)) }
        Color.clear
            .aspectRatio(1, contentMode: .fit)
            .overlay {
                if let image = image ?? src.flatMap(ImageCache.shared.cached) {
                    Image(uiImage: image).resizable().scaledToFill()
                } else {
                    ZStack {
                        Theme.surface
                        Image(systemName: round ? "person.fill" : "music.note")
                            .font(.system(size: points * 0.3))
                            .foregroundStyle(Theme.text3)
                    }
                }
            }
            .clipShape(RoundedRectangle(cornerRadius: round ? points : radius, style: .continuous))
            .task(id: src) {
                guard let src else { return }
                image = await ImageCache.shared.load(src)
            }
    }
}

// MARK: Shared views

/// What a screen's data is doing.
enum Phase<T> {
    case loading
    case failed(String)
    case loaded(T)

    var value: T? {
        if case .loaded(let v) = self { return v }
        return nil
    }
}

struct LoadingView: View {
    var body: some View {
        ProgressView()
            .controlSize(.large)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 60)
    }
}

struct ErrorView: View {
    let message: String
    let retry: () async -> Void

    var body: some View {
        VStack(spacing: 14) {
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 28))
                .foregroundStyle(Theme.text3)
            Text(message)
                .font(.callout)
                .foregroundStyle(Theme.text2)
                .multilineTextAlignment(.center)
            Button("Try Again") { Task { await retry() } }
                .font(.headline)
                .buttonStyle(.bordered)
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 32)
        .padding(.vertical, 50)
    }
}

struct EmptyNote: View {
    let text: String
    init(_ text: String) { self.text = text }

    var body: some View {
        Text(text)
            .font(.callout)
            .foregroundStyle(Theme.text3)
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
            .padding(.horizontal, 32)
            .padding(.vertical, 50)
    }
}

/// Shows a Phase: spinner, error with Retry, or the content.
struct PhaseView<T, Content: View>: View {
    let phase: Phase<T>
    let retry: () async -> Void
    @ViewBuilder let content: (T) -> Content

    init(_ phase: Phase<T>, retry: @escaping () async -> Void, @ViewBuilder content: @escaping (T) -> Content) {
        self.phase = phase
        self.retry = retry
        self.content = content
    }

    var body: some View {
        switch phase {
        case .loading: LoadingView()
        case .failed(let message): ErrorView(message: message, retry: retry)
        case .loaded(let value): content(value)
        }
    }
}

struct SectionTitle: View {
    let title: String
    init(_ title: String) { self.title = title }

    var body: some View {
        Text(title)
            .font(.title3.bold())
            .padding(.horizontal, 20)
    }
}

/// One song row: number or artwork, title / artist, duration. Long-press for Play Next.
struct TrackRow: View {
    @Environment(RemoteClient.self) private var client
    let track: Resource
    var number: Int?
    let play: () -> Void

    var body: some View {
        let a = track.attributes
        let current = client.state.title == a.name && client.state.artist == (a.artistName ?? "")
        Button(action: play) {
            HStack(spacing: 12) {
                Group {
                    if let number {
                        ZStack {
                            if current {
                                playingIcon
                            } else {
                                Text("\(number)").font(.callout.monospacedDigit()).foregroundStyle(Theme.text3)
                            }
                        }
                        .frame(width: 28)
                    } else {
                        ArtworkImage(url: a.artwork?.url, points: 44, radius: 4)
                            .frame(width: 44, height: 44)
                            .overlay {
                                if current {
                                    ZStack {
                                        Color.black.opacity(0.45)
                                        playingIcon
                                    }
                                    .clipShape(RoundedRectangle(cornerRadius: 4))
                                }
                            }
                    }
                }
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 5) {
                        Text(track.name)
                            .font(.body)
                            .foregroundStyle(.white)
                        if a.contentRating == "explicit" {
                            Text("E")
                                .font(.system(size: 9, weight: .bold))
                                .foregroundStyle(Theme.bg)
                                .frame(width: 13, height: 13)
                                .background(Theme.text3, in: RoundedRectangle(cornerRadius: 2))
                        }
                    }
                    if let artist = a.artistName {
                        Text(artist)
                            .font(.subheadline)
                            .foregroundStyle(Theme.text2)
                    }
                }
                .lineLimit(1)
                Spacer(minLength: 8)
                if let ms = a.durationInMillis {
                    Text(formatDuration(ms))
                        .font(.footnote.monospacedDigit())
                        .foregroundStyle(Theme.text3)
                }
            }
            .padding(.horizontal, 20)
            .padding(.vertical, number == nil ? 6 : 11)
            .contentShape(Rectangle())
        }
        .buttonStyle(RowStyle())
        .disabled(!track.isPlayable)
        .opacity(track.isPlayable ? 1 : 0.4)
        .contextMenu {
            if track.isPlayable {
                Button("Play", systemImage: "play", action: play)
                if track.isSong {
                    Button("Play Next", systemImage: "text.line.first.and.arrowtriangle.forward") { client.playNext(track) }
                }
            }
        }
    }

    private var playingIcon: some View {
        Image(systemName: "waveform")
            .font(.system(size: 15, weight: .semibold))
            .foregroundStyle(.white)
            .symbolEffect(.variableColor.iterative, isActive: client.state.playing)
    }
}

/// Artwork card for albums, playlists, artists and stations: opens it, or plays a station.
struct Card: View {
    @Environment(RemoteClient.self) private var client
    let item: Resource
    var width: CGFloat?

    var body: some View {
        Group {
            if item.opens {
                NavigationLink(value: item) { label }
            } else {
                Button { client.play(item) } label: { label }
                    .disabled(!item.canPlay)
            }
        }
        .buttonStyle(RowStyle())
        .contextMenu {
            if item.canPlay {
                Button("Play", systemImage: "play") { client.play(item) }
                if !item.isSong && item.type != "stations" {
                    Button("Shuffle", systemImage: "shuffle") { client.play(item, shuffle: true) }
                }
            }
        }
    }

    private var label: some View {
        VStack(alignment: item.type == "artists" ? .center : .leading, spacing: 2) {
            ArtworkImage(url: item.attributes.artwork?.url, points: width ?? 180, round: item.type == "artists", radius: 8)
                .padding(.bottom, 5)
            Text(item.name)
                .font(.subheadline.weight(.medium))
                .foregroundStyle(.white)
            Text(item.subtitle)
                .font(.footnote)
                .foregroundStyle(Theme.text3)
        }
        .lineLimit(1)
        .frame(width: width)
        .contentShape(Rectangle())
    }
}

/// A titled horizontal row of cards (Home, Search, Artist).
struct Shelf: View {
    let title: String
    let items: [Resource]
    init(_ title: String, _ items: [Resource]) {
        self.title = title
        self.items = items
    }

    var body: some View {
        if !items.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                SectionTitle(title)
                ScrollView(.horizontal, showsIndicators: false) {
                    LazyHStack(alignment: .top, spacing: 14) {
                        ForEach(items) { Card(item: $0, width: 150) }
                    }
                    .padding(.horizontal, 20)
                }
            }
        }
    }
}

/// A two-column grid of cards (Library albums / playlists).
struct CardGrid: View {
    let items: [Resource]
    var onLast: (() -> Void)?

    var body: some View {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 16), GridItem(.flexible(), spacing: 16)], spacing: 20) {
            ForEach(items) { item in
                Card(item: item)
                    .onAppear { if item == items.last { onLast?() } }
            }
        }
        .padding(.horizontal, 20)
    }
}

struct RowStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .background(configuration.isPressed ? Color.white.opacity(0.06) : .clear)
            .opacity(configuration.isPressed ? 0.75 : 1)
    }
}

/// Primary (white) and secondary pill buttons, like the desktop's .btn.
struct PillButton: View {
    let title: String
    let symbol: String
    var primary = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Label(title, systemImage: symbol)
                .font(.headline)
                .foregroundStyle(primary ? Theme.bg : .white)
                .frame(maxWidth: .infinity, minHeight: 46)
                .background(primary ? Color.white : Theme.surface, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}

extension View {
    /// Dark page background shared by every browsing screen.
    func page() -> some View {
        background(Theme.bg.ignoresSafeArea())
            .foregroundStyle(.white)
    }
}
