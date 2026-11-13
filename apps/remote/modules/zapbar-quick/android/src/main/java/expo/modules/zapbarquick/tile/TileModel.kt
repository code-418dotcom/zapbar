package expo.modules.zapbarquick.tile

import expo.modules.zapbarquick.QuickConfig
import expo.modules.zapbarquick.QuickState

data class TileLook(val active: Boolean?, val label: String, val subtitle: String)

object TileModel {
  fun state(cfg: QuickConfig?, s: QuickState, now: Long = System.currentTimeMillis()): TileLook = when {
    cfg == null -> TileLook(null, "Mute", "Open Zapbar to set up")
    s.message != null && now < s.messageUntil -> TileLook(s.mute, "Mute", s.message)
    else -> TileLook(s.mute, "Mute", cfg.name)
  }
}
