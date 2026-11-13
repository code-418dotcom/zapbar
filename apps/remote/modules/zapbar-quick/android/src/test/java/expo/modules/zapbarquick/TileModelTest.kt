package expo.modules.zapbarquick

import expo.modules.zapbarquick.tile.TileModel
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class TileModelTest {
  private val cfg = QuickConfig("K", "K", "10.0.0.82", "Loving room", emptyList(), true, true)
  @Test fun `lit while muted, with the room as subtitle`() {
    val look = TileModel.state(cfg, QuickState(mute = true))
    assertEquals(true, look.active); assertEquals("Mute", look.label); assertEquals("Loving room", look.subtitle)
  }
  @Test fun `off while unmuted`() = assertEquals(false, TileModel.state(cfg, QuickState(mute = false)).active)
  @Test fun `shows a recent failure as the subtitle`() {
    val s = QuickState(mute = false, message = "Open Zapbar to reconnect", messageUntil = 2_000)
    assertEquals("Open Zapbar to reconnect", TileModel.state(cfg, s, now = 1_000).subtitle)
    assertEquals("Loving room", TileModel.state(cfg, s, now = 3_000).subtitle)
  }
  @Test fun `unavailable without config`() = assertNull(TileModel.state(null, QuickState()).active)
}
