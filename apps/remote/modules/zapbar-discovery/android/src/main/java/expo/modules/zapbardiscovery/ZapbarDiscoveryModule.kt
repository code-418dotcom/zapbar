package expo.modules.zapbardiscovery

import android.content.Context
import android.net.wifi.WifiManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.net.SocketTimeoutException

// SSDP M-SEARCH over UDP multicast. Android drops inbound multicast replies unless a
// MulticastLock is held, so the lock spans the whole search.
class ZapbarDiscoveryModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ZapbarDiscovery")

    AsyncFunction("searchAsync") { message: String, timeoutMs: Int ->
      val context = appContext.reactContext ?: throw IllegalStateException("No Android context")
      val wifi = context.applicationContext.getSystemService(Context.WIFI_SERVICE) as WifiManager
      val lock = wifi.createMulticastLock("zapbar-ssdp").apply {
        setReferenceCounted(false)
        acquire()
      }
      val replies = mutableListOf<Map<String, String>>()
      try {
        DatagramSocket().use { socket ->
          socket.soTimeout = 250
          val bytes = message.toByteArray(Charsets.US_ASCII)
          val packet = DatagramPacket(bytes, bytes.size, InetAddress.getByName("239.255.255.250"), 1900)
          val start = System.currentTimeMillis()
          val deadline = start + timeoutMs
          var resent = false
          socket.send(packet)
          val buf = ByteArray(2048)
          while (System.currentTimeMillis() < deadline) {
            if (!resent && System.currentTimeMillis() - start > 500) {
              socket.send(packet)
              resent = true
            }
            val reply = DatagramPacket(buf, buf.size)
            try {
              socket.receive(reply)
            } catch (e: SocketTimeoutException) {
              continue
            }
            replies.add(mapOf(
              "ip" to (reply.address.hostAddress ?: ""),
              "text" to String(reply.data, 0, reply.length, Charsets.US_ASCII),
            ))
          }
        }
      } finally {
        lock.release()
      }
      replies
    }
  }
}
