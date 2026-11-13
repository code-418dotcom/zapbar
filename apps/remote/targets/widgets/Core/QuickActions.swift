import Foundation

enum QuickError: Error, Equatable {
  /// The bar could not be reached at all (wrong IP, off, other network).
  case unreachable
  /// The bar answered with a failure, timed out mid-command or said something unexpected.
  case heos(String)
}

protocol QuickBackend: Sendable {
  func config() -> QuickConfig?
  func state() -> QuickState
  func saveState(_ s: QuickState)
}

/// The subset of the HEOS client the actions use, so tests can fake the bar (HeosQuickLike in QuickActions.kt).
protocol HeosQuickLike: Sendable {
  func pidFor(_ serial: String) async throws -> Int
  func volume(_ pid: Int) async throws -> Int
  func setVolume(_ pid: Int, _ v: Int) async throws
  func mute(_ pid: Int) async throws -> Bool
  func setMute(_ pid: Int, _ on: Bool) async throws
  func playInput(_ pid: Int, _ mid: String) async throws
  func nowPlayingMid(_ pid: Int) async throws -> String?
  func playState(_ pid: Int) async throws -> String
  func close()
}

enum QuickAction: Sendable {
  case setVolume(Int)
  /// Relative change from the bar's current volume.
  case step(Int)
  case toggleMute
  case playInput(String)
  case refresh
}

/// Runs queued work strictly one after another, across every QuickActions instance in the process.
private actor SerialGate {
  static let shared = SerialGate()
  private var tail: Task<Void, Never>?

  func run<T: Sendable>(_ work: @escaping @Sendable () async -> T) async -> T {
    let prev = tail
    let task = Task { () -> T in
      await prev?.value
      return await work()
    }
    tail = Task { _ = await task.value }
    return await task.value
  }
}

/// Port of QuickActions.kt: connect, command, read back, disconnect. Never throws; failures become a status message.
final class QuickActions: @unchecked Sendable {
  private let backend: QuickBackend
  private let connect: @Sendable (String) async throws -> HeosQuickLike
  private let clock: @Sendable () -> Double

  init(backend: QuickBackend, clock: @escaping @Sendable () -> Double = { nowMs() }, connect: @escaping @Sendable (String) async throws -> HeosQuickLike) {
    self.backend = backend
    self.connect = connect
    self.clock = clock
  }

  /// before is the state prior to an optimistic paint; a failure restores it instead of keeping the guess.
  func run(_ action: QuickAction, before: QuickState? = nil) async -> QuickState {
    await SerialGate.shared.run { await self.perform(action, before: before) }
  }

  private func perform(_ action: QuickAction, before: QuickState?) async -> QuickState {
    guard let cfg = backend.config() else { return message("Open Zapbar to set up", before) }
    let bar: HeosQuickLike
    do {
      bar = try await connect(cfg.lastIp)
    } catch QuickError.unreachable {
      return message("Open Zapbar to reconnect", before)
    } catch {
      return message("Soundbar didn't respond", before)
    }
    defer { bar.close() }
    do {
      let pid = try await bar.pidFor(cfg.serial)
      switch action {
      case .setVolume(let v):
        let target = min(max(v, 0), 100)
        // At or under the cap the current volume cannot change the result; skip the round trip.
        try await bar.setVolume(pid, target <= cfg.volumeCap ? target : cfg.capped(target, current: try await bar.volume(pid)))
      case .step(let delta):
        let cur = try await bar.volume(pid)
        try await bar.setVolume(pid, cfg.capped(min(max(cur + delta, 0), 100), current: cur))
      case .toggleMute:
        try await bar.setMute(pid, !(try await bar.mute(pid)))
      case .playInput(let mid):
        try await bar.playInput(pid, mid)
      case .refresh:
        break
      }
      let s = QuickState(volume: try await bar.volume(pid), mute: try await bar.mute(pid),
                         activeMid: try await bar.nowPlayingMid(pid), playState: try await bar.playState(pid))
      backend.saveState(s)
      return s
    } catch {
      return message("Soundbar didn't respond", before)
    }
  }

  private func message(_ text: String, _ before: QuickState?) -> QuickState {
    var s = before ?? backend.state()
    s.message = text
    s.messageUntil = clock() + 3000
    backend.saveState(s)
    return s
  }
}
