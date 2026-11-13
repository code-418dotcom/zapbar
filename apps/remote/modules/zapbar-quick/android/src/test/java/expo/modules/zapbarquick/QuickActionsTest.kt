package expo.modules.zapbarquick

import expo.modules.zapbarquick.heos.HeosException
import expo.modules.zapbarquick.heos.UnreachableException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

class QuickActionsTest {
  private val config = QuickConfig("K", "K", "10.0.0.82", "Loving room", listOf(QuickInput("inputs/hdmi_in_1", "PS5", "playstation", false)), true, true)

  class MemBackend(var cfg: QuickConfig?) : QuickBackend {
    var st = QuickState()
    override fun config() = cfg
    override fun state() = st
    override fun saveState(s: QuickState) { st = s }
  }

  class FakeBar : HeosQuickLike {
    var volume = 30; var mute = false; var mid = "inputs/hdmi_in_2"; val log = mutableListOf<String>()
    override fun pidFor(serial: String) = 1
    override fun volume(pid: Int) = volume
    override fun setVolume(pid: Int, v: Int) { log += "vol $v"; Thread.sleep(20); volume = v }
    override fun mute(pid: Int) = mute
    override fun setMute(pid: Int, on: Boolean) { log += "mute $on"; mute = on }
    override fun playInput(pid: Int, mid: String) { log += "input $mid"; this.mid = mid }
    override fun nowPlayingMid(pid: Int) = mid
    override fun playState(pid: Int) = "play"
    override fun close() {}
  }

  @Test fun `set volume at or under the cap does not read the bar first`() {
    var reads = 0
    val bar = object : HeosQuickLike by FakeBar() { override fun volume(pid: Int): Int { reads++; return 30 } }
    QuickActions(MemBackend(config)) { bar }.run(QuickAction.SetVolume(45))
    assertEquals(1, reads) // only the read-back after the command
  }

  @Test fun `set volume above the cap reads the bar to cap against it`() {
    var reads = 0
    val bar = object : HeosQuickLike by FakeBar() { override fun volume(pid: Int): Int { reads++; return 30 } }
    QuickActions(MemBackend(config.copy(volumeCap = 30))) { bar }.run(QuickAction.SetVolume(80))
    assertEquals(2, reads)
  }

  @Test fun `set volume then reads back state`() {
    val bar = FakeBar(); val be = MemBackend(config)
    val s = QuickActions(be) { bar }.run(QuickAction.SetVolume(45))
    assertEquals(45, s.volume); assertEquals("inputs/hdmi_in_2", s.activeMid); assertEquals(s, be.st)
  }

  @Test fun `step moves from the bar's current volume and clamps`() {
    val bar = FakeBar(); bar.volume = 98
    assertEquals(100, QuickActions(MemBackend(config)) { bar }.run(QuickAction.Step(5)).volume)
    bar.volume = 3
    assertEquals(0, QuickActions(MemBackend(config)) { bar }.run(QuickAction.Step(-5)).volume)
    bar.volume = 40
    assertEquals(45, QuickActions(MemBackend(config)) { bar }.run(QuickAction.Step(5)).volume)
  }

  @Test fun `step up stops at the cap`() {
    val bar = FakeBar(); bar.volume = 28
    val capped = config.copy(volumeCap = 30)
    assertEquals(30, QuickActions(MemBackend(capped)) { bar }.run(QuickAction.Step(5)).volume)
    assertEquals(30, QuickActions(MemBackend(capped)) { bar }.run(QuickAction.SetVolume(80)).volume)
  }

  @Test fun `toggle mute flips the bar's current state`() {
    val bar = FakeBar(); bar.mute = true
    assertEquals(false, QuickActions(MemBackend(config)) { bar }.run(QuickAction.ToggleMute).mute)
  }

  @Test fun `no config asks to set up`() {
    assertEquals("Open Zapbar to set up", QuickActions(MemBackend(null)) { FakeBar() }.run(QuickAction.Refresh).message)
  }

  @Test fun `unreachable host reports reconnect, not a crash`() {
    val s = QuickActions(MemBackend(config)) { throw UnreachableException("x") }.run(QuickAction.SetVolume(10))
    assertEquals("Open Zapbar to reconnect", s.message)
  }

  @Test fun `a silent bar reports it did not respond`() {
    val bad = object : HeosQuickLike by FakeBar() { override fun setVolume(pid: Int, v: Int) { throw HeosException("timed out") } }
    assertEquals("Soundbar didn't respond", QuickActions(MemBackend(config)) { bad }.run(QuickAction.SetVolume(10)).message)
  }

  @Test fun `a failure restores the state from before the optimistic write`() {
    val be = MemBackend(config); be.st = QuickState(volume = 30, activeMid = "inputs/hdmi_in_2")
    val before = be.st
    be.st = be.st.copy(volume = 80) // optimistic paint
    val s = QuickActions(be) { throw UnreachableException("x") }.run(QuickAction.SetVolume(80), before)
    assertEquals(30, s.volume); assertEquals("Open Zapbar to reconnect", s.message); assertEquals(30, be.st.volume)
  }

  @Test fun `actions are serialised and the last read-back wins`() {
    val bar = FakeBar(); val be = MemBackend(config); val qa = QuickActions(be) { bar }
    val pool = Executors.newFixedThreadPool(4)
    listOf(10, 20, 30, 40).forEach { v -> pool.submit { qa.run(QuickAction.SetVolume(v)) } }
    pool.shutdown(); assertTrue(pool.awaitTermination(5, TimeUnit.SECONDS))
    assertEquals(4, bar.log.size)
    assertEquals(bar.volume, be.st.volume)
  }
}
