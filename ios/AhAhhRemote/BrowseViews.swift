import SwiftUI

// Mirrors the desktop views in src/views (same requests, same play behavior).

extension View {
    /// Album / playlist / artist screens, pushed from any tab.
    func resourceDestinations() -> some View {
        navigationDestination(for: Resource.self) { item in
            if item.type == "artists" {
                ArtistView(item: item)
            } else {
                CollectionView(item: item)
            }
        }
    }
}

// MARK: Home

struct HomeView: View {
    @Environment(RemoteClient.self) private var client
    @State private var phase: Phase<(recent: [Resource], tracks: [Resource], added: [Resource])> = .loading

    var body: some View {
        ScrollView {
            PhaseView(phase, retry: { await load(refresh: true) }) { d in
                LazyVStack(alignment: .leading, spacing: 30) {
                    Shelf("Jump Back In", d.recent)
                    if !d.tracks.isEmpty {
                        VStack(alignment: .leading, spacing: 6) {
                            SectionTitle("Recently Played Songs")
                            ForEach(Array(d.tracks.enumerated()), id: \.offset) { i, track in
                                TrackRow(track: track) { client.play(songs: d.tracks, startWith: i) }
                            }
                        }
                    }
                    Shelf("Recently Added", d.added)
                    if d.recent.isEmpty && d.tracks.isEmpty && d.added.isEmpty {
                        EmptyNote("Nothing here yet. Play something on your PC or add music to your library.")
                    }
                }
                .padding(.vertical, 8)
            }
        }
        .page()
        .navigationTitle(greeting())
        .refreshable { await load(refresh: true) }
        .task { if phase.value == nil { await load() } }
    }

    private func load(refresh: Bool = false) async {
        // One request per section (10 and 25 are the endpoints' page-size limits).
        async let recent = try? client.page("/v1/me/recent/played", params: ["limit": "10"], refresh: refresh)
        async let tracks = try? client.page("/v1/me/recent/played/tracks", params: ["limit": "10", "types": "songs,library-songs"], refresh: refresh)
        async let added = client.page("/v1/me/library/recently-added", params: ["limit": "25"], refresh: refresh)
        do {
            let a = try await added
            phase = .loaded((await recent?.data ?? [], await tracks?.data ?? [], a.data))
        } catch is CancellationError {
        } catch {
            if phase.value == nil { phase = .failed(error.localizedDescription) }
        }
    }

    private func greeting() -> String {
        let h = Calendar.current.component(.hour, from: Date())
        return h < 5 ? "Late night" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"
    }
}

// MARK: Search

struct SearchView: View {
    @Environment(RemoteClient.self) private var client
    @State private var query = ""
    @State private var results: SearchResponse.Results?
    @State private var error: String?
    @State private var retries = 0

    private var term: String { query.trimmingCharacters(in: .whitespaces) }

    var body: some View {
        ScrollView {
            if term.isEmpty {
                EmptyNote("Search all of Apple Music.")
            } else if let error {
                ErrorView(message: error) { retries += 1 }
            } else if let r = results {
                content(r)
            } else {
                LoadingView()
            }
        }
        .scrollDismissesKeyboard(.immediately)
        .page()
        .navigationTitle("Search")
        .searchable(text: $query, placement: .navigationBarDrawer(displayMode: .always), prompt: "Artists, songs, albums, playlists")
        .task(id: "\(term)#\(retries)") { await search(term) }
    }

    @ViewBuilder private func content(_ r: SearchResponse.Results) -> some View {
        let songs = r.songs?.data ?? []
        let artists = r.artists?.data ?? []
        let albums = r.albums?.data ?? []
        let playlists = r.playlists?.data ?? []
        if songs.isEmpty && artists.isEmpty && albums.isEmpty && playlists.isEmpty {
            EmptyNote("No results for “\(term)”.")
        } else {
            LazyVStack(alignment: .leading, spacing: 30) {
                if !songs.isEmpty {
                    VStack(alignment: .leading, spacing: 6) {
                        SectionTitle("Songs")
                        ForEach(Array(songs.prefix(10).enumerated()), id: \.offset) { i, song in
                            TrackRow(track: song) { client.play(songs: songs, startWith: i) }
                        }
                    }
                }
                Shelf("Artists", artists)
                Shelf("Albums", albums)
                Shelf("Playlists", playlists)
            }
            .padding(.vertical, 8)
        }
    }

