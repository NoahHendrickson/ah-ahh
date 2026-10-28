import Foundation
import Observation
import UIKit

/// What the PC reports. Decoded tolerantly: missing keys get defaults, numbers may be ints or doubles.
struct RemoteState: Decodable {
    var playing = false
    var title: String?
    var artist = ""
    var album = ""
    var artwork: String?
    var durationMs = 0.0
    var positionMs = 0.0
    var volume = 1.0
    var shuffle = false
    var `repeat` = 0 // 0 none, 1 one, 2 all
    /// Changes whenever the PC's queue changes. nil: an older PC without browsing support.
    var queueRevision: Int?
    /// Whether the current song is a favorite; nil when unknown.
    var favorite: Bool?

    init() {}

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        playing = (try? c.decode(Bool.self, forKey: .playing)) ?? false
        title = try? c.decode(String.self, forKey: .title)
        artist = (try? c.decode(String.self, forKey: .artist)) ?? ""
        album = (try? c.decode(String.self, forKey: .album)) ?? ""
        artwork = try? c.decode(String.self, forKey: .artwork)
        durationMs = (try? c.decode(Double.self, forKey: .durationMs)) ?? 0
        positionMs = (try? c.decode(Double.self, forKey: .positionMs)) ?? 0
        volume = (try? c.decode(Double.self, forKey: .volume)) ?? 1
        shuffle = (try? c.decode(Bool.self, forKey: .shuffle)) ?? false
        `repeat` = Int((try? c.decode(Double.self, forKey: .repeat)) ?? 0)
        queueRevision = (try? c.decode(Double.self, forKey: .queueRevision)).map { Int($0) }
        favorite = try? c.decode(Bool.self, forKey: .favorite)
    }

    private enum CodingKeys: String, CodingKey {
        case playing, title, artist, album, artwork, durationMs, positionMs, volume, shuffle, `repeat`, queueRevision, favorite
    }
}

/// A paired PC, saved in UserDefaults. `host` is the address that last worked.
struct Pairing: Codable {
    var hosts: [String]
    var port: Int
    var token: String
    var name: String
    var host: String
}

@Observable @MainActor
final class RemoteClient {
    private(set) var pairing: Pairing?
    private(set) var state = RemoteState()
    /// When `state` was received (or optimistically changed); position is extrapolated from here.
    private(set) var stateTime = Date()
    private(set) var artwork: UIImage?
    private(set) var connected = false

    // Pairing screen
    private(set) var pairingName: String? // non-nil while trying to pair
    private(set) var pairingError: String?
    private(set) var retryURL: URL?

    private var active = false
    private var streamTask: Task<Void, Never>?
    private var pairTask: Task<Void, Never>?
    private var artworkTask: Task<Void, Never>?
    private var lastCommand: Task<Void, Never>?
    private var lastVolumeSend = Date.distantPast
    private var artworkURL: String?
    @ObservationIgnored private var preview: (oldTitle: String?, until: Date)?
    /// Apple Music responses by path + params, for the session (so going back is instant).
    @ObservationIgnored private var cache: [String: Any] = [:]

    private static let defaultsKey = "pairing"

    init() {
        if let data = UserDefaults.standard.data(forKey: Self.defaultsKey) {
            pairing = try? JSONDecoder().decode(Pairing.self, from: data)
        }
    }

    // MARK: Position

    /// Playback position in seconds at `date`, extrapolated while playing.
    func position(at date: Date) -> Double {
        var ms = state.positionMs
        if state.playing { ms += date.timeIntervalSince(stateTime) * 1000 }
        if state.durationMs > 0 { ms = min(ms, state.durationMs) }
        return max(ms, 0) / 1000
    }

    private func freezePosition() {
        let now = Date()
        state.positionMs = position(at: now) * 1000
        stateTime = now
    }

    // MARK: Commands (optimistic, fire-and-forget)

    func togglePlay() {
        freezePosition()
        state.playing.toggle()
        send(state.playing ? "play" : "pause")
    }

    func next() { send("next") }
    func previous() { send("previous") }

    func seek(to seconds: Double) {
        state.positionMs = seconds * 1000
        stateTime = Date()
        send("seek", seconds)
    }

    /// Throttled to ~10/s while dragging; always sends when `final`.
    func setVolume(_ value: Double, final: Bool) {
        state.volume = value
        let now = Date()
        guard final || now.timeIntervalSince(lastVolumeSend) >= 0.1 else { return }
        lastVolumeSend = now
        send("volume", value)
    }

