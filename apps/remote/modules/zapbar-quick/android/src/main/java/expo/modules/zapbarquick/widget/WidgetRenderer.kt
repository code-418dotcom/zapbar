package expo.modules.zapbarquick.widget

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import androidx.core.content.ContextCompat
import expo.modules.zapbarquick.Pill
import expo.modules.zapbarquick.QuickConfig
import expo.modules.zapbarquick.QuickReceiver
import expo.modules.zapbarquick.QuickState
import expo.modules.zapbarquick.R

object WidgetRenderer {
  /**
   * Colours go in as resources on Android 12+, so the launcher resolves them and they follow a light/dark switch
   * without a redraw. Older versions get a resolved colour at render time.
   */
  private fun tintIcon(ctx: Context, v: RemoteViews, id: Int, colorRes: Int) {
    if (android.os.Build.VERSION.SDK_INT >= 31) v.setColorStateList(id, "setImageTintList", colorRes)
    else v.setInt(id, "setColorFilter", ContextCompat.getColor(ctx, colorRes))
  }

  private fun tintText(ctx: Context, v: RemoteViews, id: Int, colorRes: Int) {
    if (android.os.Build.VERSION.SDK_INT >= 31) v.setColorStateList(id, "setTextColor", colorRes)
    else v.setTextColor(id, ContextCompat.getColor(ctx, colorRes))
  }

  private val INPUT_IDS = arrayOf(
    Triple(R.id.zq_in_0, R.id.zq_in_0_icon, R.id.zq_in_0_label), Triple(R.id.zq_in_1, R.id.zq_in_1_icon, R.id.zq_in_1_label),
    Triple(R.id.zq_in_2, R.id.zq_in_2_icon, R.id.zq_in_2_label), Triple(R.id.zq_in_3, R.id.zq_in_3_icon, R.id.zq_in_3_label),
  )

  fun iconFor(id: String): Int = when (id) {
    "tv" -> R.drawable.zq_ic_television
    "decoder" -> R.drawable.zq_ic_television_box
    "playstation" -> R.drawable.zq_ic_sony_playstation
    "xbox" -> R.drawable.zq_ic_microsoft_xbox
    "switch" -> R.drawable.zq_ic_nintendo_switch
    "appletv" -> R.drawable.zq_ic_apple
    "chromecast" -> R.drawable.zq_ic_cast
    "firetv" -> R.drawable.zq_ic_fire
    "steam" -> R.drawable.zq_ic_steam
    "pc" -> R.drawable.zq_ic_desktop_tower_monitor
    "bluray" -> R.drawable.zq_ic_disc_player
    "gamepad" -> R.drawable.zq_ic_gamepad_variant
    "audio" -> R.drawable.zq_ic_audio_input_stereo_minijack
    else -> R.drawable.zq_ic_video_input_hdmi
  }

  fun broadcast(ctx: Context, request: Int, type: String, value: Int = 0, mid: String? = null): PendingIntent =
    PendingIntent.getBroadcast(ctx, request, Intent(ctx, QuickReceiver::class.java).setAction(QuickReceiver.ACTION).putExtra("type", type).putExtra("value", value).putExtra("mid", mid),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

  fun openSlider(ctx: Context): PendingIntent =
    PendingIntent.getActivity(ctx, 900, Intent(ctx, expo.modules.zapbarquick.slider.SliderActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK), PendingIntent.FLAG_IMMUTABLE)

  fun openApp(ctx: Context): PendingIntent? =
    ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)?.let { PendingIntent.getActivity(ctx, 901, it, PendingIntent.FLAG_IMMUTABLE) }

  /** Shared by widgets and the notification: mute, 20 pill segments, number. */
  fun bindVolumeRow(ctx: Context, v: RemoteViews, state: QuickState, enabled: Boolean) {
    for (i in 0 until Pill.SEGMENTS) {
      v.setInt(Pill.SEGMENT_IDS[i], "setBackgroundResource", Pill.drawable(i, state.volume))
      if (enabled) v.setOnClickPendingIntent(Pill.SEGMENT_IDS[i], broadcast(ctx, 100 + i, "volume", Pill.volumeFor(i)))
    }
    v.setImageViewResource(R.id.zq_mute, if (state.mute) R.drawable.zq_ic_volume_off else R.drawable.zq_ic_volume_high)
    tintIcon(ctx, v, R.id.zq_mute, if (state.mute) R.color.zq_warn else R.color.zq_text)
    v.setTextViewText(R.id.zq_volume, state.volume.toString())
    if (enabled) {
      v.setOnClickPendingIntent(R.id.zq_mute, broadcast(ctx, 99, "mute"))
      v.setOnClickPendingIntent(R.id.zq_volume, openSlider(ctx))
    }
  }

  fun status(cfg: QuickConfig?, state: QuickState, now: Long = System.currentTimeMillis()): String {
    if (cfg == null) return "Open Zapbar to set up"
    if (state.message != null && now < state.messageUntil) return state.message
    return cfg.inputs.firstOrNull { it.mid == state.activeMid }?.label ?: ""
  }

  /** Input tiles zq_in_0..count-1, shared by the 4x2 widget (4) and the expanded notification (3). */
  fun bindInputs(ctx: Context, v: RemoteViews, cfg: QuickConfig, state: QuickState, count: Int) {
    val inputs = cfg.visibleInputs().take(count)
    INPUT_IDS.take(count).forEachIndexed { i, (box, icon, label) ->
      val input = inputs.getOrNull(i)
      if (input == null) { v.setViewVisibility(box, android.view.View.INVISIBLE); return@forEachIndexed }
      val on = input.mid == state.activeMid
      v.setViewVisibility(box, android.view.View.VISIBLE)
      v.setInt(box, "setBackgroundResource", if (on) R.drawable.zq_bg_tile_on else R.drawable.zq_bg_tile)
      v.setImageViewResource(icon, iconFor(input.icon))
      val fg = if (on) R.color.zq_on_accent else R.color.zq_text
      tintIcon(ctx, v, icon, fg)
      v.setTextViewText(label, input.label)
      tintText(ctx, v, label, fg)
      v.setOnClickPendingIntent(box, broadcast(ctx, 200 + i, "input", mid = input.mid))
    }
  }

  fun large(ctx: Context, cfg: QuickConfig?, state: QuickState): RemoteViews {
    val v = RemoteViews(ctx.packageName, R.layout.zq_widget_large)
    v.setTextViewText(R.id.zq_name, cfg?.name ?: "Zapbar")
    v.setTextViewText(R.id.zq_status, status(cfg, state))
    bindVolumeRow(ctx, v, state, cfg != null)
    if (cfg != null) bindInputs(ctx, v, cfg, state, 4)
    if (cfg == null) openApp(ctx)?.let { v.setOnClickPendingIntent(R.id.zq_root, it) }
    return v
  }

  fun small(ctx: Context, cfg: QuickConfig?, state: QuickState): RemoteViews {
    val v = RemoteViews(ctx.packageName, R.layout.zq_widget_small)
    bindVolumeRow(ctx, v, state, cfg != null)
    // No header on the 4x1: a recent failure turns the number into a warning mark (tap opens the slider, which says why).
    if (state.message != null && System.currentTimeMillis() < state.messageUntil) {
      v.setTextViewText(R.id.zq_volume, "!")
      tintText(ctx, v, R.id.zq_volume, R.color.zq_warn)
    }
    if (cfg == null) openApp(ctx)?.let { v.setOnClickPendingIntent(R.id.zq_root, it) }
    return v
  }
}
