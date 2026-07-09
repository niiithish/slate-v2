use std::path::Path;

use minisign_verify::{PublicKey, Signature};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter};
use tauri::utils::platform::{bundle_type, current_exe};

const LATEST_JSON_URL: &str =
    "https://github.com/niiithish/slate-v2/releases/latest/download/latest.json";
pub const BARE_LINUX_PLATFORM_KEY: &str = "linux-x86_64-bare";

#[derive(Debug, Deserialize)]
struct LatestManifest {
    version: String,
    notes: Option<String>,
    platforms: Option<std::collections::HashMap<String, PlatformEntry>>,
}

#[derive(Debug, Deserialize)]
struct PlatformEntry {
    url: Option<String>,
    signature: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopUpdateResponse {
    pub available_version: Option<String>,
    pub current_version: String,
    pub bare_linux_download_url: Option<String>,
    pub bare_linux_signature: Option<String>,
    pub message: String,
    pub notes: Option<String>,
    pub phase: String,
}

pub fn is_bare_linux_install() -> bool {
    cfg!(target_os = "linux") && bundle_type().is_none()
}

#[tauri::command]
pub fn desktop_install_kind() -> String {
    if is_bare_linux_install() {
        "bare-linux".into()
    } else if cfg!(target_os = "linux") {
        "bundled-linux".into()
    } else {
        "bundled".into()
    }
}

#[tauri::command]
pub async fn check_bare_linux_update(
    current_version: String,
) -> Result<DesktopUpdateResponse, String> {
    check_bare_linux_update_with_url(current_version, LATEST_JSON_URL).await
}

pub(crate) async fn check_bare_linux_update_with_url(
    current_version: String,
    latest_json_url: &str,
) -> Result<DesktopUpdateResponse, String> {
    if !is_bare_linux_install() {
        return Err(
            "In-app updates for this install type use the standard desktop updater.".into(),
        );
    }

    let client = reqwest::Client::builder()
        .user_agent("slate-desktop-updater")
        .build()
        .map_err(|err| err.to_string())?;

    let manifest = client
        .get(latest_json_url)
        .send()
        .await
        .map_err(|err| err.to_string())?
        .error_for_status()
        .map_err(|err| err.to_string())?
        .json::<LatestManifest>()
        .await
        .map_err(|err| err.to_string())?;

    let latest_version = normalize_version(&manifest.version);
    let notes = manifest
        .notes
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);

    if !is_newer_version(&latest_version, &current_version) {
        return Ok(DesktopUpdateResponse {
            available_version: None,
            current_version,
            bare_linux_download_url: None,
            bare_linux_signature: None,
            message: "You're on the latest version.".into(),
            notes,
            phase: "current".into(),
        });
    }

    let platform = manifest
        .platforms
        .as_ref()
        .and_then(|platforms| platforms.get(BARE_LINUX_PLATFORM_KEY));

    let (bare_linux_download_url, bare_linux_signature) = match platform {
        Some(entry) => (
            entry.url.clone().filter(|url| !url.trim().is_empty()),
            entry
                .signature
                .clone()
                .filter(|signature| !signature.trim().is_empty()),
        ),
        None => (None, None),
    };

    let message = if bare_linux_download_url.is_some() && bare_linux_signature.is_some() {
        format!("Version {latest_version} is available.")
    } else {
        format!(
            "Version {latest_version} is published, but the bare Linux binary is not attached yet. Reinstall from the repo with `bun run install:reuse`."
        )
    };

    Ok(DesktopUpdateResponse {
        available_version: Some(latest_version),
        current_version,
        bare_linux_download_url,
        bare_linux_signature,
        message,
        notes,
        phase: "available".into(),
    })
}

#[tauri::command]
pub async fn install_bare_linux_update(
    app: AppHandle,
    url: String,
    signature: String,
) -> Result<(), String> {
    if !is_bare_linux_install() {
        return Err("This install type does not use the bare Linux updater.".into());
    }

    let pubkey = updater_pubkey(&app)?;

    let client = reqwest::Client::builder()
        .user_agent("slate-desktop-updater")
        .build()
        .map_err(|err| err.to_string())?;

    let response = client
        .get(url)
        .send()
        .await
        .map_err(|err| err.to_string())?
        .error_for_status()
        .map_err(|err| err.to_string())?;

    let total = response.content_length();
    let mut downloaded: u64 = 0;
    let mut bytes = Vec::new();
    let mut stream = response.bytes_stream();

    use futures_util::StreamExt;
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|err| err.to_string())?;
        downloaded += chunk.len() as u64;
        bytes.extend_from_slice(&chunk);
        let percent = total.filter(|length| *length > 0).map(|length| {
            u8::try_from((downloaded.saturating_mul(100)) / length).unwrap_or(100)
        });
        let _ = app.emit("bare-linux-update-progress", percent);
    }

    verify_signature(&bytes, &signature, &pubkey)?;
    ensure_bare_linux_binary(&bytes)?;

    let target = current_exe().map_err(|err| err.to_string())?;
    install_bare_binary(&bytes, &target)?;

    Ok(())
}