    func toggleShuffle() {
        state.shuffle.toggle()
        send("shuffle", state.shuffle)
    }

    /// off → all → one → off
    func cycleRepeat() {
        state.repeat = state.repeat == 0 ? 2 : state.repeat == 2 ? 1 : 0
        send("repeat", state.repeat)
    }

    func setFavorite(_ on: Bool) {
        state.favorite = on
        send("favorite", on)
    }

    func jumpTo(_ index: Int) {
        haptic()
        send("jumpTo", index)
    }

    /// Plays an album/playlist/station from track `startWith`, or a single song. `preview` is the song
    /// that will start, shown right away instead of waiting for the PC.
    func play(_ item: Resource, startWith: Int = 0, shuffle: Bool? = nil, preview: Resource? = nil) {
        var value: [String: Any] = ["type": item.type, "id": item.id, "startWith": startWith]
        if let shuffle { value["shuffle"] = shuffle }
        haptic()
        showPreview(preview ?? (item.isSong ? item : nil))
        send("playItem", value)
    }

    /// Plays a list that isn't a container (search results, library songs), starting at `songs[startWith]`.
    func play(songs: [Resource], startWith: Int = 0, shuffle: Bool? = nil) {
        let playable = songs.indices.filter { songs[$0].isPlayable }.prefix(500)
        guard !playable.isEmpty else { return }
        var value: [String: Any] = [
            "ids": playable.map { songs[$0].id },
            "startWith": playable.firstIndex(of: startWith).map { $0 - playable.startIndex } ?? 0,
        ]
        if let shuffle { value["shuffle"] = shuffle }
        haptic()
        if shuffle != true { showPreview(songs.indices.contains(startWith) ? songs[startWith] : nil) }
        send("playSongs", value)
    }

    func playNext(_ song: Resource) {
        haptic()
        send("playNext", ["id": song.id, "type": song.type])
    }

    /// Shows `song` as now playing until the PC reports the switch (or a few seconds pass).
    private func showPreview(_ song: Resource?) {
        guard let song, let name = song.attributes.name else { return }
        preview = (state.title, Date().addingTimeInterval(3))
        state.title = name
        state.artist = song.attributes.artistName ?? ""
        state.album = song.attributes.albumName ?? ""
        state.durationMs = song.attributes.durationInMillis ?? 0
        state.positionMs = 0
        state.playing = true
        state.favorite = nil
        stateTime = Date()
        state.artwork = song.attributes.artwork?.url(600) // the size the PC reports, so it isn't fetched twice
        if state.artwork != artworkURL { loadArtwork(state.artwork) }
    }

    private func send(_ action: String, _ value: Any? = nil) {
        guard let p = pairing else { return }
        var body: [String: Any] = ["action": action]
        if let value { body["value"] = value }
        var req = request(p, p.host, "/v1/command", timeout: 3)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try? JSONSerialization.data(withJSONObject: body)
        // Chained so commands (e.g. a volume drag) reach the PC in order.
        let previous = lastCommand
        lastCommand = Task {
            await previous?.value
            let status = (try? await session.data(for: req).1 as? HTTPURLResponse)?.statusCode ?? 0
            if status == 401 {
                forget(message: "ah ahh on your PC reset its pairing code. Scan the new one.")
            } else if !(200..<300).contains(status), pairing != nil {
                preview = nil
                reconnect()
            }
        }
    }

    // MARK: Connection

    /// Called with the scene phase: stream only while the app is in the foreground.
    func setActive(_ isActive: Bool) {
        active = isActive
        if isActive { startStream() } else { stopStream() }
    }

    private func startStream() {
        guard active, pairing != nil, streamTask == nil else { return }
        streamTask = Task { await runStream() }
    }

    private func stopStream() {
        streamTask?.cancel()
        streamTask = nil
        connected = false
    }

    private func reconnect() {
        guard connected else { return } // already reconnecting
        stopStream()
        startStream()
    }

