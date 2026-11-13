import AppIntents
import WidgetKit

/// Paints the guess at once, runs the action against the bar, then repaints from what the bar reported.
/// A failure restores the state from before the guess (QuickActions' `before`).
func runQuick(_ action: QuickAction, guess: (inout QuickState) -> Void) async {
  let backend = GroupBackend()
  let before = backend.state()
  var painted = before
  guess(&painted)
  backend.saveState(painted)
  WidgetCenter.shared.reloadAllTimelines()
  _ = await QuickActions(backend: backend, connect: HeosClient.connect).run(action, before: before)
  WidgetCenter.shared.reloadAllTimelines()
}

struct ToggleMuteIntent: AppIntent {
  static let title: LocalizedStringResource = "Mute or unmute"
  func perform() async throws -> some IntentResult {
    await runQuick(.toggleMute) { $0.mute.toggle() }
    return .result()
  }
}

struct SetVolumeIntent: AppIntent {
  static let title: LocalizedStringResource = "Set volume"
  @Parameter(title: "Level") var level: Int
  init() {}
  init(level: Int) { self.level = level }
  func perform() async throws -> some IntentResult {
    let level = self.level
    await runQuick(.setVolume(level)) { $0.volume = level }
    return .result()
  }
}

struct StepVolumeIntent: AppIntent {
  static let title: LocalizedStringResource = "Volume up or down"
  @Parameter(title: "Step") var delta: Int
  init() {}
  init(delta: Int) { self.delta = delta }
  func perform() async throws -> some IntentResult {
    let delta = self.delta
    await runQuick(.step(delta)) { $0.volume = min(max($0.volume + delta, 0), 100) }
    return .result()
  }
}

struct PlayInputIntent: AppIntent {
  static let title: LocalizedStringResource = "Switch input"
  @Parameter(title: "Input") var mid: String
  init() {}
  init(mid: String) { self.mid = mid }
  func perform() async throws -> some IntentResult {
    let mid = self.mid
    await runQuick(.playInput(mid)) { $0.activeMid = mid }
    return .result()
  }
}