fn updater_pubkey(app: &AppHandle) -> Result<String, String> {
    app.config()
        .plugins
        .0
        .get("updater")
        .and_then(|value| value.get("pubkey"))
        .and_then(|value| value.as_str())
        .map(str::to_string)
        .ok_or_else(|| "Updater public key is not configured.".to_string())
}

fn install_bare_binary(bytes: &[u8], target: &Path) -> Result<(), String> {
    let permissions = std::fs::metadata(target)
        .map_err(|err| err.to_string())?
        .permissions();
    let parent = target
        .parent()
        .ok_or_else(|| "Could not determine install directory.".to_string())?;

    let tmp_dir = tempfile::Builder::new()
        .prefix("slate_update_")
        .tempdir_in(parent)
        .map_err(|err| err.to_string())?;
    let tmp_bin = tmp_dir.path().join("slate.new");

    std::fs::write(&tmp_bin, bytes).map_err(|err| err.to_string())?;
    std::fs::set_permissions(&tmp_bin, permissions).map_err(|err| err.to_string())?;
    std::fs::rename(&tmp_bin, target).map_err(|err| err.to_string())?;

    Ok(())
}

fn ensure_bare_linux_binary(bytes: &[u8]) -> Result<(), String> {
    if bytes.len() < 4 || &bytes[..4] != b"\x7fELF" {
        return Err(
            "Downloaded file is not a Linux executable. Refusing to replace the install.".into(),
        );
    }

    if bytes.windows(17).any(|window| window == b"--appimage-offset") {
        return Err(
            "Downloaded file is an AppImage, not a bare binary. Refusing to replace the install."
                .into(),
        );
    }

    Ok(())
}

fn verify_signature(data: &[u8], release_signature: &str, pub_key: &str) -> Result<(), String> {
    let public_key = PublicKey::decode(pub_key.trim()).map_err(|err| err.to_string())?;
    let signature = Signature::decode(release_signature.trim()).map_err(|err| err.to_string())?;
    public_key
        .verify(data, &signature, true)
        .map_err(|err| err.to_string())?;
    Ok(())
}

pub(crate) use crate::version::{is_newer_version, normalize_version};

#[cfg(test)]
mod tests {
    use super::{
        check_bare_linux_update_with_url, ensure_bare_linux_binary, is_newer_version,
        normalize_version, BARE_LINUX_PLATFORM_KEY,
    };
    use wiremock::matchers::{method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    #[test]
    fn compares_semver_versions() {
        assert!(is_newer_version("0.2.0", "0.1.0"));
        assert!(!is_newer_version("0.1.0", "0.1.0"));
    }

    #[test]
    fn strips_version_prefix() {
        assert_eq!(normalize_version("v0.1.0"), "0.1.0");
    }

    #[test]
    fn rejects_appimage_payload() {
        let mut bytes = b"\x7fELF".to_vec();
        bytes.extend_from_slice(b"--appimage-offset");
        assert!(ensure_bare_linux_binary(&bytes).is_err());
    }

    #[tokio::test]
    async fn reports_missing_bare_linux_asset() {
        let server = MockServer::start().await;
        let manifest = r#"{
  "version": "0.2.0",
  "notes": "Bug fixes",
  "platforms": {
    "linux-x86_64": {
      "url": "https://example.com/appimage",
      "signature": "abc"
    }
  }
}"#
        .to_string();

        Mock::given(method("GET"))
            .and(path("/latest.json"))
            .respond_with(ResponseTemplate::new(200).set_body_string(manifest))
            .mount(&server)
            .await;

        let result = check_bare_linux_update_with_url(
            "0.1.0".into(),
            &format!("{}/latest.json", server.uri()),
        )
        .await
        .expect("check should succeed");

        assert_eq!(result.phase, "available");
        assert_eq!(result.available_version.as_deref(), Some("0.2.0"));
        assert!(result.bare_linux_download_url.is_none());
        assert!(result.message.contains("bare Linux binary"));
    }

    #[tokio::test]
    async fn returns_bare_linux_asset_when_present() {
        let server = MockServer::start().await;
        let manifest = format!(
            r#"{{
  "version": "0.2.0",
  "platforms": {{
    "{BARE_LINUX_PLATFORM_KEY}": {{
      "url": "https://example.com/slate-linux-x86_64",
      "signature": "dGVzdA=="
    }}
  }}
}}"#
        );

        Mock::given(method("GET"))
            .and(path("/latest.json"))
            .respond_with(ResponseTemplate::new(200).set_body_string(manifest))
            .mount(&server)
            .await;

        let result = check_bare_linux_update_with_url(
            "0.1.0".into(),
            &format!("{}/latest.json", server.uri()),
        )
        .await
        .expect("check should succeed");

        assert_eq!(
            result.bare_linux_download_url.as_deref(),
            Some("https://example.com/slate-linux-x86_64")
        );
        assert_eq!(result.bare_linux_signature.as_deref(), Some("dGVzdA=="));
    }
}