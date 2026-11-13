package expo.modules.zapbarquick.slider

import expo.modules.zapbarquick.HeosQuickLike
import expo.modules.zapbarquick.QuickConfig
import expo.modules.zapbarquick.heos.UnreachableException

/**
 * One connection for the slider's lifetime: drags send only set_volume. After an unreachable bar it fails fast for
 * 10 s, so queued ticks don't each wait out the connect timeout. Not thread-safe: use from one worker thread.
 */
class SliderLink(private val cfg: QuickConfig, private val clock: () -> Long, private val current: () -> Int, private val connect: (String) -> HeosQuickLike) {
  private var bar: HeosQuickLike? = null
  private var pid = 0
  private var failedUntil = 0L

  /** Caps against the last saved volume, as the slider has no fresh reading mid-drag. Returns null on success, or the message to show. */
  fun send(volume: Int): String? = use { it.setVolume(pid, cfg.capped(volume.coerceIn(0, 100), current())) }

  fun <T> read(block: (HeosQuickLike, Int) -> T): T? = try { open()?.let { block(it, pid) } } catch (e: Exception) { drop(); null }

  private fun use(block: (HeosQuickLike) -> Unit): String? {
    if (clock() < failedUntil) return RECONNECT
    return try {
      val b = open() ?: return RECONNECT
      block(b)
      null
    } catch (e: Exception) {
      drop()
      "Soundbar didn't respond"
    }
  }

  private fun open(): HeosQuickLike? {
    bar?.let { return it }
    return try {
      val b = connect(cfg.lastIp)
      pid = b.pidFor(cfg.serial)
      bar = b
      b
    } catch (e: UnreachableException) {
      failedUntil = clock() + 10_000
      null
    }
  }

  private fun drop() { runCatching { bar?.close() }; bar = null }

  fun close() = drop()

  companion object { const val RECONNECT = "Open Zapbar to reconnect" }
}
