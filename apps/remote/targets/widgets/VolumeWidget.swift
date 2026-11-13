import SwiftUI
import WidgetKit

/// Small: the number (or "!" after a failure) and mute on top, the tap-to-set pill, then − / +.
struct VolumeView: View {
  let entry: QuickEntry
  var body: some View {
    let enabled = entry.config != nil
    VStack(alignment: .leading, spacing: 8) {
      HStack {
        if hasMessage(entry.state) {
          Text("!").font(.system(size: 34, weight: .bold)).foregroundStyle(ZQ.warn)
        } else {
          Text("\(entry.state.volume)").font(.system(size: 34, weight: .bold)).foregroundStyle(ZQ.text)
        }
        Spacer()
        MuteButton(state: entry.state, enabled: enabled)
      }
      Spacer(minLength: 0)
      if enabled {
        SegmentBar(volume: entry.state.volume, enabled: true)
        HStack(spacing: 8) {
          StepButton(delta: -Pill.step, enabled: true)
          StepButton(delta: Pill.step, enabled: true)
        }
      } else {
        Text("Open Zapbar to set up").font(.system(size: 12)).foregroundStyle(ZQ.muted)
      }
    }
    .containerBackground(ZQ.bg, for: .widget)
    .widgetURL(enabled ? nil : URL(string: "zapbar://remote"))
  }
}

struct ZapbarVolume: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "ZapbarVolume", provider: QuickProvider()) { VolumeView(entry: $0) }
      .configurationDisplayName("Volume")
      .description("Volume and mute for your soundbar.")
      .supportedFamilies([.systemSmall])
  }
}
