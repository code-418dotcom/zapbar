import SwiftUI
import WidgetKit

struct QuickEntry: TimelineEntry {
  let date: Date
  let config: QuickConfig?
  let state: QuickState
}

/// Reads the App Group; the app (setConfig/setState) and the intents keep it current and reload the timelines.
struct QuickProvider: TimelineProvider {
  func placeholder(in context: Context) -> QuickEntry { QuickEntry(date: .now, config: nil, state: QuickState(volume: 30)) }

  func getSnapshot(in context: Context, completion: @escaping (QuickEntry) -> Void) { completion(current()) }

  func getTimeline(in context: Context, completion: @escaping (Timeline<QuickEntry>) -> Void) {
    completion(Timeline(entries: [current()], policy: .after(.now.addingTimeInterval(15 * 60))))
  }

  private func current() -> QuickEntry {
    let b = GroupBackend()
    return QuickEntry(date: .now, config: b.config(), state: b.state())
  }
}

@main
struct ZapbarWidgetBundle: WidgetBundle {
  var body: some Widget {
    ZapbarVolume()
    ZapbarRemote()
  }
}
