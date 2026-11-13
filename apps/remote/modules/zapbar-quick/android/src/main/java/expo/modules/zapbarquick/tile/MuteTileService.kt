package expo.modules.zapbarquick.tile

import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService
import expo.modules.zapbarquick.QuickAction
import expo.modules.zapbarquick.QuickActions
import expo.modules.zapbarquick.QuickHooks
import expo.modules.zapbarquick.QuickState
import expo.modules.zapbarquick.QuickStore
import java.util.concurrent.Executors

/** Spec §8: one-tap mute toggle; lit while muted. */
class MuteTileService : TileService() {
  private val worker = Executors.newSingleThreadExecutor()

  override fun onStartListening() {
    show(QuickStore(this).state())
    worker.execute { val s = QuickActions.forContext(applicationContext).run(QuickAction.Refresh); show(s) }
  }

  override fun onClick() {
    val store = QuickStore(this)
    show(store.state().let { it.copy(mute = !it.mute) })
    worker.execute {
      val s = QuickActions.forContext(applicationContext).run(QuickAction.ToggleMute)
      show(s)
      QuickHooks.refresh(applicationContext)
    }
  }

  private fun show(s: QuickState) {
    val tile = qsTile ?: return
    val look = TileModel.state(QuickStore(this).config(), s)
    tile.state = when (look.active) { null -> Tile.STATE_UNAVAILABLE; true -> Tile.STATE_ACTIVE; false -> Tile.STATE_INACTIVE }
    tile.label = look.label
    if (Build.VERSION.SDK_INT >= 29) tile.subtitle = look.subtitle
    tile.updateTile()
  }

  override fun onDestroy() { worker.shutdown(); super.onDestroy() }
}
