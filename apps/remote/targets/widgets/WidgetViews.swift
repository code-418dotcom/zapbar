import AppIntents
import SwiftUI
import WidgetKit

/// Colours generated from expo-target.config.js (same values as the Android widget).
enum ZQ {
  static let bg = Color("zqBg"), surface = Color("zqSurface"), surfaceHi = Color("zqSurfaceHi")
  static let text = Color("zqText"), muted = Color("zqMuted"), accent = Color("zqAccent")
  static let onAccent = Color("zqOnAccent"), warn = Color("zqWarn")
}

/// Input icon ids (src/runtime/inputs.ts ICONS) to the template images (WidgetRenderer.iconFor).
func iconAsset(_ id: String) -> String {
  switch id {
  case "tv": return "zq_ic_television"
  case "decoder": return "zq_ic_television_box"
  case "playstation": return "zq_ic_sony_playstation"
  case "xbox": return "zq_ic_microsoft_xbox"
  case "switch": return "zq_ic_nintendo_switch"
  case "appletv": return "zq_ic_apple"
  case "chromecast": return "zq_ic_cast"
  case "firetv": return "zq_ic_fire"
  case "steam": return "zq_ic_steam"
  case "pc": return "zq_ic_desktop_tower_monitor"
  case "bluray": return "zq_ic_disc_player"
  case "gamepad": return "zq_ic_gamepad_variant"
  case "audio": return "zq_ic_audio_input_stereo_minijack"
  default: return "zq_ic_video_input_hdmi"
  }
}

struct Icon: View {
  let name: String
  let size: CGFloat
  var body: some View {
    Image(name).renderingMode(.template).resizable().scaledToFit().frame(width: size, height: size)
  }
}

/// A recent failure message is showing (WidgetRenderer: the small widget turns its number into "!").
func hasMessage(_ s: QuickState, now: Double = nowMs()) -> Bool { s.message != nil && now < s.messageUntil }

struct MuteButton: View {
  let state: QuickState
  let enabled: Bool
  var body: some View {
    let icon = Icon(name: state.mute ? "zq_ic_volume_off" : "zq_ic_volume_high", size: 22)
      .foregroundStyle(state.mute ? ZQ.warn : ZQ.text)
      .frame(width: 36, height: 36)
    if enabled {
      Button(intent: ToggleMuteIntent()) { icon }.buttonStyle(.plain).accessibilityLabel(state.mute ? "Unmute" : "Mute")
    } else {
      icon
    }
  }
}

/// − / + step of one pill segment. A widget can't follow a drag (the home screen takes it), so these are the
/// dependable way to nudge the volume; the pill stays as the readout and tap-to-set.
struct StepButton: View {
  let delta: Int
  let enabled: Bool
  var body: some View {
    let icon = Text(delta < 0 ? "−" : "+").font(.system(size: 22, weight: .semibold)).foregroundStyle(ZQ.text)
      .frame(maxWidth: .infinity, minHeight: 32, maxHeight: 32)
      .background(RoundedRectangle(cornerRadius: 10).fill(ZQ.surface))
    if enabled {
      Button(intent: StepVolumeIntent(delta: delta)) { icon }.buttonStyle(.plain)
        .accessibilityLabel(delta < 0 ? "Volume down" : "Volume up")
    } else {
      icon
    }
  }
}

/// The 20-segment pill: segment i sets 5*(i+1); fill up to the knob, track after it (Pill.kt).
struct SegmentBar: View {
  let volume: Int
  let enabled: Bool
  var body: some View {
    HStack(spacing: 2) {
      ForEach(0..<Pill.segments, id: \.self) { i in
        let kind = Pill.kind(i, volume)
        let seg = RoundedRectangle(cornerRadius: 2)
          .fill(kind == .track ? ZQ.surfaceHi : ZQ.accent)
          .frame(maxWidth: .infinity)
          .frame(height: kind == .knob ? 22 : 14)
          .frame(maxHeight: 28)
          .contentShape(Rectangle())
        if enabled {
          Button(intent: SetVolumeIntent(level: Pill.volumeFor(i))) { seg }.buttonStyle(.plain)
        } else {
          seg
        }
      }
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel("Volume \(volume)")
  }
}

struct InputButton: View {
  let input: QuickInput
  let active: Bool
  var body: some View {
    Button(intent: PlayInputIntent(mid: input.mid)) {
      VStack(spacing: 2) {
        Icon(name: iconAsset(input.icon), size: 20)
        Text(input.label).font(.system(size: 11, weight: .medium)).lineLimit(1).minimumScaleFactor(0.8)
      }
      .foregroundStyle(active ? ZQ.onAccent : ZQ.text)
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .background(RoundedRectangle(cornerRadius: 12).fill(active ? ZQ.accent : ZQ.surface))
    }
    .buttonStyle(.plain)
  }
}
