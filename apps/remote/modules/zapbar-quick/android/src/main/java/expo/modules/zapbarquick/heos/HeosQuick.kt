package expo.modules.zapbarquick.heos

import org.json.JSONArray
import org.json.JSONObject

/** The handful of commands quick access needs, on top of HeosLite. */
class HeosQuick(private val lite: HeosLite) {
  fun pidFor(serial: String): Int {
    val players = lite.send("player/get_players").payload as? JSONArray ?: throw HeosException("No players")
    for (i in 0 until players.length()) {
      val p = players.getJSONObject(i)
      if (p.optString("serial") == serial) return p.getInt("pid")
    }
    if (players.length() == 1) return players.getJSONObject(0).getInt("pid")
    throw HeosException("Soundbar $serial not found")
  }

  fun volume(pid: Int): Int = lite.send("player/get_volume", mapOf("pid" to pid)).message["level"]?.toIntOrNull() ?: 0
  fun setVolume(pid: Int, v: Int) { lite.send("player/set_volume", mapOf("pid" to pid, "level" to v.coerceIn(0, 100))) }
  fun mute(pid: Int): Boolean = lite.send("player/get_mute", mapOf("pid" to pid)).message["state"] == "on"
  fun setMute(pid: Int, on: Boolean) { lite.send("player/set_mute", mapOf("pid" to pid, "state" to if (on) "on" else "off")) }
  fun playInput(pid: Int, mid: String) { lite.send("browse/play_input", mapOf("pid" to pid, "input" to mid)) }
  fun playState(pid: Int): String = lite.send("player/get_play_state", mapOf("pid" to pid)).message["state"] ?: "stop"
  fun nowPlayingMid(pid: Int): String? = (lite.send("player/get_now_playing_media", mapOf("pid" to pid)).payload as? JSONObject)?.optString("mid")?.takeIf { it.isNotEmpty() }
  fun registerEvents() { lite.send("system/register_for_change_events", mapOf("enable" to "on")) }
}
