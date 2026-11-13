package expo.modules.zapbarquick

import expo.modules.zapbarquick.slider.Coalescer
import expo.modules.zapbarquick.slider.SliderMath
import org.junit.Assert.assertEquals
import org.junit.Test

class SliderMathTest {
  @Test fun `finger position maps linearly between the knob centres`() {
    assertEquals(0, SliderMath.valueAt(24f, 300f, 48f)); assertEquals(0, SliderMath.valueAt(0f, 300f, 48f))
    assertEquals(50, SliderMath.valueAt(150f, 300f, 48f)); assertEquals(100, SliderMath.valueAt(276f, 300f, 48f)); assertEquals(100, SliderMath.valueAt(400f, 300f, 48f))
  }
  @Test fun `knob centre is the inverse of the finger mapping`() {
    assertEquals(150f, SliderMath.knobCentre(50, 300f, 48f), 0.01f)
    assertEquals(24f, SliderMath.knobCentre(0, 300f, 48f), 0.01f)
  }
  @Test fun `coalescer sends at most one value per interval plus the final value`() {
    var now = 0L; val sent = mutableListOf<Int>()
    val c = Coalescer(150, { now }) { sent += it }
    c.push(10); now = 50; c.push(20); now = 100; c.push(30); now = 160; c.push(40); c.flush()
    assertEquals(listOf(10, 40), sent)
  }
}