    private func runStream() async {
        var delay = 0.5
        while !Task.isCancelled, let p = pairing {
            // Saved host first, then the others; short timeouts so a dead address doesn't stall us.
            var result = await probe([p.host], p)
            if case .failed = result, p.hosts.count > 1 {
                result = await probe(p.hosts.filter { $0 != p.host }, p)
            }
            if Task.isCancelled { return }

            switch result {
            case .unauthorized:
                forget(message: "ah ahh on your PC reset its pairing code. Scan the new one.")
                return
            case .ok(let host):
                if host != p.host {
                    pairing?.host = host
                    save()
                }
                if await stream(host, p) == .unauthorized {
                    forget(message: "ah ahh on your PC reset its pairing code. Scan the new one.")
                    return
                }
            case .failed:
                break
            }
            if Task.isCancelled { return }

            if connected { delay = 0.5 }
            connected = false
            try? await Task.sleep(for: .seconds(delay))
            delay = min(delay * 2, 8)
        }
    }

    /// Reads SSE until the connection ends. Each `data:` line is one complete state (the PC guarantees it).
    private func stream(_ host: String, _ p: Pairing) async -> Probe {
        var req = request(p, host, "/v1/events", timeout: 40) // 15s keep-alives, so 40s of silence means dead
        req.setValue("text/event-stream", forHTTPHeaderField: "Accept")
        do {
            let (bytes, response) = try await session.bytes(for: req)
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            if status == 401 { return .unauthorized }
            guard status == 200 else { return .failed }
            let decoder = JSONDecoder()
            for try await line in bytes.lines {
                if Task.isCancelled { break }
                guard line.hasPrefix("data:"),
                      let s = try? decoder.decode(RemoteState.self, from: Data(line.utf8.dropFirst(5)))
                else { continue }
                apply(s)
            }
        } catch {}
        return .failed
    }

    private func apply(_ s: RemoteState) {
        connected = true
        if let p = preview {
            // Still the song from before a play tap: keep showing the new one.
            if s.title == p.oldTitle, Date() < p.until { return }
            preview = nil
        }
        if s.artwork != artworkURL { loadArtwork(s.artwork) }
        state = s
        stateTime = Date()
    }

    private func loadArtwork(_ string: String?) {
        artworkTask?.cancel()
        artworkURL = string
        guard let string, let url = URL(string: string) else {
            artwork = nil
            return
        }
        artworkTask = Task {
            guard let data = try? await URLSession.shared.data(from: url).0,
                  !Task.isCancelled, let image = UIImage(data: data) else { return }
            artwork = image
        }
    }

    // MARK: Pairing

    /// Handles `ahahh://pair?hosts=a,b&port=10771&token=XYZ&name=PC`.
    func pair(with url: URL) {
        let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        let q = Dictionary(items.map { ($0.name, $0.value ?? "") }, uniquingKeysWith: { $1 })
        let hosts = (q["hosts"] ?? "").split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }.filter { !$0.isEmpty && endpoint($0, 1, "/") != nil }
        let token = q["token"] ?? ""
        guard url.scheme == "ahahh", url.host == "pair", !hosts.isEmpty, !token.isEmpty else {
            pairingError = "That isn't an ah ahh pairing code."
            return
        }
        let name = q["name"].flatMap { $0.isEmpty ? nil : $0 } ?? "your PC"
        let candidate = Pairing(hosts: hosts, port: Int(q["port"] ?? "") ?? 10771, token: token, name: name, host: hosts[0])