    private func search(_ term: String) async {
        guard !term.isEmpty else {
            results = nil
            return
        }
        try? await Task.sleep(for: .milliseconds(300)) // debounce typing
        if Task.isCancelled { return }
        do {
            let response: SearchResponse = try await client.music(
                "/v1/catalog/{storefront}/search",
                params: ["term": term, "types": "songs,albums,artists,playlists", "limit": "20"]
            )
            results = response.results
            error = nil
        } catch is CancellationError {
        } catch {
            self.error = error.localizedDescription
        }
    }
}

// MARK: Library

enum LibrarySection: String, CaseIterable, Hashable {
    case playlists = "Playlists", albums = "Albums", songs = "Songs"

    var symbol: String {
        switch self {
        case .playlists: "music.note.list"
        case .albums: "square.stack"
        case .songs: "music.note"
        }
    }
}

struct LibraryView: View {
    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                ForEach(LibrarySection.allCases, id: \.self) { section in
                    NavigationLink(value: section) {
                        HStack(spacing: 14) {
                            Image(systemName: section.symbol)
                                .font(.system(size: 19))
                                .frame(width: 28)
                            Text(section.rawValue).font(.title3)
                            Spacer()
                            Image(systemName: "chevron.right")
                                .font(.footnote.weight(.semibold))
                                .foregroundStyle(Theme.text3)
                        }
                        .foregroundStyle(.white)
                        .padding(.horizontal, 20)
                        .frame(height: 54)
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(RowStyle())
                    Divider().overlay(Theme.surface).padding(.leading, 62)
                }
            }
            .padding(.top, 4)
        }
        .page()
        .navigationTitle("Library")
        .navigationDestination(for: LibrarySection.self) { section in
            if section == .songs { LibrarySongsView() } else { LibraryGridView(section: section) }
        }
    }
}

/// A library collection loaded 100 at a time, following Apple's `next` links.
@Observable @MainActor final class Pager {
    let path: String
    private(set) var items: [Resource] = []
    private(set) var error: String?
    private(set) var loading = false
    private(set) var started = false
    private var next: String?
    private var done = false

    init(_ path: String) { self.path = path }

    func loadMore(_ client: RemoteClient) async {
        guard !loading, !done else { return }
        loading = true
        started = true
        defer { loading = false }
        do {
            let page = if let next { try await client.page(next) } else { try await client.page(path, params: ["limit": "100"]) }
            items += page.data
            next = page.next
            done = page.next == nil
            error = nil
        } catch is CancellationError {
        } catch {
            self.error = error.localizedDescription
        }
    }

    func refresh(_ client: RemoteClient) async {
        do {
            let page = try await client.page(path, params: ["limit": "100"], refresh: true)
            items = page.data
            next = page.next
            done = page.next == nil
            error = nil
        } catch {}
    }

    var isEmpty: Bool { done && items.isEmpty && error == nil }
}

/// The pager's footer: spinner, error with Retry, or "empty".
private struct PagerFooter: View {
    @Environment(RemoteClient.self) private var client
    let pager: Pager
    let empty: String

    var body: some View {
        if let error = pager.error {
            ErrorView(message: error) { await pager.loadMore(client) }
        } else if pager.loading || !pager.started {
            LoadingView()
        } else if pager.isEmpty {
            EmptyNote(empty)
        }
    }
}

struct LibraryGridView: View {
    @Environment(RemoteClient.self) private var client
    let section: LibrarySection
    @State private var pager: Pager

    init(section: LibrarySection) {
        self.section = section
        _pager = State(initialValue: Pager(section == .albums ? "/v1/me/library/albums" : "/v1/me/library/playlists"))
    }

