package expo.modules.zapbarquick.heos

import java.net.ServerSocket
import java.net.Socket
import kotlin.concurrent.thread

/** Minimal HEOS CLI stand-in: answers commands from a script and can push events. */
class FakeHeosServer {
  val server = ServerSocket(0)
  val port get() = server.localPort
  val received = mutableListOf<String>()
  var volume = 30
  var mute = false
  var mid = "inputs/hdmi_in_1"
  var playState = "play"
  var underProcessFirst = false
  var silent = false
  private var client: Socket? = null

  init {
    thread(isDaemon = true) {
      while (!server.isClosed) {
        val s = try { server.accept() } catch (e: Exception) { break }
        client = s
        thread(isDaemon = true) { serve(s) }
      }
    }
  }

  private fun reply(s: Socket, command: String, message: String, payload: String? = null) {
    val p = if (payload != null) ""","payload":$payload""" else ""
    s.getOutputStream().write("""{"heos":{"command":"$command","result":"success","message":"$message"}$p}""".plus("\r\n").toByteArray())
  }

  fun emit(event: String, message: String) {
    client?.getOutputStream()?.write("""{"heos":{"command":"event/$event","message":"$message"}}""".plus("\r\n").toByteArray())
  }

  private fun serve(s: Socket) {
    val r = s.getInputStream().bufferedReader()
    while (true) {
      val line = r.readLine() ?: break
      synchronized(received) { received.add(line) }
      if (silent) continue
      val cmd = line.removePrefix("heos://").substringBefore("?")
      val q = HeosCodec.parse(line.substringAfter("?", ""))
      if (underProcessFirst) { underProcessFirst = false; reply(s, cmd, "command under process&pid=1") ; Thread.sleep(100) }
      when (cmd) {
        "player/get_players" -> reply(s, cmd, "", """[{"name":"Loving room","pid":7331878,"serial":"TESTSERIAL0001"}]""")
        "player/get_volume" -> reply(s, cmd, "pid=7331878&level=$volume")
        "player/set_volume" -> { volume = q["level"]!!.toInt(); reply(s, cmd, "pid=7331878&level=$volume") }
        "player/get_mute" -> reply(s, cmd, "pid=7331878&state=${if (mute) "on" else "off"}")
        "player/set_mute" -> { mute = q["state"] == "on"; reply(s, cmd, "pid=7331878&state=${q["state"]}") }
        "player/get_play_state" -> reply(s, cmd, "pid=7331878&state=$playState")
        "player/get_now_playing_media" -> reply(s, cmd, "pid=7331878", """{"type":"station","mid":"$mid"}""")
        "browse/play_input" -> { mid = q["input"]!!; reply(s, cmd, "pid=7331878&input=${HeosCodec.encode(mid)}") }
        "system/register_for_change_events" -> reply(s, cmd, "enable=on")
        else -> reply(s, cmd, "")
      }
    }
  }

  fun dropClient() { client?.close() }
  fun close() { server.close(); client?.close() }
}
