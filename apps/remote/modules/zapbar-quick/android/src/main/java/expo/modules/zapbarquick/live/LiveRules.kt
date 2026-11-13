package expo.modules.zapbarquick.live

data class LiveInputs(
  val appForeground: Boolean,
  val playing: Boolean,
  val onLan: Boolean,
  val volumeKeys: Boolean,
  val notification: Boolean,
  val idleSinceMs: Long?,
)

/** Spec §2: live while the app is open, or while the bar plays, plus 5 minutes of idle; never off the LAN. */
object LiveRules {
  const val IDLE_MS = 5 * 60_000L

  fun shouldRun(i: LiveInputs, nowMs: Long): Boolean {
    if (!i.onLan || (!i.volumeKeys && !i.notification)) return false
    if (i.appForeground || i.playing) return true
    val since = i.idleSinceMs ?: return false
    return nowMs - since < IDLE_MS
  }

  enum class Session { CREATE, RELEASE, KEEP }

  /** The remote-volume session exists only while connected and while the user wants volume keys. */
  fun sessionAction(hasSession: Boolean, volumeKeys: Boolean, connected: Boolean): Session = when {
    hasSession && (!volumeKeys || !connected) -> Session.RELEASE
    !hasSession && volumeKeys && connected -> Session.CREATE
    else -> Session.KEEP
  }

  /** Volume keys move 2 per press, clamped to 0–100. */
  fun stepVolume(current: Int, direction: Int): Int = (current + 2 * direction.coerceIn(-1, 1)).coerceIn(0, 100)
}
