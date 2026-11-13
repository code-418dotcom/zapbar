import ExpoModulesCore
import UIKit
import WidgetKit

/// The App Group shared with the widget extension (targets/widgets/Core/Shared.swift holds the same names).
private let group = UserDefaults(suiteName: "group.zapbar.app")

/// Coalesces timeline reloads: one reload 500 ms after the last request.
private final class DebouncedReload: @unchecked Sendable {
  private var pending: DispatchWorkItem?
  func schedule() {
    DispatchQueue.main.async {
      self.pending?.cancel()
      let work = DispatchWorkItem { WidgetCenter.shared.reloadAllTimelines() }
      self.pending = work
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.5, execute: work)
    }
  }
}

private let reload = DebouncedReload()

public class ZapbarQuickModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ZapbarQuick")

    // The widgets read this snapshot; buildQuickConfig in src/runtime/quick.ts writes it.
    Function("setConfig") { (json: String) in
      group?.set(json, forKey: "config")
      WidgetCenter.shared.reloadAllTimelines()
    }
    // Live state from the app; reloads are debounced so a volume drag is one widget refresh, not dozens.
    Function("setState") { (json: String) in
      group?.set(json, forKey: "state")
      reload.schedule()
    }
    Function("refreshWidgets") {
      WidgetCenter.shared.reloadAllTimelines()
    }
    // No iOS equivalent (spec §3).
    Function("setLiveWanted") { (_: Bool) in }
    Function("openBatterySettings") {}

    AsyncFunction("tick") {
      UIImpactFeedbackGenerator(style: .light).impactOccurred()
    }.runOnQueue(.main)
  }
}
