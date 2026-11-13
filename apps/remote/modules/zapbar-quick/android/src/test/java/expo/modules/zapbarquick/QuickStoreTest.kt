package expo.modules.zapbarquick

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class QuickStoreTest {
  private val json = """{"key":"TESTSERIAL0001","serial":"TESTSERIAL0001","lastIp":"10.0.0.82","name":"Loving room",
    "inputs":[{"mid":"inputs/hdmi_in_1","label":"PS5","icon":"playstation","hidden":false},{"mid":"inputs/aux_in_1","label":"AUX","icon":"audio","hidden":true}],
    "volumeKeys":true,"notification":false}"""

  @Test fun `config round-trips through JSON`() {
    val c = QuickConfig.fromJson(json)!!
    assertEquals("Loving room", c.name)
    assertEquals(2, c.inputs.size)
    assertEquals("playstation", c.inputs[0].icon)
    assertEquals(false, c.notification)
    assertEquals(c, QuickConfig.fromJson(c.toJson()))
  }

  @Test fun `volumeCap round-trips and defaults to 100`() {
    assertEquals(100, QuickConfig.fromJson(json)!!.volumeCap)
    val c = QuickConfig.fromJson(json)!!.copy(volumeCap = 30)
    assertEquals(30, QuickConfig.fromJson(c.toJson())!!.volumeCap)
  }

  @Test fun `cappedNeverRaisesAboveCurrent`() {
    val c = QuickConfig.fromJson(json)!!.copy(volumeCap = 30)
    assertEquals(50, c.capped(55, 50))
    assertEquals(30, c.capped(40, 20))
    assertEquals(10, c.capped(10, 50))
    assertEquals(77, QuickConfig.fromJson(json)!!.capped(77, 10))
  }

  @Test fun `visible inputs keep app order and drop hidden ones`() {
    assertEquals(listOf("inputs/hdmi_in_1"), QuickConfig.fromJson(json)!!.visibleInputs().map { it.mid })
  }

  @Test fun `bad JSON gives no config`() {
    assertNull(QuickConfig.fromJson("{not json"))
  }

  @Test fun `state round-trips and defaults`() {
    val s = QuickState(volume = 42, mute = true, activeMid = "inputs/hdmi_in_1", playState = "play")
    assertEquals(s, QuickState.fromJson(s.toJson()))
    assertEquals(QuickState(), QuickState.fromJson(null))
  }
}
