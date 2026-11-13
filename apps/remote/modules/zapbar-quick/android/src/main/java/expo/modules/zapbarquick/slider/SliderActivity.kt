package expo.modules.zapbarquick.slider

import android.app.Activity
import android.os.Bundle
import android.view.Gravity
import android.view.WindowManager
import android.widget.ImageView
import android.widget.TextView
import androidx.core.content.ContextCompat
import expo.modules.zapbarquick.QuickAction
import expo.modules.zapbarquick.QuickActions
import expo.modules.zapbarquick.QuickHooks
import expo.modules.zapbarquick.QuickStore
import expo.modules.zapbarquick.R
import java.util.concurrent.Executors

/** Native floating volume slider over whatever is on screen; works with the app closed. */
class SliderActivity : Activity() {
  private val worker = Executors.newSingleThreadExecutor()

  override fun onCreate(saved: Bundle?) {
    super.onCreate(saved)
    setContentView(R.layout.zq_slider)
    window.setLayout(WindowManager.LayoutParams.MATCH_PARENT, WindowManager.LayoutParams.WRAP_CONTENT)
    window.setGravity(Gravity.BOTTOM)
    // Edge-to-edge (targetSdk 36): keep the panel above the gesture/navigation bar.
    val root = findViewById<android.view.View>(android.R.id.content)
    root.setOnApplyWindowInsetsListener { v, insets ->
      val nav = if (android.os.Build.VERSION.SDK_INT >= 30) insets.getInsets(android.view.WindowInsets.Type.navigationBars()).bottom else @Suppress("DEPRECATION") insets.systemWindowInsetBottom
      v.setPadding(0, 0, 0, nav)
      insets
    }
    val store = QuickStore(this)
    val cfg = store.config() ?: run { finish(); return }
    val pill = findViewById<PillSliderView>(R.id.zq_slider_pill)
    val value = findViewById<TextView>(R.id.zq_slider_value)
    val mute = findViewById<ImageView>(R.id.zq_slider_mute)
    findViewById<TextView>(R.id.zq_slider_name).text = cfg.name
    val link = SliderLink(cfg, System::currentTimeMillis, { QuickStore(this).state().volume }, QuickActions::realConnect)
    this.link = link
    val name = findViewById<TextView>(R.id.zq_slider_name)
    fun problem(text: String?) = runOnUiThread {
      name.text = text ?: cfg.name
      name.setTextColor(ContextCompat.getColor(this, if (text != null) R.color.zq_warn else R.color.zq_text))
    }
    fun show(v: Int, muted: Boolean) {
      pill.value = v; value.text = v.toString()
      mute.setImageResource(if (muted) R.drawable.zq_ic_volume_off else R.drawable.zq_ic_volume_high)
      mute.setColorFilter(ContextCompat.getColor(this, if (muted) R.color.zq_warn else R.color.zq_text))
    }
    store.state().let { show(it.volume, it.mute) }
    // While dragging only set_volume goes out over the one open connection; state is read back once on release.
    val send = { v: Int -> worker.execute { problem(link.send(v)) } }
    fun readBack() = worker.execute {
      val s = link.read { b, pid -> QuickStore(this).state().copy(volume = b.volume(pid), mute = b.mute(pid), message = null) }
      if (s != null) { store.saveState(s); runOnUiThread { show(s.volume, s.mute) }; QuickHooks.refresh(applicationContext) }
    }
    val coalescer = Coalescer(150, System::currentTimeMillis, send)
    pill.onChange = { v -> value.text = v.toString(); coalescer.push(v) }
    pill.onRelease = { v -> coalescer.push(v); coalescer.flush(); readBack() }
    mute.setOnClickListener {
      worker.execute {
        val ok = link.read { b, pid -> b.setMute(pid, !b.mute(pid)) }
        problem(if (ok == null) SliderLink.RECONNECT else null)
      }
      readBack()
    }
    readBack()
    worker.execute { if (link.read { _, _ -> true } == null) problem(SliderLink.RECONNECT) }
  }

  private var link: SliderLink? = null

  override fun onDestroy() { worker.execute { link?.close() }; worker.shutdown(); super.onDestroy() }
}
