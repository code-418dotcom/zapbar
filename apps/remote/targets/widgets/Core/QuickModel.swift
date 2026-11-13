import Foundation

/// Port of QuickStore.kt: the snapshot the app writes (buildQuickConfig in src/runtime/quick.ts) and the last bar state.
struct QuickInput: Codable, Equatable {
  var mid: String
  var label: String
  var icon: String
  var hidden: Bool
}

struct QuickConfig: Codable, Equatable {
  var key: String
  var serial: String
  var lastIp: String
  var name: String
  var inputs: [QuickInput]
  var volumeKeys: Bool
  var notification: Bool
  var volumeCap: Int

  init(key: String, serial: String, lastIp: String, name: String, inputs: [QuickInput], volumeKeys: Bool, notification: Bool, volumeCap: Int = 100) {
    self.key = key; self.serial = serial; self.lastIp = lastIp; self.name = name; self.inputs = inputs
    self.volumeKeys = volumeKeys; self.notification = notification; self.volumeCap = volumeCap
  }

  init(from d: Decoder) throws {
    let c = try d.container(keyedBy: CodingKeys.self)
    key = try c.decode(String.self, forKey: .key)
    serial = try c.decode(String.self, forKey: .serial)
    lastIp = try c.decode(String.self, forKey: .lastIp)
    name = try c.decode(String.self, forKey: .name)
    inputs = try c.decode([QuickInput].self, forKey: .inputs)
    volumeKeys = try c.decodeIfPresent(Bool.self, forKey: .volumeKeys) ?? true
    notification = try c.decodeIfPresent(Bool.self, forKey: .notification) ?? true
    volumeCap = try c.decodeIfPresent(Int.self, forKey: .volumeCap) ?? 100
  }

  static func decode(_ json: String?) -> QuickConfig? {
    guard let data = json?.data(using: .utf8) else { return nil }
    return try? JSONDecoder().decode(QuickConfig.self, from: data)
  }

  func visibleInputs() -> [QuickInput] { inputs.filter { !$0.hidden } }

  /// Limits target to the cap, but never raises a volume that is already above it (mirrors volume.ts `capped`).
  func capped(_ target: Int, current: Int) -> Int {
    target <= volumeCap ? target : max(volumeCap, min(current, target))
  }
}

/// Last known bar state. message shows in the widget until messageUntil (ms since 1970).
struct QuickState: Codable, Equatable {
  var volume: Int = 0
  var mute: Bool = false
  var activeMid: String? = nil
  var playState: String = "stop"
  var message: String? = nil
  var messageUntil: Double = 0

  init(volume: Int = 0, mute: Bool = false, activeMid: String? = nil, playState: String = "stop", message: String? = nil, messageUntil: Double = 0) {
    self.volume = volume; self.mute = mute; self.activeMid = activeMid; self.playState = playState
    self.message = message; self.messageUntil = messageUntil
  }

  init(from d: Decoder) throws {
    let c = try d.container(keyedBy: CodingKeys.self)
    volume = try c.decodeIfPresent(Int.self, forKey: .volume) ?? 0
    mute = try c.decodeIfPresent(Bool.self, forKey: .mute) ?? false
    activeMid = try c.decodeIfPresent(String.self, forKey: .activeMid)
    playState = try c.decodeIfPresent(String.self, forKey: .playState) ?? "stop"
    message = try c.decodeIfPresent(String.self, forKey: .message)
    messageUntil = try c.decodeIfPresent(Double.self, forKey: .messageUntil) ?? 0
  }

  static func decode(_ json: String?) -> QuickState {
    guard let data = json?.data(using: .utf8), let s = try? JSONDecoder().decode(QuickState.self, from: data) else { return QuickState() }
    return s
  }

  func encoded() -> String { String(data: (try? JSONEncoder().encode(self)) ?? Data(), encoding: .utf8) ?? "{}" }
}

/// The tap-to-set volume pill (Pill.kt): 20 segments, segment i sets 5*(i+1).
enum Pill {
  static let segments = 20
  /// The widget − / + step: one segment (NotificationRenderer.STEP).
  static let step = 5
  enum Kind { case track, fill, knob }

  static func volumeFor(_ segment: Int) -> Int { 5 * (min(max(segment, 0), segments - 1) + 1) }
  static func filled(_ volume: Int) -> Int { (min(max(volume, 0), 100) + 2) / 5 }
  static func kind(_ index: Int, _ volume: Int) -> Kind {
    let f = filled(volume)
    return index < f - 1 ? .fill : index == f - 1 ? .knob : .track
  }
}

func nowMs() -> Double { Date().timeIntervalSince1970 * 1000 }

/// The widget's status line (WidgetRenderer.status): set-up hint, a recent message, or the active input's label.
func status(_ cfg: QuickConfig?, _ s: QuickState, now: Double = nowMs()) -> String {
  guard let cfg else { return "Open Zapbar to set up" }
  if let m = s.message, now < s.messageUntil { return m }
  return cfg.inputs.first { $0.mid == s.activeMid }?.label ?? ""
}

/// Reads and writes the App Group the app shares with the widget extension.
final class GroupBackend: QuickBackend, @unchecked Sendable {
  private let defaults = UserDefaults(suiteName: Shared.group)
  func config() -> QuickConfig? { QuickConfig.decode(defaults?.string(forKey: Shared.configKey)) }
  func state() -> QuickState { QuickState.decode(defaults?.string(forKey: Shared.stateKey)) }
  func saveState(_ s: QuickState) { defaults?.set(s.encoded(), forKey: Shared.stateKey) }
}
