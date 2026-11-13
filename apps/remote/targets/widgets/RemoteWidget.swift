import SwiftUI
import WidgetKit

/// Medium: name and status, the volume row, and the first four visible inputs in the user's order.
struct RemoteView: View {
  let entry: QuickEntry
  var body: some View {
    let cfg = entry.config
    VStack(alignment: .leading, spacing: 8) {
      HStack(alignment: .firstTextBaseline) {
        Text(cfg?.name ?? "Zapbar").font(.system(size: 13, weight: .semibold)).foregroundStyle(ZQ.text).lineLimit(1)
        Spacer()
        Text(status(cfg, entry.state)).font(.system(size: 12)).foregroundStyle(hasMessage(entry.state) ? ZQ.warn : ZQ.muted).lineLimit(1)
      }
      HStack(spacing: 8) {
        MuteButton(state: entry.state, enabled: cfg != nil)
        StepButton(delta: -Pill.step, enabled: cfg != nil).frame(width: 36)
        SegmentBar(volume: entry.state.volume, enabled: cfg != nil)
        StepButton(delta: Pill.step, enabled: cfg != nil).frame(width: 36)
        Text("\(entry.state.volume)").font(.system(size: 18, weight: .semibold)).foregroundStyle(ZQ.text).frame(minWidth: 30)
      }
      if let cfg {
        HStack(spacing: 6) {
          let inputs = Array(cfg.visibleInputs().prefix(4))
          ForEach(inputs, id: \.mid) { InputButton(input: $0, active: $0.mid == entry.state.activeMid) }
          ForEach(inputs.count..<4, id: \.self) { _ in Color.clear.frame(maxWidth: .infinity) }
        }
        .frame(height: 52)
      }
    }
    .containerBackground(ZQ.bg, for: .widget)
    .widgetURL(cfg == nil ? URL(string: "zapbar://remote") : nil)
  }
}

struct ZapbarRemote: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "ZapbarRemote", provider: QuickProvider()) { RemoteView(entry: $0) }
      .configurationDisplayName("Remote")
      .description("Volume, mute and your inputs.")
      .supportedFamilies([.systemMedium])
  }
}
