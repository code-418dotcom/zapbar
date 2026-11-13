package expo.modules.zapbarquick.slider

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.util.AttributeSet
import android.view.MotionEvent
import android.view.View
import androidx.core.content.ContextCompat
import expo.modules.zapbarquick.R

class PillSliderView(ctx: Context, attrs: AttributeSet? = null) : View(ctx, attrs) {
  var value = 0; set(v) { field = v.coerceIn(0, 100); invalidate() }
  var onChange: ((Int) -> Unit)? = null
  var onRelease: ((Int) -> Unit)? = null
  private val d = resources.displayMetrics.density
  private val knob = 48 * d
  private val track = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = ContextCompat.getColor(ctx, R.color.zq_surface_hi) }
  private val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = ContextCompat.getColor(ctx, R.color.zq_accent) }
  private val dot = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = ContextCompat.getColor(ctx, R.color.zq_on_accent) }

  init { contentDescription = "Volume"; isFocusable = true }

  override fun onDraw(c: Canvas) {
    val h = height.toFloat(); val r = h / 2
    c.drawRoundRect(RectF(0f, 0f, width.toFloat(), h), r, r, track)
    val centre = SliderMath.knobCentre(value, width.toFloat(), knob)
    c.drawRoundRect(RectF(0f, 0f, centre + knob / 2, h), r, r, fill)
    c.drawCircle(centre, r, 18 * d, dot)
  }

  override fun onTouchEvent(e: MotionEvent): Boolean {
    val v = SliderMath.valueAt(e.x, width.toFloat(), knob)
    when (e.actionMasked) {
      MotionEvent.ACTION_DOWN, MotionEvent.ACTION_MOVE -> { parent.requestDisallowInterceptTouchEvent(true); value = v; onChange?.invoke(v) }
      MotionEvent.ACTION_UP -> { value = v; onRelease?.invoke(v) }
    }
    return true
  }
}
