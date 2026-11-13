package expo.modules.zapbarquick

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

data class QuickInput(val mid: String, val label: String, val icon: String, val hidden: Boolean)

/** Snapshot the JS app writes; native code only reads it. */
data class QuickConfig(
  val key: String,
  val serial: String,
  val lastIp: String,
  val name: String,
  val inputs: List<QuickInput>,
  val volumeKeys: Boolean,
  val notification: Boolean,
  val volumeCap: Int = 100,
) {
  fun visibleInputs(): List<QuickInput> = inputs.filter { !it.hidden }

  /** Limits [target] to the cap, but never raises a volume that is already above it (mirrors volume.ts `capped`). */
  fun capped(target: Int, current: Int): Int = if (target <= volumeCap) target else maxOf(volumeCap, minOf(current, target))

  fun toJson(): String = JSONObject()
    .put("key", key).put("serial", serial).put("lastIp", lastIp).put("name", name)
    .put("inputs", JSONArray(inputs.map { JSONObject().put("mid", it.mid).put("label", it.label).put("icon", it.icon).put("hidden", it.hidden) }))
    .put("volumeKeys", volumeKeys).put("notification", notification).put("volumeCap", volumeCap).toString()

  companion object {
    fun fromJson(json: String?): QuickConfig? = try {
      val o = JSONObject(json ?: return null)
      val arr = o.getJSONArray("inputs")
      QuickConfig(
        key = o.getString("key"), serial = o.getString("serial"), lastIp = o.getString("lastIp"), name = o.getString("name"),
        inputs = (0 until arr.length()).map { arr.getJSONObject(it) }.map { QuickInput(it.getString("mid"), it.getString("label"), it.getString("icon"), it.getBoolean("hidden")) },
        volumeKeys = o.optBoolean("volumeKeys", true), notification = o.optBoolean("notification", true), volumeCap = o.optInt("volumeCap", 100),
      )
    } catch (e: Exception) { null }
  }
}

/** Caps through the config when there is one; without a config the volume passes unchanged. */
fun QuickConfig?.capVolume(target: Int, current: Int): Int = this?.capped(target, current) ?: target

/** Last known bar state, persisted so widgets render instantly; message shows in the widget header until messageUntil. */
data class QuickState(
  val volume: Int = 0,
  val mute: Boolean = false,
  val activeMid: String? = null,
  val playState: String = "stop",
  val message: String? = null,
  val messageUntil: Long = 0,
) {
  fun toJson(): String = JSONObject().put("volume", volume).put("mute", mute).put("activeMid", activeMid ?: JSONObject.NULL)
    .put("playState", playState).put("message", message ?: JSONObject.NULL).put("messageUntil", messageUntil).toString()

  companion object {
    fun fromJson(json: String?): QuickState = try {
      val o = JSONObject(json ?: return QuickState())
      QuickState(
        volume = o.optInt("volume"), mute = o.optBoolean("mute"),
        activeMid = if (o.isNull("activeMid")) null else o.optString("activeMid"),
        playState = o.optString("playState", "stop"),
        message = if (o.isNull("message")) null else o.optString("message"),
        messageUntil = o.optLong("messageUntil"),
      )
    } catch (e: Exception) { QuickState() }
  }
}

class QuickStore(context: Context) {
  private val prefs = context.applicationContext.getSharedPreferences("zapbar_quick", Context.MODE_PRIVATE)
  fun config(): QuickConfig? = QuickConfig.fromJson(prefs.getString("config", null))
  fun saveConfig(json: String) { prefs.edit().putString("config", json).apply() }
  fun state(): QuickState = QuickState.fromJson(prefs.getString("state", null))
  fun saveState(s: QuickState) { prefs.edit().putString("state", s.toJson()).apply() }
}
