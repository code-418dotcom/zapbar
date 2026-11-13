package expo.modules.zapbarquick

import org.junit.Assert.assertEquals
import org.junit.Test

class PillTest {
  @Test fun `segment i sets volume 5 times i plus 1`() {
    assertEquals(5, Pill.volumeFor(0)); assertEquals(50, Pill.volumeFor(9)); assertEquals(100, Pill.volumeFor(19))
  }
  @Test fun `filled segments round to the nearest 5 and clamp`() {
    assertEquals(0, Pill.filled(0)); assertEquals(0, Pill.filled(2)); assertEquals(1, Pill.filled(3))
    assertEquals(8, Pill.filled(42)); assertEquals(20, Pill.filled(100)); assertEquals(20, Pill.filled(150)); assertEquals(0, Pill.filled(-5))
  }
  @Test fun `knob sits on the last filled segment`() {
    assertEquals(Pill.Kind.FILL, Pill.kind(0, 42)); assertEquals(Pill.Kind.KNOB, Pill.kind(7, 42)); assertEquals(Pill.Kind.TRACK, Pill.kind(8, 42))
    assertEquals(Pill.Kind.TRACK, Pill.kind(0, 0))
  }
}