    var body: some View {
        ScrollView {
            CardGrid(items: pager.items) { Task { await pager.loadMore(client) } }
                .padding(.top, 8)
            PagerFooter(pager: pager, empty: section == .albums ? "No albums in your library yet." : "No playlists yet.")
        }
        .page()
        .navigationTitle(section.rawValue)
        .refreshable { await pager.refresh(client) }
        .task { if !pager.started { await pager.loadMore(client) } }
    }
}

struct LibrarySongsView: View {
    @Environment(RemoteClient.self) private var client
    @State private var pager = Pager("/v1/me/library/songs")

    /// Keep queues a sensible size even for 10k-song libraries (like the desktop).
    private let maxQueue = 300

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 12) {
                    PillButton(title: "Play", symbol: "play.fill", primary: true) {
                        client.play(songs: Array(pager.items.filter(\.isPlayable).prefix(maxQueue)), shuffle: false)
                    }
                    PillButton(title: "Shuffle", symbol: "shuffle") {
                        client.play(songs: Array(pager.items.filter(\.isPlayable).shuffled().prefix(maxQueue)), shuffle: true)
                    }
                }
                .disabled(pager.items.isEmpty)
                .padding(.horizontal, 20)
                .padding(.vertical, 12)
                ForEach(Array(pager.items.enumerated()), id: \.offset) { i, song in
                    TrackRow(track: song) {
                        client.play(songs: Array(pager.items[i..<min(i + maxQueue, pager.items.count)]))
                    }
                    .onAppear { if i == pager.items.count - 1 { Task { await pager.loadMore(client) } } }
                }
                PagerFooter(pager: pager, empty: "No songs in your library yet.")
            }
        }
        .page()
        .navigationTitle("Songs")
        .refreshable { await pager.refresh(client) }
        .task { if !pager.started { await pager.loadMore(client) } }
    }
}

// MARK: Album / playlist

/// Album or playlist page, for both library and catalog items.
struct CollectionView: View {
    @Environment(RemoteClient.self) private var client
    let item: Resource
    @State private var detail: Resource?
    @State private var tracks: [Resource] = []
    @State private var loading = true
    @State private var error: String?

    private var isAlbum: Bool { item.type.hasSuffix("albums") }
    private var base: String {
        let kind = isAlbum ? "albums" : "playlists"
        return item.isLibrary ? "/v1/me/library/\(kind)/\(item.id)" : "/v1/catalog/{storefront}/\(kind)/\(item.id)"
    }

