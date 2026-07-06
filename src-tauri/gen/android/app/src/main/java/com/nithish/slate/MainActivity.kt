package com.nithish.slate

import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.util.TypedValue
import android.view.WindowManager
import android.webkit.WebView
import androidx.core.content.FileProvider
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import java.io.File

class MainActivity : TauriActivity() {
  companion object {
    @Volatile private var activeActivity: MainActivity? = null

    @JvmStatic
    fun installApk(apkPath: String) {
      val activity =
        activeActivity
          ?: throw IllegalStateException("Slate is not ready to install an update yet.")
      activity.launchApkInstall(apkPath)
    }
  }
  // Used only when the WebView reports 0 before layout settles — not a floor on real insets.
  private fun fallbackStatusBarInsetPx(): Int =
    TypedValue
      .applyDimension(
        TypedValue.COMPLEX_UNIT_DIP,
        24f,
        resources.displayMetrics,
      )
      .toInt()

  private var webViewRef: WebView? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    configureSystemBars()
  }

  override fun onResume() {
    super.onResume()
    activeActivity = this
    configureSystemBars()
    webViewRef?.let { ViewCompat.requestApplyInsets(it) }
  }

  override fun onPause() {
    activeActivity = null
    super.onPause()
  }

  override fun onWebViewCreate(webView: WebView) {
    webViewRef = webView
    webView.fitsSystemWindows = false
    webView.clipToPadding = false
    applySafeAreaInsets(webView)
    webView.post { ViewCompat.requestApplyInsets(webView) }
    val layoutListener =
      object : android.view.ViewTreeObserver.OnGlobalLayoutListener {
        override fun onGlobalLayout() {
          webView.viewTreeObserver.removeOnGlobalLayoutListener(this)
          ViewCompat.requestApplyInsets(webView)
        }
      }
    webView.viewTreeObserver.addOnGlobalLayoutListener(layoutListener)
  }

  private fun configureSystemBars() {
    // SDK 35+ enforces edge-to-edge; safe areas are applied in the web layer.
    WindowCompat.setDecorFitsSystemWindows(window, false)
    window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS)
    window.clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS)
    window.clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_NAVIGATION)
    window.statusBarColor = Color.parseColor("#FF010101")
    window.navigationBarColor = Color.parseColor("#FF010101")

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      // Keep the status bar our solid surface color — no automatic light scrim.
      window.isStatusBarContrastEnforced = false
      window.isNavigationBarContrastEnforced = false
    }

    val controller = WindowInsetsControllerCompat(window, window.decorView)
    controller.isAppearanceLightStatusBars = false
    controller.isAppearanceLightNavigationBars = false
  }

  private fun applySafeAreaInsets(webView: WebView) {
    ViewCompat.setOnApplyWindowInsetsListener(webView) { _, insets ->
      val statusBars = insets.getInsets(WindowInsetsCompat.Type.statusBars())
      val cutout = insets.getInsets(WindowInsetsCompat.Type.displayCutout())
      val reportedTop = maxOf(statusBars.top, cutout.top)
      val top =
        if (reportedTop > 0) {
          reportedTop
        } else {
          fallbackStatusBarInsetPx()
        }
      val bottom = statusBars.bottom

      webView.setPadding(0, 0, 0, 0)
      injectSafeAreaCss(webView, top, bottom)

      // Pass insets through so Chromium can resolve env(safe-area-inset-*).
      insets
    }
    ViewCompat.requestApplyInsets(webView)
  }

  private fun injectSafeAreaCss(webView: WebView, topPx: Int, bottomPx: Int) {
    val js =
      """
      document.documentElement.style.setProperty('--safe-top', '${topPx}px');
      document.documentElement.style.setProperty('--safe-bottom', '${bottomPx}px');
      """.trimIndent()
    webView.evaluateJavascript(js, null)
  }

  private fun launchApkInstall(apkPath: String) {
    val apkFile = File(apkPath)
    if (!apkFile.exists()) {
      throw IllegalArgumentException("Update file not found.")
    }

    val uri: Uri =
      FileProvider.getUriForFile(this, "${packageName}.fileprovider", apkFile)
    val intent =
      Intent(Intent.ACTION_VIEW).apply {
        setDataAndType(uri, "application/vnd.android.package-archive")
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      }
    startActivity(intent)
  }
}