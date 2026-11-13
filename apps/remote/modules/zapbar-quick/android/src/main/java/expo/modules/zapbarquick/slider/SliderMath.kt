package expo.modules.zapbarquick.slider

/** Same geometry as the app's PillSlider: the knob centre travels from knob/2 to width - knob/2. */
object SliderMath {
  fun valueAt(x: Float, width: Float, knob: Float): Int {
    val span = (width - knob).coerceAtLeast(1f)
    return (((x - knob / 2) / span) * 100).toInt().coerceIn(0, 100)
  }
  fun knobCentre(value: Int, width: Float, knob: Float): Float = knob / 2 + (value.coerceIn(0, 100) / 100f) * (width - knob)
}

/** At most one send per interval while dragging; flush() sends the last value if it was held back. */
class Coalescer(private val intervalMs: Long, private val clock: () -> Long, private val send: (Int) -> Unit) {
  private var lastSent = Long.MIN_VALUE / 2
  private var lastValue: Int? = null
  private var pending: Int? = null

  fun push(v: Int) {
    val now = clock()
    if (now - lastSent >= intervalMs) { lastSent = now; lastValue = v; pending = null; send(v) } else pending = v
  }

  fun flush() {
    val p = pending ?: return
    pending = null
    if (p != lastValue) { lastSent = clock(); lastValue = p; send(p) }
  }
}
