package expo.modules.zapbarquick

import expo.modules.zapbarquick.heos.UnreachableException
import expo.modules.zapbarquick.slider.SliderLink
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class SliderLinkTest {
  private val cfg = QuickConfig("K", "K", "10.0.0.82", "Loving room", emptyList(), true, true)

  @Test fun `keeps one connection for the whole drag and sends only set_volume`() {
    var connects = 0
    val bar = QuickActionsTest.FakeBar()
    val link = SliderLink(cfg, clock = { 0L }, current = { 0 }) { connects++; bar }
    listOf(10, 20, 30, 40, 50).forEach { assertNull(link.send(it)) }
    assertEquals(1, connects)
    assertEquals(listOf("vol 10", "vol 20", "vol 30", "vol 40", "vol 50"), bar.log)
  }

  @Test fun `an unreachable bar fails fast for 10 s instead of reconnecting on every tick`() {
    var connects = 0; var now = 0L
    val link = SliderLink(cfg, clock = { now }, current = { 0 }) { connects++; throw UnreachableException("x") }
    assertEquals("Open Zapbar to reconnect", link.send(10))
    now = 5_000; assertEquals("Open Zapbar to reconnect", link.send(20))
    assertEquals(1, connects)
    now = 11_000; link.send(30)
    assertEquals(2, connects)
  }

  @Test fun `caps against the last saved volume`() {
    val bar = QuickActionsTest.FakeBar()
    val link = SliderLink(cfg.copy(volumeCap = 30), clock = { 0L }, current = { 20 }) { bar }
    link.send(80); link.send(10)
    assertEquals(listOf("vol 30", "vol 10"), bar.log)
  }
}
