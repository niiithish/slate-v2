use std::path::PathBuf;

use futures_util::StreamExt;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AndroidUpdateProgress {
    downloaded: u64,
    total: Option<u64>,
    percent: Option<u32>,
}

#[cfg(target_os = "android")]
fn launch_apk_install(apk_path: &str) -> Result<(), String> {
    use jni::objects::JValue;
    use jni::JNIEnv;
    use ndk_context::android_context;

    let ctx = android_context();
    let vm = unsafe { jni::JavaVM::from_raw(ctx.vm().cast()) }
        .map_err(|error| format!("JVM error: {error}"))?;
    let mut env = vm
        .attach_current_thread()
        .map_err(|error| format!("JNI attach error: {error}"))?;

    call_install_apk(&mut env, apk_path)
}

#[cfg(target_os = "android")]
fn call_install_apk(env: &mut JNIEnv<'_>, apk_path: &str) -> Result<(), String> {
    use jni::objects::JValue;

    let class = env
        .find_class("com/nithish/slate/MainActivity")
        .map_err(|error| format!("MainActivity class not found: {error}"))?;
    let path = env
        .new_string(apk_path)
        .map_err(|error| format!("JNI string error: {error}"))?;

    env.call_static_method(class, "installApk", "(Ljava/lang/String;)V", &[JValue::Object(&path)])
        .map_err(|error| format!("Install intent failed: {error}"))?;

    Ok(())
}

#[cfg(not(target_os = "android"))]
fn launch_apk_install(_apk_path: &str) -> Result<(), String> {
    Err("Android only".into())
}

async fn download_apk(
    app: &AppHandle,
    url: &str,
    destination: &PathBuf,
) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .user_agent("slate-android-updater")
        .redirect(reqwest::redirect::Policy::limited(10))
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|error| format!("HTTP client error: {error}"))?;

    let response = client
        .get(url)
        .send()
        .await
        .map_err(|error| format!("Download failed: {error}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "Download failed ({})",
            response.status().as_u16()
        ));
    }

    let total = response.content_length();
    let mut stream = response.bytes_stream();
    let mut downloaded = 0u64;
    let mut file = tokio::fs::File::create(destination)
        .await
        .map_err(|error| format!("Can't write update file: {error}"))?;

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|error| format!("Download interrupted: {error}"))?;
        downloaded += chunk.len() as u64;
        tokio::io::AsyncWriteExt::write_all(&mut file, &chunk)
            .await
            .map_err(|error| format!("Can't save update file: {error}"))?;

        let percent = total.filter(|value| *value > 0).map(|value| {
            u32::try_from((downloaded.saturating_mul(100)) / value).unwrap_or(100)
        });
        let _ = app.emit(
            "android-update-progress",
            AndroidUpdateProgress {
                downloaded,
                total,
                percent,
            },
        );
    }

    Ok(())
}

#[tauri::command]
pub async fn install_android_update(app: AppHandle, url: String) -> Result<(), String> {
    let trimmed = url.trim();
    if trimmed.is_empty() {
        return Err("Missing APK download URL.".into());
    }

    let cache_dir = app
        .path()
        .cache_dir()
        .map_err(|error| error.to_string())?;
    let apk_path = cache_dir.join("slate-update.apk");

    if apk_path.exists() {
        let _ = tokio::fs::remove_file(&apk_path).await;
    }

    download_apk(&app, trimmed, &apk_path).await?;
    launch_apk_install(apk_path.to_string_lossy().as_ref())
}