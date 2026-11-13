package expo.modules.zapbarquick.live

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.widget.RemoteViews
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import expo.modules.zapbarquick.QuickConfig
import expo.modules.zapbarquick.QuickState
import expo.modules.zapbarquick.R
import expo.modules.zapbarquick.widget.WidgetRenderer

object NotificationRenderer {
  const val CHANNEL = "zapbar_live"
  const val ID = 4242

  fun ensureChannel(ctx: Context) {
    ctx.getSystemService(NotificationManager::class.java).createNotificationChannel(
      NotificationChannel(CHANNEL, "Live controls", NotificationManager.IMPORTANCE_LOW).apply { setShowBadge(false); setSound(null, null) })
  }

  fun line(cfg: QuickConfig, s: QuickState, soundMode: String?): String {
    val what = cfg.inputs.firstOrNull { it.mid == s.activeMid }?.label ?: "Streaming"
    return listOfNotNull(what, "Volume ${s.volume}", soundMode).joinToString(" · ")
  }

  /** Mute, −, number (opens the floating slider), +, current input. No pill: a notification can't take a drag. */
  private fun bindButtons(ctx: Context, v: RemoteViews, cfg: QuickConfig, s: QuickState) {
    v.setImageViewResource(R.id.zq_mute, if (s.mute) R.drawable.zq_ic_volume_off else R.drawable.zq_ic_volume_high)
    v.setTextViewText(R.id.zq_volume, s.volume.toString())
    v.setTextViewText(R.id.zq_status, cfg.inputs.firstOrNull { it.mid == s.activeMid }?.label ?: "Streaming")
    v.setOnClickPendingIntent(R.id.zq_mute, WidgetRenderer.broadcast(ctx, 99, "mute"))
    v.setOnClickPendingIntent(R.id.zq_minus, WidgetRenderer.broadcast(ctx, 300, "step", -STEP))
    v.setOnClickPendingIntent(R.id.zq_plus, WidgetRenderer.broadcast(ctx, 301, "step", STEP))
    v.setOnClickPendingIntent(R.id.zq_volume, WidgetRenderer.openSlider(ctx))
  }

  /** Notification − / + step, matching the widget pill's 5-point segments. */
  const val STEP = 5

  /** full = false: the minimal notification Android requires when only volume keys are on (ruling). */
  fun build(ctx: Context, cfg: QuickConfig, s: QuickState, full: Boolean, soundMode: String? = null): Notification {
    ensureChannel(ctx)
    val b = NotificationCompat.Builder(ctx, CHANNEL).setSmallIcon(R.drawable.zq_ic_z).setOngoing(true).setSilent(true)
      .setContentTitle("Zapbar · ${cfg.name}").setColor(ContextCompat.getColor(ctx, R.color.zq_accent))
      .setContentIntent(WidgetRenderer.openApp(ctx)).setCategory(NotificationCompat.CATEGORY_SERVICE)
    if (!full) return b.setContentText("Volume keys control the soundbar").build()
    val small = RemoteViews(ctx.packageName, R.layout.zq_notif_small)
    bindButtons(ctx, small, cfg, s)
    val big = RemoteViews(ctx.packageName, R.layout.zq_notif_big)
    bindButtons(ctx, big, cfg, s)
    WidgetRenderer.bindInputs(ctx, big, cfg, s, 3)
    return b.setStyle(NotificationCompat.DecoratedCustomViewStyle()).setCustomContentView(small).setCustomBigContentView(big).build()
  }
}
