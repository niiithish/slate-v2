#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MAIN_ACTIVITY="$ROOT/src-tauri/gen/android/app/src/main/java/com/nithish/slate/MainActivity.kt"

if [[ ! -f "$MAIN_ACTIVITY" ]]; then
  echo "Android project not initialized: $MAIN_ACTIVITY" >&2
  exit 1
fi

cat >"$MAIN_ACTIVITY" <<'EOF'
package com.nithish.slate

import android.graphics.Color
import android.os.Bundle
import android.view.View
import android.view.WindowManager
import android.webkit.WebView
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat

class MainActivity : TauriActivity() {
  private var webViewRef: WebView? = null

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    configureSystemBars()
  }

  override fun onResume() {
    super.onResume()
    configureSystemBars()
    webViewRef?.let { applyWebViewInsets(it) }
  }

  override fun onWebViewCreate(webView: WebView) {
    webViewRef = webView
    webView.fitsSystemWindows = true
    applyWebViewInsets(webView)
    webView.post { applyWebViewInsets(webView) }
    webView.viewTreeObserver.addOnGlobalLayoutListener { applyWebViewInsets(webView) }
  }

  private fun configureSystemBars() {
    WindowCompat.setDecorFitsSystemWindows(window, true)
    window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS)
    window.clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS)
    window.clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_NAVIGATION)
    window.statusBarColor = Color.parseColor("#FF010101")
    window.navigationBarColor = Color.parseColor("#FF010101")

    val controller = WindowInsetsControllerCompat(window, window.decorView)
    controller.isAppearanceLightStatusBars = false
    controller.isAppearanceLightNavigationBars = false
  }

  private fun applyWebViewInsets(webView: WebView) {
    ViewCompat.setOnApplyWindowInsetsListener(webView) { _: View, insets: WindowInsetsCompat ->
      val top = insets.getInsets(WindowInsetsCompat.Type.statusBars()).top.coerceAtLeast(32)
      val bottom = insets.getInsets(WindowInsetsCompat.Type.navigationBars()).bottom.coerceAtLeast(0)
      val js =
        """
        document.documentElement.style.setProperty('--safe-top', '${top}px');
        document.documentElement.style.setProperty('--safe-bottom', '${bottom}px');
        """.trimIndent()
      webView.evaluateJavascript(js, null)
      insets
    }
    ViewCompat.requestApplyInsets(webView)
  }
}
EOF

echo "Patched MainActivity.kt with system bar insets."