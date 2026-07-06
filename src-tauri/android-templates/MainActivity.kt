package com.nithish.slate

import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Color
import androidx.core.graphics.Insets
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.core.content.FileProvider
import androidx.core.util.TypedValueCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import java.io.File

/**
 * Android 15/16 edge-to-edge WebView handling per:
 * https://medium.com/androiddevelopers/make-webviews-edge-to-edge-a6ef319adfac
 *
 * env(safe-area-inset-*) returns 0 in Android WebView — inject insets into CSS variables
 * and pad the page from the frontend. Native WebView padding does not shift CSS layout.
 */
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

  private val surfaceColor = Color.parseColor("#FF010101")
  private var webViewRef: WebView? = null
  private var lastSafeInsets: Insets? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    configureSystemBars()
  }

  override fun onResume() {
    super.onResume()
    activeActivity = this
    configureSystemBars()
    requestSafeAreaUpdate()
  }

  override fun onPause() {
    activeActivity = null
    super.onPause()
  }

  override fun onWindowFocusChanged(hasFocus: Boolean) {
    super.onWindowFocusChanged(hasFocus)
    if (hasFocus) {
      requestSafeAreaUpdate()
    }
  }

  override fun onWebViewCreate(webView: WebView) {
    webViewRef = webView
    webView.fitsSystemWindows = false
    webView.setBackgroundColor(surfaceColor)
    applySafeAreaInsets(webView)

    // Wry assigns RustWebViewClient after onWebViewCreate — wrap it on the next frame.
    webView.post { attachPageFinishedInsetHook(webView) }
    webView.post { requestSafeAreaUpdate() }
  }

  private fun attachPageFinishedInsetHook(webView: WebView) {
    val delegate = webView.webViewClient ?: return
    if (delegate is InsetWebViewClientWrapper) {
      return
    }

    webView.webViewClient =
      InsetWebViewClientWrapper(delegate) {
        requestSafeAreaUpdate()
      }
  }

  private fun applySafeAreaInsets(webView: WebView) {
    val decorView = window.decorView
    ViewCompat.setOnApplyWindowInsetsListener(decorView) { _, insets ->
      val safeDrawing =
        insets.getInsets(
          WindowInsetsCompat.Type.systemBars() or
            WindowInsetsCompat.Type.displayCutout() or
            WindowInsetsCompat.Type.ime()
        )

      lastSafeInsets = safeDrawing
      injectSafeAreaCss(webView, safeDrawing)
      insets
    }
    ViewCompat.requestApplyInsets(decorView)
  }

  private fun requestSafeAreaUpdate() {
    val webView = webViewRef ?: return
    ViewCompat.requestApplyInsets(window.decorView)
    lastSafeInsets?.let { injectSafeAreaCss(webView, it) }
  }

  private fun injectSafeAreaCss(
    webView: WebView,
    insets: Insets,
  ) {
    val metrics = webView.resources.displayMetrics
    val topDp = TypedValueCompat.pxToDp(insets.top.toFloat(), metrics)
    val rightDp = TypedValueCompat.pxToDp(insets.right.toFloat(), metrics)
    val bottomDp = TypedValueCompat.pxToDp(insets.bottom.toFloat(), metrics)
    val leftDp = TypedValueCompat.pxToDp(insets.left.toFloat(), metrics)
    val js =
      """
      document.documentElement.style.setProperty('--safe-top', '${topDp}px');
      document.documentElement.style.setProperty('--safe-right', '${rightDp}px');
      document.documentElement.style.setProperty('--safe-bottom', '${bottomDp}px');
      document.documentElement.style.setProperty('--safe-left', '${leftDp}px');
      """.trimIndent()
    webView.evaluateJavascript(js, null)
  }

  private fun configureSystemBars() {
    WindowCompat.setDecorFitsSystemWindows(window, false)
    window.decorView.setBackgroundColor(surfaceColor)
    window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS)
    window.clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS)
    window.clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_NAVIGATION)
    window.statusBarColor = surfaceColor
    window.navigationBarColor = surfaceColor

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      window.isStatusBarContrastEnforced = false
      window.isNavigationBarContrastEnforced = false
    }

    val controller = WindowInsetsControllerCompat(window, window.decorView)
    controller.isAppearanceLightStatusBars = false
    controller.isAppearanceLightNavigationBars = false
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

  private class InsetWebViewClientWrapper(
    private val delegate: WebViewClient,
    private val onPageFinished: () -> Unit,
  ) : WebViewClient() {
    override fun shouldInterceptRequest(
      view: WebView,
      request: WebResourceRequest,
    ): WebResourceResponse? = delegate.shouldInterceptRequest(view, request)

    override fun shouldOverrideUrlLoading(
      view: WebView,
      request: WebResourceRequest,
    ): Boolean = delegate.shouldOverrideUrlLoading(view, request)

    override fun onPageStarted(
      view: WebView,
      url: String,
      favicon: Bitmap?,
    ) {
      delegate.onPageStarted(view, url, favicon)
    }

    override fun onPageFinished(
      view: WebView,
      url: String,
    ) {
      delegate.onPageFinished(view, url)
      onPageFinished()
    }

    override fun onReceivedError(
      view: WebView,
      request: WebResourceRequest,
      error: WebResourceError,
    ) {
      delegate.onReceivedError(view, request, error)
    }
  }
}