package expo.modules.zapbarquick.heos

import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

class HeosLiteTest {
  private lateinit var fake: FakeHeosServer
  private lateinit var lite: HeosLite

  @Before fun setUp() { fake = FakeHeosServer(); lite = HeosLite("127.0.0.1", fake.port, timeoutMs = 500); lite.connect() }
  @After fun tearDown() { lite.close(); fake.close() }

  @Test fun `escapes the three special characters both ways`() {
    assertEquals("a%26b%3Dc%25d", HeosCodec.encode("a&b=c%d"))
    assertEquals("a&b=c%d", HeosCodec.decode("a%26b%3Dc%25d"))
    assertEquals(mapOf("pid" to "1", "input" to "inputs/hdmi_in_1"), HeosCodec.parse("pid=1&input=inputs%2Fhdmi_in_1".replace("%2F", "/")))
  }

  @Test fun `quick commands round-trip against the fake`() {
    val q = HeosQuick(lite)
    val pid = q.pidFor("TESTSERIAL0001")
    assertEquals(7331878, pid)
    q.setVolume(pid, 42); assertEquals(42, q.volume(pid))
    q.setMute(pid, true); assertTrue(q.mute(pid))
    q.playInput(pid, "inputs/hdmi_in_2"); assertEquals("inputs/hdmi_in_2", q.nowPlayingMid(pid))
    assertEquals("play", q.playState(pid))
  }

  @Test fun `waits through command under process`() {
    fake.underProcessFirst = true
    assertEquals(30, HeosQuick(lite).volume(7331878))
  }

  @Test(expected = HeosException::class) fun `times out when the bar is silent`() {
    fake.silent = true
    HeosQuick(lite).volume(7331878)
  }

  @Test fun `delivers change events`() {
    val latch = CountDownLatch(1)
    var got: Pair<String, Map<String, String>>? = null
    lite.onEvent = { e, m -> got = e to m; latch.countDown() }
    HeosQuick(lite).registerEvents()
    fake.emit("player_volume_changed", "pid=7331878&level=55&mute=off")
    assertTrue(latch.await(1, TimeUnit.SECONDS))
    assertEquals("player_volume_changed", got!!.first)
    assertEquals("55", got!!.second["level"])
  }

  @Test fun `notices when the bar drops the connection`() {
    val latch = CountDownLatch(1)
    lite.onClose = { latch.countDown() }
    fake.dropClient()
    assertTrue(latch.await(1, TimeUnit.SECONDS))
    assertTrue(lite.isClosed)
    try { HeosQuick(lite).volume(7331878); org.junit.Assert.fail("send on a dropped connection must throw") } catch (e: HeosException) {}
  }

  @Test(expected = UnreachableException::class) fun `unreachable host reports reconnect, not a crash`() {
    HeosLite("127.0.0.1", 1, timeoutMs = 300).connect()
  }
}
