package expo.modules.zapbarquick.widget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import expo.modules.zapbarquick.QuickReceiver

class LargeWidget : AppWidgetProvider() {
  override fun onUpdate(ctx: Context, mgr: AppWidgetManager, ids: IntArray) {
    WidgetUpdater.updateAll(ctx)
    QuickReceiver.runAsync(ctx, null, expo.modules.zapbarquick.QuickAction.Refresh) // fresh state on placement
  }
}
