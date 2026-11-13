package expo.modules.zapbarquick

import android.content.Context
import expo.modules.zapbarquick.heos.HeosLite
import expo.modules.zapbarquick.heos.HeosQuick
import expo.modules.zapbarquick.heos.UnreachableException

interface QuickBackend {
  fun config(): QuickConfig?
  fun state(): QuickState
  fun saveState(s: QuickState)
}

/** The subset of HeosQuick the actions use, so tests can fake the bar. */
interface HeosQuickLike {
  fun pidFor(serial: String): Int
  fun volume(pid: Int): Int
  fun setVolume(pid: Int, v: Int)
  fun mute(pid: Int): Boolean
  fun setMute(pid: Int, on: Boolean)
  fun playInput(pid: Int, mid: String)
  fun nowPlayingMid(pid: Int): String?
  fun playState(pid: Int): String
  fun close()
}

sealed class QuickAction {
  data class SetVolume(val volume: Int) : QuickAction()
  /** Relative change from the bar's current volume (notification − / +). */
  data class Step(val delta: Int) : QuickAction()
  object ToggleMute : QuickAction()
  data class PlayInput(val mid: String) : QuickAction()
  object Refresh : QuickAction()
}

/** One action at a time: connect, command, read back, disconnect. Never throws; failures become a header message. */
class QuickActions(private val backend: QuickBackend, private val connect: (String) -> HeosQuickLike) {
  /** [before] is the state prior to an optimistic paint; a failure restores it instead of keeping the guess. */
  fun run(action: QuickAction, before: QuickState? = null): QuickState = synchronized(LOCK) {
    val cfg = backend.config() ?: return message("Open Zapbar to set up", before)
    val bar = try { connect(cfg.lastIp) } catch (e: UnreachableException) { return message("Open Zapbar to reconnect", before) } catch (e: Exception) { return message("Soundbar didn't respond", before) }
    try {
      val pid = bar.pidFor(cfg.serial)
      when (action) {
        is QuickAction.SetVolume -> {
          val target = action.volume.coerceIn(0, 100)
          // At or under the cap the current volume cannot change the result; skip the round trip.
          bar.setVolume(pid, if (target <= cfg.volumeCap) target else cfg.capped(target, bar.volume(pid)))
        }
        is QuickAction.Step -> {
          val cur = bar.volume(pid)
          bar.setVolume(pid, cfg.capped((cur + action.delta).coerceIn(0, 100), cur))
        }
        is QuickAction.ToggleMute -> bar.setMute(pid, !bar.mute(pid))
        is QuickAction.PlayInput -> bar.playInput(pid, action.mid)
        is QuickAction.Refresh -> Unit
      }
      val s = QuickState(volume = bar.volume(pid), mute = bar.mute(pid), activeMid = bar.nowPlayingMid(pid), playState = bar.playState(pid))
      backend.saveState(s)
      s
    } catch (e: Exception) {
      message("Soundbar didn't respond", before)
    } finally {
      bar.close()
    }
  }

  private fun message(text: String, before: QuickState?): QuickState {
    val s = (before ?: backend.state()).copy(message = text, messageUntil = System.currentTimeMillis() + 3000)
    backend.saveState(s)
    return s
  }

  companion object {
    private val LOCK = Any()

    /** A live HeosQuick over a fresh HeosLite connection; throws UnreachableException when the bar can't be reached. */
    fun realConnect(ip: String): HeosQuickLike {
      val lite = HeosLite(ip).also { it.connect() }
      val q = HeosQuick(lite)
      return object : HeosQuickLike {
        override fun pidFor(serial: String) = q.pidFor(serial)
        override fun volume(pid: Int) = q.volume(pid)
        override fun setVolume(pid: Int, v: Int) = q.setVolume(pid, v)
        override fun mute(pid: Int) = q.mute(pid)
        override fun setMute(pid: Int, on: Boolean) = q.setMute(pid, on)
        override fun playInput(pid: Int, mid: String) = q.playInput(pid, mid)
        override fun nowPlayingMid(pid: Int) = q.nowPlayingMid(pid)
        override fun playState(pid: Int) = q.playState(pid)
        override fun close() = lite.close()
      }
    }

    fun forContext(ctx: Context): QuickActions {
      val store = QuickStore(ctx)
      val backend = object : QuickBackend {
        override fun config() = store.config()
        override fun state() = store.state()
        override fun saveState(s: QuickState) = store.saveState(s)
      }
      return QuickActions(backend, ::realConnect)
    }
  }
}
