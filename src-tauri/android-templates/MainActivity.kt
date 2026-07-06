package com.nithish.slate

import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.view.View
import android.view.WindowManager
import android.webkit.WebView
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat

class MainActivity : TauriActivity() {
  // WebView sometimes reports 0 status-bar inset before layout settles.
  private val minStatusBarInsetPx = 32

  private var webViewRef: WebView? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    configureSystemBars()
  }

  override fun onResume() {
    super.onResume()
    configureSystemBars()
    webViewRef?.let { ViewCompat.requestApplyInsets(it) }
  }

  override fun onWebViewCreate(webView: WebView) {
    webViewRef = webView
    webView.fitsSystemWindows = false
    webView.clipToPadding = true
    applyWebViewInsets(webView)
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
    // SDK 35+ enforces edge-to-edge; insets are applied directly on the WebView.
    WindowCompat.setDecorFitsSystemWindows(window, false)
    window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS)
    window.clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS)
    window.clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_NAVIGATION)
    window.statusBarColor = Color.parseColor("#FF010101")
    window.navigationBarColor = Color.parseColor("#FF010101")

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      window.isStatusBarContrastEnforced = true
      window.isNavigationBarContrastEnforced = true
    }

    val controller = WindowInsetsControllerCompat(window, window.decorView)
    controller.isAppearanceLightStatusBars = false
    controller.isAppearanceLightNavigationBars = false
  }

  private fun applyWebViewInsets(webView: WebView) {
    ViewCompat.setOnApplyWindowInsetsListener(webView) { view, insets ->
      val systemBars =
        insets.getInsets(
          WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
        )
      val top = systemBars.top.coerceAtLeast(minStatusBarInsetPx)
      val bottom = systemBars.bottom

      // Native padding keeps scroll content out of the transparent status bar on Android 15+.
      view.setPadding(0, top, 0, bottom)

      val js =
        """
        document.documentElement.style.setProperty('--safe-top', '0px');
        document.documentElement.style.setProperty('--safe-bottom', '0px');
        """.trimIndent()
      webView.evaluateJavascript(js, null)

      WindowInsetsCompat.CONSUMED
    }
    ViewCompat.requestApplyInsets(webView)
  }
}