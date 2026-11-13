package expo.modules.zapbarquick

import expo.modules.zapbarquick.live.LiveInputs
import expo.modules.zapbarquick.live.LiveRules
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class LiveRulesTest {
  private val on = LiveInputs(appForeground = false, playing = true, onLan = true, volumeKeys = true, notification = true, idleSinceMs = null)

  @Test fun `runs while the app is in the foreground`() = assertTrue(LiveRules.shouldRun(on.copy(appForeground = true, playing = false), 0))
  @Test fun `keeps running in the background while the bar plays`() = assertTrue(LiveRules.shouldRun(on, 0))
  @Test fun `stops when idle 5 minutes in background`() {
    val idle = on.copy(playing = false, idleSinceMs = 0)
    assertTrue(LiveRules.shouldRun(idle, LiveRules.IDLE_MS - 1))
    assertFalse(LiveRules.shouldRun(idle, LiveRules.IDLE_MS))
  }
  @Test fun `stops off the LAN`() = assertFalse(LiveRules.shouldRun(on.copy(appForeground = true, onLan = false), 0))
  @Test fun `does not run with both settings off`() = assertFalse(LiveRules.shouldRun(on.copy(appForeground = true, volumeKeys = false, notification = false), 0))
  @Test fun `media session follows the volume-keys setting while connected`() {
    assertEquals(LiveRules.Session.CREATE, LiveRules.sessionAction(hasSession = false, volumeKeys = true, connected = true))
    assertEquals(LiveRules.Session.RELEASE, LiveRules.sessionAction(hasSession = true, volumeKeys = false, connected = true))
    assertEquals(LiveRules.Session.RELEASE, LiveRules.sessionAction(hasSession = true, volumeKeys = true, connected = false))
    assertEquals(LiveRules.Session.KEEP, LiveRules.sessionAction(hasSession = true, volumeKeys = true, connected = true))
    assertEquals(LiveRules.Session.KEEP, LiveRules.sessionAction(hasSession = false, volumeKeys = true, connected = false))
  }

  @Test fun `volume-key steps clamp at 0 and 100`() {
    assertEquals(44, LiveRules.stepVolume(42, 1)); assertEquals(40, LiveRules.stepVolume(42, -1))
    assertEquals(100, LiveRules.stepVolume(99, 1)); assertEquals(0, LiveRules.stepVolume(1, -1)); assertEquals(42, LiveRules.stepVolume(42, 0))
  }
}
