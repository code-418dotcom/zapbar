import Foundation
import Network

/// Port of HeosLite + HeosQuick over NWConnection: one command at a time, events skipped,
/// "command under process" extends the deadline, 3 s timeout per step.
final class HeosClient: HeosQuickLike, @unchecked Sendable {
  static let port: UInt16 = 1255
  static let timeout: Double = 3

  private let conn: NWConnection
  private var buffer = Data()

  private init(_ conn: NWConnection) { self.conn = conn }

  /// Throws QuickError.unreachable when the bar cannot be reached within the timeout.
  static func connect(_ ip: String) async throws -> HeosQuickLike {
    let conn = NWConnection(host: NWEndpoint.Host(ip), port: NWEndpoint.Port(rawValue: port)!, using: .tcp)
    let once = Once()
    try await withCheckedThrowingContinuation { (k: CheckedContinuation<Void, Error>) in
      conn.stateUpdateHandler = { state in
        switch state {
        case .ready: once.run { k.resume() }
        case .failed, .waiting, .cancelled: once.run { conn.cancel(); k.resume(throwing: QuickError.unreachable) }
        default: break
        }
      }
      conn.start(queue: .global())
      DispatchQueue.global().asyncAfter(deadline: .now() + timeout) {
        once.run { conn.cancel(); k.resume(throwing: QuickError.unreachable) }
      }
    }
    conn.stateUpdateHandler = nil
    return HeosClient(conn)
  }

  func close() { conn.cancel() }

  // MARK: commands (HeosQuick.kt)

  func pidFor(_ serial: String) async throws -> Int {
    guard let players = try await send("player/get_players").payload as? [[String: Any]] else { throw QuickError.heos("No players") }
    if let p = players.first(where: { $0["serial"] as? String == serial }), let pid = p["pid"] as? Int { return pid }
    if players.count == 1, let pid = players[0]["pid"] as? Int { return pid }
    throw QuickError.heos("Soundbar \(serial) not found")
  }

  func volume(_ pid: Int) async throws -> Int {
    Int(try await send("player/get_volume", [("pid", "\(pid)")]).message["level"] ?? "") ?? 0
  }

  func setVolume(_ pid: Int, _ v: Int) async throws {
    _ = try await send("player/set_volume", [("pid", "\(pid)"), ("level", "\(min(max(v, 0), 100))")])
  }

  func mute(_ pid: Int) async throws -> Bool {
    try await send("player/get_mute", [("pid", "\(pid)")]).message["state"] == "on"
  }

  func setMute(_ pid: Int, _ on: Bool) async throws {
    _ = try await send("player/set_mute", [("pid", "\(pid)"), ("state", on ? "on" : "off")])
  }

  func playInput(_ pid: Int, _ mid: String) async throws {
    _ = try await send("browse/play_input", [("pid", "\(pid)"), ("input", mid)])
  }

  func playState(_ pid: Int) async throws -> String {
    try await send("player/get_play_state", [("pid", "\(pid)")]).message["state"] ?? "stop"
  }

  func nowPlayingMid(_ pid: Int) async throws -> String? {
    let mid = (try await send("player/get_now_playing_media", [("pid", "\(pid)")]).payload as? [String: Any])?["mid"] as? String
    return mid?.isEmpty == false ? mid : nil
  }

  // MARK: wire

  struct Reply { let message: [String: String]; let payload: Any? }

  private func send(_ command: String, _ params: [(String, String)] = []) async throws -> Reply {
    try await write(Data(HeosCodec.build(command, params).utf8))
    var deadline = Date().addingTimeInterval(Self.timeout)
    while true {
      let left = deadline.timeIntervalSinceNow
      if left <= 0 { close(); throw QuickError.heos("\(command) timed out") }
      let line = try await readLine(timeout: left)
      guard let json = (try? JSONSerialization.jsonObject(with: line)) as? [String: Any],
            let heos = json["heos"] as? [String: Any], heos["command"] as? String == command else { continue }
      let message = HeosCodec.parse(heos["message"] as? String ?? "")
      if message["command under process"] != nil { deadline = Date().addingTimeInterval(Self.timeout); continue }
      if heos["result"] as? String == "fail" { throw QuickError.heos("\(command) failed: \(message["text"] ?? message["eid"] ?? "")") }
      return Reply(message: message, payload: json["payload"])
    }
  }

  private func write(_ data: Data) async throws {
    try await withCheckedThrowingContinuation { (k: CheckedContinuation<Void, Error>) in
      conn.send(content: data, completion: .contentProcessed { err in
        if let err { k.resume(throwing: QuickError.heos("send: \(err)")) } else { k.resume() }
      })
    }
  }

  /// One "\r\n"-terminated line; the connection is cancelled on timeout so the pending receive returns.
  private func readLine(timeout: Double) async throws -> Data {
    while true {
      if let r = buffer.range(of: Data("\r\n".utf8)) {
        let line = buffer.subdata(in: buffer.startIndex..<r.lowerBound)
        buffer.removeSubrange(buffer.startIndex..<r.upperBound)
        return line
      }
      buffer.append(try await receive(timeout: timeout))
    }
  }

  private func receive(timeout: Double) async throws -> Data {
    let once = Once()
    return try await withCheckedThrowingContinuation { (k: CheckedContinuation<Data, Error>) in
      conn.receive(minimumIncompleteLength: 1, maximumLength: 65_536) { data, _, done, err in
        once.run {
          if let data, !data.isEmpty { k.resume(returning: data) }
          else { k.resume(throwing: QuickError.heos(err.map { "receive: \($0)" } ?? (done ? "closed" : "empty read"))) }
        }
      }
      DispatchQueue.global().asyncAfter(deadline: .now() + timeout) {
        once.run { self.conn.cancel(); k.resume(throwing: QuickError.heos("timed out")) }
      }
    }
  }
}

/// Runs its block at most once, whichever callback gets there first.
private final class Once: @unchecked Sendable {
  private let lock = NSLock()
  private var done = false
  func run(_ block: () -> Void) {
    lock.lock()
    let first = !done
    done = true
    lock.unlock()
    if first { block() }
  }
}
