package expo.modules.zapbarquick

import android.content.Intent
import android.os.Build
import android.provider.Settings
import android.view.HapticFeedbackConstants
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ZapbarQuickModule : Module() {
  private val ctx get() = appContext.reactContext!!.applicationContext

  override fun definition() = ModuleDefinition {
    Name("ZapbarQuick")
    Function("setConfig") { json: String ->
      QuickStore(ctx).saveConfig(json)
      QuickHooks.onConfigChanged(ctx)
    }
    // iOS widgets need the app to push live state; Android's native services read the bar themselves.
    Function("setState") { _: String -> }
    Function("setLiveWanted") { foreground: Boolean ->
      QuickHooks.onAppForeground(ctx, foreground)
    }
    Function("refreshWidgets") { QuickHooks.refresh(ctx) }
    Function("openBatterySettings") {
      ctx.startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
    // View haptics instead of Vibrator: no VIBRATE permission, and the system haptics setting applies.
    AsyncFunction("tick") {
      val effect = if (Build.VERSION.SDK_INT >= 30) HapticFeedbackConstants.CONFIRM else HapticFeedbackConstants.VIRTUAL_KEY
      appContext.currentActivity?.window?.decorView?.performHapticFeedback(effect)
      Unit
    }.runOnQueue(Queues.MAIN)
  }
}

/** Single place native features hook into: widgets refresh, the live service starts/re-evaluates. */
object QuickHooks {
  @Volatile var appForeground = false
  fun onConfigChanged(ctx: android.content.Context) {
    refresh(ctx)
    if (appForeground) expo.modules.zapbarquick.live.LiveControlsService.start(ctx) else expo.modules.zapbarquick.live.LiveControlsService.reevaluate(ctx)
  }
  fun onAppForeground(ctx: android.content.Context, fg: Boolean) {
    appForeground = fg
    if (fg) expo.modules.zapbarquick.live.LiveControlsService.start(ctx) else expo.modules.zapbarquick.live.LiveControlsService.reevaluate(ctx)
  }
  fun refresh(ctx: android.content.Context) { expo.modules.zapbarquick.widget.WidgetUpdater.updateAll(ctx) }
}
