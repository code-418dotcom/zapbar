package expo.modules.zapbarquick.live

import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.support.v4.media.session.MediaSessionCompat
import android.support.v4.media.session.PlaybackStateCompat
import androidx.core.content.ContextCompat
import androidx.media.VolumeProviderCompat
import expo.modules.zapbarquick.QuickHooks
import expo.modules.zapbarquick.QuickStore
import expo.modules.zapbarquick.capVolume
import expo.modules.zapbarquick.heos.HeosLite
import expo.modules.zapbarquick.heos.HeosQuick
import java.util.concurrent.Executors

/** Spec §4: holds one CLI connection with events, the remote-volume media session and the notification. */
class LiveControlsService : Service() {
  private val main = Handler(Looper.getMainLooper())
  private val worker = Executors.newSingleThreadExecutor()
  private lateinit var store: QuickStore
  private var lite: HeosLite? = null
  private var quick: HeosQuick? = null
  private var pid = 0
  private var session: MediaSessionCompat? = null
  private var provider: VolumeProviderCompat? = null
  private var idleSince: Long? = null
  private var onLan = true
  private var netCallback: ConnectivityManager.NetworkCallback? = null
  @Volatile private var destroyed = false
  @Volatile private var connecting = false
  private var reconnects = 0
  private val tick = object : Runnable { override fun run() { evaluate(); main.postDelayed(this, 30_000) } }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    store = QuickStore(this)
    running = this
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val cfg = store.config() ?: run { stopSelf(); return START_NOT_STICKY }
    val n = NotificationRenderer.build(this, cfg, store.state(), full = cfg.notification && notificationsAllowed())
    if (Build.VERSION.SDK_INT >= 29) startForeground(NotificationRenderer.ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE) else startForeground(NotificationRenderer.ID, n)
    if (lite == null && !connecting) connect()
    syncSession()
    watchNetwork()
    main.removeCallbacks(tick); main.post(tick)
    return START_NOT_STICKY
  }

  private fun notificationsAllowed() = getSystemService(NotificationManager::class.java).areNotificationsEnabled()

  private fun connect() {
    val cfg = store.config() ?: return
    connecting = true
    worker.execute {
      var l: HeosLite? = null
      try {
        l = HeosLite(cfg.lastIp).also { it.connect() }
        val q = HeosQuick(l)
        pid = q.pidFor(cfg.serial)
        l.onEvent = { event, msg -> if (!destroyed) worker.execute { onEvent(event, msg) } }
        q.registerEvents()
        val s = store.state().copy(volume = q.volume(pid), mute = q.mute(pid), activeMid = q.nowPlayingMid(pid), playState = q.playState(pid), message = null)
        store.saveState(s)
        if (destroyed) { l.close(); return@execute }
        lite = l; quick = q
        reconnects = 0
        // A dropped connection (bar restart, rename, timeout) must not leave keys that silently do nothing.
        l.onClose = { if (!destroyed) main.post { onConnectionLost(l) } }
        main.post { if (!destroyed) { syncSession(); publish() } }
      } catch (e: Exception) {
        l?.close()
        main.post { if (!destroyed) stopSelf() }
      } finally {
        connecting = false
      }
    }
  }

  /** Reconnect once after a short pause; if the bar is still gone, stop instead of pretending to be live. */
  private fun onConnectionLost(dead: HeosLite) {
    if (lite !== dead) return
    lite = null; quick = null
    syncSession()
    if (reconnects++ >= 1) { stopSelf(); return }
    main.postDelayed({ if (!destroyed && lite == null && !connecting) connect() }, 2_000)
  }

  /** Create or release the remote-volume session to match the current setting and connection. */
  private fun syncSession() {
    val cfg = store.config() ?: return
    when (LiveRules.sessionAction(session != null, cfg.volumeKeys, quick != null)) {
      LiveRules.Session.CREATE -> setupSession()
      LiveRules.Session.RELEASE -> { session?.release(); session = null; provider = null }
      LiveRules.Session.KEEP -> Unit
    }
  }

  private fun onEvent(event: String, msg: Map<String, String>) {
    val q = quick ?: return
    var s = store.state()
    when (event) {
      "player_volume_changed" -> s = s.copy(volume = msg["level"]?.toIntOrNull() ?: s.volume, mute = msg["mute"] == "on")
      "player_state_changed" -> s = s.copy(playState = msg["state"] ?: s.playState)
      "player_now_playing_changed" -> s = s.copy(activeMid = runCatching { q.nowPlayingMid(pid) }.getOrNull())
      else -> return
    }
    store.saveState(s)
    main.post { publish() }
  }

  /** [keys] Skip when Task 1 ruled BLOCKED. */
  private fun setupSession() {
    val cfg = store.config() ?: return
    if (destroyed || !cfg.volumeKeys || session != null) return
    val p = object : VolumeProviderCompat(VOLUME_CONTROL_ABSOLUTE, 50, store.state().volume / 2) {
      override fun onSetVolumeTo(volume: Int) = setVolume((volume * 2).coerceIn(0, 100))
      override fun onAdjustVolume(direction: Int) = setVolume(LiveRules.stepVolume(store.state().volume, direction))
    }
    provider = p
    session = MediaSessionCompat(this, "Zapbar").apply {
      setPlaybackToRemote(p)
      setPlaybackState(PlaybackStateCompat.Builder().setState(PlaybackStateCompat.STATE_PLAYING, 0, 1f).build())
      isActive = true
    }
  }

  private fun setVolume(requested: Int) {
    val v = store.config().capVolume(requested, store.state().volume)
    store.saveState(store.state().copy(volume = v))
    provider?.currentVolume = v / 2
    publish()
    worker.execute { runCatching { quick?.setVolume(pid, v) } }
  }

  private fun publish() {
    if (destroyed) return
    val cfg = store.config() ?: return
    val s = store.state()
    provider?.currentVolume = s.volume / 2
    idleSince = if (s.playState == "play") null else (idleSince ?: System.currentTimeMillis())
    getSystemService(NotificationManager::class.java).notify(NotificationRenderer.ID, NotificationRenderer.build(this, cfg, s, full = cfg.notification && notificationsAllowed()))
    QuickHooks.refresh(this)
    evaluate()
  }

  fun evaluate() {
    val cfg = store.config() ?: return stopSelf()
    val inputs = LiveInputs(QuickHooks.appForeground, store.state().playState == "play", onLan, cfg.volumeKeys, cfg.notification, idleSince)
    if (!LiveRules.shouldRun(inputs, System.currentTimeMillis())) stopSelf()
  }

  private fun watchNetwork() {
    if (netCallback != null) return
    val cm = getSystemService(ConnectivityManager::class.java)
    val cb = object : ConnectivityManager.NetworkCallback() {
      override fun onCapabilitiesChanged(n: Network, caps: NetworkCapabilities) {
        onLan = caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) || caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)
        main.post { evaluate() }
      }
      override fun onLost(n: Network) { onLan = false; main.post { evaluate() } }
    }
    cm.registerDefaultNetworkCallback(cb)
    netCallback = cb
  }

  override fun onTaskRemoved(rootIntent: Intent?) {
    QuickHooks.appForeground = false
    evaluate()
  }

  override fun onDestroy() {
    destroyed = true
    main.removeCallbacks(tick)
    netCallback?.let { getSystemService(ConnectivityManager::class.java).unregisterNetworkCallback(it) }
    session?.release()
    session = null
    lite?.close()
    worker.shutdownNow()
    if (running === this) running = null
    super.onDestroy()
  }

  companion object {
    @Volatile private var running: LiveControlsService? = null

    fun start(ctx: Context) {
      val cfg = QuickStore(ctx).config() ?: return
      if (!cfg.volumeKeys && !cfg.notification) return
      ContextCompat.startForegroundService(ctx, Intent(ctx, LiveControlsService::class.java))
    }

    fun reevaluate(ctx: Context) {
      running?.let { s -> Handler(Looper.getMainLooper()).post { s.evaluate() } }
    }
  }
}