    var body: some View {
        let shown = detail ?? item
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 0) {
                header(shown)
                ForEach(Array(tracks.enumerated()), id: \.offset) { i, track in
                    TrackRow(track: track, number: isAlbum ? track.attributes.trackNumber ?? i + 1 : nil) {
                        client.play(shown, startWith: i, preview: track)
                    }
                }
                if let error {
                    ErrorView(message: error) { await load() }
                } else if loading {
                    LoadingView()
                } else if tracks.isEmpty {
                    EmptyNote("No songs here.")
                }
            }
            .padding(.bottom, 16)
        }
        .page()
        .navigationBarTitleDisplayMode(.inline)
        .task { if loading { await load() } }
    }

    private func header(_ shown: Resource) -> some View {
        let a = shown.attributes
        let artwork = a.artwork?.url ?? tracks.first { $0.attributes.artwork != nil }?.attributes.artwork?.url
        let year = a.releaseDate.map { String($0.prefix(4)) }
        let byline = isAlbum
            ? [a.artistName, a.genreNames?.first, year].compactMap { $0 }.joined(separator: " · ")
            : a.curatorName ?? (item.isLibrary ? "Your playlist" : "Playlist")
        let totalMs = tracks.reduce(0) { $0 + ($1.attributes.durationInMillis ?? 0) }
        let notes = plainText(a.description?.standard ?? a.description?.short ?? a.editorialNotes?.short)
        return VStack(spacing: 6) {
            ArtworkImage(url: artwork, points: 240, radius: 10)
                .frame(width: 240, height: 240)
                .shadow(color: .black.opacity(0.4), radius: 18, y: 8)
                .padding(.bottom, 10)
            Text(shown.name)
                .font(.title2.bold())
                .multilineTextAlignment(.center)
            Text(byline)
                .font(.callout)
                .foregroundStyle(Theme.text2)
                .multilineTextAlignment(.center)
            if !tracks.isEmpty && !loading {
                Text("\(tracks.count) \(tracks.count == 1 ? "song" : "songs") · \(formatTotal(totalMs))")
                    .font(.footnote)
                    .foregroundStyle(Theme.text3)
            }
            HStack(spacing: 12) {
                PillButton(title: "Play", symbol: "play.fill", primary: true) {
                    client.play(shown, shuffle: false, preview: tracks.first)
                }
                PillButton(title: "Shuffle", symbol: "shuffle") {
                    client.play(shown, startWith: Int.random(in: 0..<max(tracks.count, 1)), shuffle: true)
                }
            }
            .disabled(tracks.isEmpty)
            .padding(.top, 12)
            if let notes {
                Text(notes)
                    .font(.footnote)
                    .foregroundStyle(Theme.text3)
                    .lineLimit(3)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.top, 10)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 20)
        .padding(.top, 8)
        .padding(.bottom, 16)
    }

    /// Detail and tracks load in parallel; tracks show from the first page while the rest stream in.
    private func load() async {
        loading = true
        error = nil
        tracks = []
        async let info: Page = client.music(base)
        do {
            var page = try await client.page("\(base)/tracks", params: ["limit": "100"])
            tracks = page.data
            while let next = page.next, tracks.count < 5000 {
                page = try await client.page(next)
                tracks += page.data
            }
            loading = false
        } catch is CancellationError {
            return
        } catch {
            self.error = error.localizedDescription
        }
        if let d = try? await info.data.first { detail = d }
    }

    private func formatTotal(_ ms: Double) -> String {
        let minutes = Int((ms / 60000).rounded())
        return minutes < 60 ? "\(minutes) min" : "\(minutes / 60) hr \(minutes % 60) min"
    }
}

// MARK: Artist

struct ArtistView: View {
    @Environment(RemoteClient.self) private var client
    let item: Resource
    @State private var phase: Phase<Resource> = .loading

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 30) {
                let artist = phase.value ?? item
                let topSongs = artist.views["top-songs"]?.data ?? []
                VStack(spacing: 10) {
                    ArtworkImage(url: artist.attributes.artwork?.url, points: 200, round: true)
                        .frame(width: 200, height: 200)
                    Text(artist.name).font(.title.bold()).multilineTextAlignment(.center)
                    PillButton(title: "Play", symbol: "play.fill", primary: true) {
                        client.play(songs: topSongs, shuffle: false)
                    }
                    .disabled(topSongs.isEmpty)
                    .frame(maxWidth: 200)
                    .padding(.top, 4)
                }
                .frame(maxWidth: .infinity)
                .padding(.top, 8)

                PhaseView(phase, retry: load) { artist in
                    if !topSongs.isEmpty {
                        VStack(alignment: .leading, spacing: 6) {
                            SectionTitle("Top Songs")
                            ForEach(Array(topSongs.prefix(10).enumerated()), id: \.offset) { i, song in
                                TrackRow(track: song) { client.play(songs: topSongs, startWith: i) }
                            }
                        }
                    }
                    Shelf("Albums", artist.views["full-albums"]?.data ?? [])
                    Shelf("Singles & EPs", artist.views["singles"]?.data ?? [])
                    Shelf("Appears On", artist.views["appears-on-albums"]?.data ?? [])
                }
            }
            .padding(.bottom, 16)
        }
        .page()
        .navigationBarTitleDisplayMode(.inline)
        .task { if phase.value == nil { await load() } }
    }

    private func load() async {
        phase = .loading
        do {
            let page: Page = try await client.music(
                "/v1/catalog/{storefront}/artists/\(item.id)",
                params: ["views": "top-songs,full-albums,singles,appears-on-albums"]
            )
            guard let artist = page.data.first else { throw BrowseError(status: 404, detail: nil) }
            phase = .loaded(artist)
        } catch is CancellationError {
        } catch {
            phase = .failed(error.localizedDescription)
        }
    }
}
