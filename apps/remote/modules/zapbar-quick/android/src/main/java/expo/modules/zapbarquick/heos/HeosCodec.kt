package expo.modules.zapbarquick.heos

/** HEOS CLI message encoding: values escape exactly &, = and % (same rules as heos-core cli/message.ts). */
object HeosCodec {
  fun encode(v: String): String = v.replace("%", "%25").replace("&", "%26").replace("=", "%3D")

  fun decode(v: String): String = Regex("%26|%3D|%25", RegexOption.IGNORE_CASE).replace(v) {
    when (it.value.uppercase()) { "%26" -> "&"; "%3D" -> "="; else -> "%" }
  }

  fun parse(message: String): Map<String, String> {
    if (message.isEmpty()) return emptyMap()
    return message.split("&").filter { it.isNotEmpty() }.associate { part ->
      val i = part.indexOf('=')
      if (i == -1) decode(part) to "" else decode(part.substring(0, i)) to decode(part.substring(i + 1))
    }
  }

  fun build(command: String, params: Map<String, Any> = emptyMap()): String {
    val q = params.entries.joinToString("&") { (k, v) -> "$k=${encode(v.toString())}" }
    return "heos://$command${if (q.isEmpty()) "" else "?$q"}\r\n"
  }
}
