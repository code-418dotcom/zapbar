package expo.modules.zapbarquick

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import expo.modules.zapbarquick.widget.WidgetUpdater
import java.util.concurrent.Executors

/** Widget, notification and slider taps arrive here; work runs off the main thread under goAsync(). */
class QuickReceiver : BroadcastReceiver() {
  override fun onReceive(ctx: Context, intent: Intent) {
    val action = when (intent.getStringExtra("type")) {
      "volume" -> QuickAction.SetVolume(intent.getIntExtra("value", 0))
      "mute" -> QuickAction.ToggleMute
      "step" -> QuickAction.Step(intent.getIntExtra("value", 0))
      "input" -> intent.getStringExtra("mid")?.let { QuickAction.PlayInput(it) } ?: return
      else -> QuickAction.Refresh
    }
    runAsync(ctx, goAsync(), action)
  }

  companion object {
    const val ACTION = "expo.modules.zapbarquick.ACTION"
    private val worker = Executors.newSingleThreadExecutor()

    fun runAsync(ctx: Context, pending: PendingResult?, action: QuickAction) {
      val app = ctx.applicationContext
      // Optimistic first paint for inputs and volume, then the read-back repaint.
      val store = QuickStore(app)
      val s = store.state()
      val before = s
      when (action) {
        is QuickAction.PlayInput -> store.saveState(s.copy(activeMid = action.mid))
        is QuickAction.SetVolume -> store.saveState(s.copy(volume = store.config().capVolume(action.volume, s.volume)))
        is QuickAction.Step -> store.saveState(s.copy(volume = store.config().capVolume((s.volume + action.delta).coerceIn(0, 100), s.volume)))
        else -> Unit
      }
      QuickHooks.refresh(app)
      worker.execute {
        try {
          QuickActions.forContext(app).run(action, before)
          QuickHooks.refresh(app)
        } finally {
          pending?.finish()
        }
      }
    }
  }
}
