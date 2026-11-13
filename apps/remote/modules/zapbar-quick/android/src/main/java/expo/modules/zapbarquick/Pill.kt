package expo.modules.zapbarquick

/** The tap-to-set volume pill shared by widgets and the notification (spec §5). */
object Pill {
  const val SEGMENTS = 20
  enum class Kind { TRACK, FILL, KNOB }

  fun volumeFor(segment: Int): Int = 5 * (segment.coerceIn(0, SEGMENTS - 1) + 1)
  fun filled(volume: Int): Int = ((volume.coerceIn(0, 100) + 2) / 5)
  fun kind(index: Int, volume: Int): Kind {
    val f = filled(volume)
    return when { index < f - 1 -> Kind.FILL; index == f - 1 -> Kind.KNOB; else -> Kind.TRACK }
  }

  fun drawable(index: Int, volume: Int): Int {
    val pos = when (index) { 0 -> 0; SEGMENTS - 1 -> 2; else -> 1 }
    return when (kind(index, volume)) {
      Kind.TRACK -> arrayOf(R.drawable.zq_seg_track_start, R.drawable.zq_seg_track_mid, R.drawable.zq_seg_track_end)[pos]
      Kind.FILL -> arrayOf(R.drawable.zq_seg_fill_start, R.drawable.zq_seg_fill_mid, R.drawable.zq_seg_fill_end)[pos]
      Kind.KNOB -> arrayOf(R.drawable.zq_seg_knob_start, R.drawable.zq_seg_knob_mid, R.drawable.zq_seg_knob_end)[pos]
    }
  }

  val SEGMENT_IDS = intArrayOf(
    R.id.zq_seg_0, R.id.zq_seg_1, R.id.zq_seg_2, R.id.zq_seg_3, R.id.zq_seg_4, R.id.zq_seg_5, R.id.zq_seg_6, R.id.zq_seg_7, R.id.zq_seg_8, R.id.zq_seg_9,
    R.id.zq_seg_10, R.id.zq_seg_11, R.id.zq_seg_12, R.id.zq_seg_13, R.id.zq_seg_14, R.id.zq_seg_15, R.id.zq_seg_16, R.id.zq_seg_17, R.id.zq_seg_18, R.id.zq_seg_19,
  )
}
