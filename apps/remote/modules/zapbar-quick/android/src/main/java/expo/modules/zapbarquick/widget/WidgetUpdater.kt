package expo.modules.zapbarquick.widget

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import expo.modules.zapbarquick.QuickStore

object WidgetUpdater {
  fun updateAll(ctx: Context) {
    val mgr = AppWidgetManager.getInstance(ctx)
    val store = QuickStore(ctx)
    val cfg = store.config()
    val state = store.state()
    mgr.getAppWidgetIds(ComponentName(ctx, LargeWidget::class.java)).forEach { mgr.updateAppWidget(it, WidgetRenderer.large(ctx, cfg, state)) }
    mgr.getAppWidgetIds(ComponentName(ctx, SmallWidget::class.java)).forEach { mgr.updateAppWidget(it, WidgetRenderer.small(ctx, cfg, state)) }
  }
}