        pairTask?.cancel()
        pairingName = name
        pairingError = nil
        retryURL = nil
        pairTask = Task {
            // A few rounds: the first attempt can fail while iOS shows the Local Network prompt.
            var result = Probe.failed
            for round in 0..<4 {
                result = await probe(hosts, candidate)
                guard case .failed = result, round < 3, !Task.isCancelled else { break }
                try? await Task.sleep(for: .seconds(1.5))
            }
            if Task.isCancelled { return }
            pairingName = nil
            switch result {
            case .ok(let host):
                stopStream()
                pairing = candidate
                pairing?.host = host
                state = RemoteState()
                cache = [:]
                loadArtwork(nil)
                save()
                startStream()
            case .unauthorized:
                pairingError = "Your PC rejected this code. Scan the one currently shown in ah ahh's Settings."
            case .failed:
                pairingError = "Couldn't reach your PC — make sure both are on the same Wi-Fi."
                retryURL = url
            }
        }
    }

    func forget(message: String? = nil) {
        stopStream()
        pairing = nil
        state = RemoteState()
        cache = [:]
        loadArtwork(nil)
        pairingError = message
        UserDefaults.standard.removeObject(forKey: Self.defaultsKey)
    }

    private func save() {
        UserDefaults.standard.set(try? JSONEncoder().encode(pairing), forKey: Self.defaultsKey)
    }

    // MARK: Browsing (Apple Music API, proxied by the PC)

    /// A read-only Apple Music API request made by the PC with its signed-in session. `path` may
    /// contain `{storefront}` or be a `next` href. Cached for the session unless `refresh`.
    func music<T: Decodable & Sendable>(_ path: String, params: [String: String] = [:], refresh: Bool = false) async throws -> T {
        let key = path + "?" + params.sorted { $0.key < $1.key }.map { "\($0.key)=\($0.value)" }.joined(separator: "&")
        if !refresh, let hit = cache[key], let value = hit as? T { return value }
        let body: [String: Any] = params.isEmpty ? ["path": path] : ["path": path, "params": params]
        let value: T = try await fetch("/v1/music", body: body)
        cache[key] = value
        return value
    }

    /// One page of a collection; Apple answers 404 for empty ones (e.g. no recently played).
    func page(_ path: String, params: [String: String] = [:], refresh: Bool = false) async throws -> Page {
        do {
            return try await music(path, params: params, refresh: refresh)
        } catch let error as BrowseError where error.status == 404 {
            return Page()
        }
    }

    func queue() async throws -> Queue {
        try await fetch("/v1/queue")
    }

    private func fetch<T: Decodable>(_ path: String, body: [String: Any]? = nil) async throws -> T {
        guard let p = pairing else { throw BrowseError(status: 0, message: "Not paired.") }
        var req = request(p, p.host, path, timeout: 15)
        if let body {
            req.httpMethod = "POST"
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        let data: Data, response: URLResponse
        do {
            (data, response) = try await session.data(for: req)
        } catch {
            if Task.isCancelled { throw CancellationError() }
            reconnect()
            throw BrowseError(status: 0, message: "Couldn't reach \(p.name).")
        }
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard status == 200 else {
            if status == 401 { forget(message: "ah ahh on your PC reset its pairing code. Scan the new one.") }
            let detail = (try? JSONDecoder().decode([String: String].self, from: data))?["error"]
            throw BrowseError(status: status, detail: detail)
        }
        do {
            return try JSONDecoder().decode(T.self, from: data)
        } catch {
            throw BrowseError(status: status, message: "Your PC sent something unexpected.")
        }
    }

    // MARK: HTTP

    private enum Probe: Equatable { case ok(String), unauthorized, failed }

    /// GET /v1/info on every host in parallel; the first that answers wins.
    private func probe(_ hosts: [String], _ p: Pairing) async -> Probe {
        let requests = hosts.map { (host: $0, req: request(p, $0, "/v1/info", timeout: 3)) }
        return await withTaskGroup(of: Probe.self) { group in
            for (host, req) in requests {
                group.addTask {
                    guard let (data, response) = try? await session.data(for: req),
                          let status = (response as? HTTPURLResponse)?.statusCode else { return .failed }
                    if status == 401 { return .unauthorized }
                    let isInfo = status == 200 && (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["name"] != nil
                    return isInfo ? .ok(host) : .failed
                }
            }
            var result = Probe.failed
            for await r in group {
                if case .ok = r {
                    group.cancelAll()
                    return r
                }
                if r == .unauthorized { result = r }
            }
            return result
        }
    }

    private func request(_ p: Pairing, _ host: String, _ path: String, timeout: TimeInterval) -> URLRequest {
        var req = URLRequest(url: endpoint(host, p.port, path)!, timeoutInterval: timeout) // hosts are validated in pair(with:)
        req.setValue("Bearer \(p.token)", forHTTPHeaderField: "Authorization")
        return req
    }
}

struct BrowseError: LocalizedError {
    let status: Int
    let message: String

    init(status: Int, message: String) {
        self.status = status
        self.message = message
    }

    init(status: Int, detail: String?) {
        self.status = status
        switch status {
        case 400: message = "ah ahh on your PC needs an update to browse from your phone."
        case 404: message = "This isn't available."
        case 503: message = "ah ahh on your PC isn't ready. Make sure it's open and signed in."
        case 504: message = "Apple Music took too long to answer."
        default: message = "Apple Music had a problem" + (detail.map { " (\($0))." } ?? ".")
        }
    }

    var errorDescription: String? { message }
}

private func endpoint(_ host: String, _ port: Int, _ path: String) -> URL? {
    URL(string: "http://\(host.contains(":") ? "[\(host)]" : host):\(port)\(path)") // brackets for IPv6
}

private let session: URLSession = {
    let config = URLSessionConfiguration.ephemeral
    config.waitsForConnectivity = false
    return URLSession(configuration: config)
}()
