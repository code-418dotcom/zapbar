package expo.modules.zapbarquick.heos

import org.json.JSONObject
import java.io.BufferedReader
import java.net.InetSocketAddress
import java.net.Socket
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.TimeUnit
import kotlin.concurrent.thread

data class Reply(val command: String, val message: Map<String, String>, val payload: Any?)
class HeosException(message: String) : Exception(message)
class UnreachableException(message: String) : Exception(message)

/**
 * One command at a time, like heos-core's HeosCliClient: replies carry only the command name.
 * A reader thread splits events (to onEvent) from replies (to a queue the caller waits on).
 */
class HeosLite(private val host: String, private val port: Int = 1255, private val timeoutMs: Long = 3000) {
  @Volatile var onEvent: ((String, Map<String, String>) -> Unit)? = null
  /** Fires once when the connection ends for any reason (bar restart, timeout, close()). */
  @Volatile var onClose: (() -> Unit)? = null
  @Volatile var isClosed = false
    private set
  private var socket: Socket? = null
  private val replies = LinkedBlockingQueue<JSONObject>()
  private val lock = Any()

  fun connect() {
    val s = Socket()
    try {
      s.connect(InetSocketAddress(host, port), timeoutMs.toInt())
    } catch (e: Exception) {
      s.close()
      throw UnreachableException("Can't reach $host:$port")
    }
    socket = s
    val reader: BufferedReader = s.getInputStream().bufferedReader()
    thread(isDaemon = true, name = "heos-lite-reader") {
      try {
        while (true) {
          val line = reader.readLine() ?: break
          val json = try { JSONObject(line) } catch (e: Exception) { continue }
          val heos = json.optJSONObject("heos") ?: continue
          val command = heos.optString("command")
          if (command.startsWith("event/")) {
            onEvent?.invoke(command.removePrefix("event/"), HeosCodec.parse(heos.optString("message")))
          } else {
            replies.put(json)
          }
        }
      } catch (_: Exception) {
      }
      markClosed()
    }
  }

  private fun markClosed() {
    if (isClosed) return
    isClosed = true
    onClose?.invoke()
  }

  fun send(command: String, params: Map<String, Any> = emptyMap()): Reply = synchronized(lock) {
    val s = socket?.takeIf { !isClosed } ?: throw HeosException("Not connected")
    replies.clear()
    s.getOutputStream().write(HeosCodec.build(command, params).toByteArray())
    var deadline = System.currentTimeMillis() + timeoutMs
    while (true) {
      val left = deadline - System.currentTimeMillis()
      if (left <= 0) { close(); throw HeosException("$command timed out") }
      val json = replies.poll(left, TimeUnit.MILLISECONDS) ?: continue
      val heos = json.getJSONObject("heos")
      if (heos.optString("command") != command) continue
      val message = HeosCodec.parse(heos.optString("message"))
      if (message.containsKey("command under process")) { deadline = System.currentTimeMillis() + timeoutMs; continue }
      if (heos.optString("result") == "fail") throw HeosException("$command failed: ${message["text"] ?: message["eid"]}")
      return Reply(command, message, if (json.has("payload")) json.get("payload") else null)
    }
    @Suppress("UNREACHABLE_CODE") throw IllegalStateException()
  }

  fun close() {
    try { socket?.close() } catch (_: Exception) {}
    socket = null
    markClosed()
  }
}
