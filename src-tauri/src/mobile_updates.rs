use serde::{Deserialize, Serialize};

const LATEST_JSON_URL: &str =
    "https://github.com/niiithish/slate-v2/releases/latest/download/latest.json";
const GITHUB_REPO: &str = "niiithish/slate-v2";
const ANDROID_APK_NAMES: [&str; 2] = ["slate-android.apk", "app-universal-release.apk"];
const ANDROID_PLATFORM_KEYS: [&str; 3] = [
    "android-aarch64",
    "android-armv7",
    "android-universal",
];

#[derive(Debug, Deserialize)]
struct LatestManifest {
    version: String,
    notes: Option<String>,
    platforms: Option<std::collections::HashMap<String, PlatformEntry>>,
}

#[derive(Debug, Deserialize)]
struct PlatformEntry {
    url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GithubRelease {
    assets: Option<Vec<GithubAsset>>,
}

#[derive(Debug, Deserialize)]
struct GithubAsset {
    name: Option<String>,
    browser_download_url: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MobileUpdateResponse {
    pub available_version: Option<String>,
    pub current_version: String,
    pub android_download_url: Option<String>,
    pub message: String,
    pub notes: Option<String>,
    pub phase: String,
}

fn normalize_version(version: &str) -> String {
    version.trim_start_matches('v').to_string()
}

fn is_newer_version(latest: &str, current: &str) -> bool {
    let latest_parts = normalize_version(latest)
        .split('.')
        .map(|part| part.parse::<u32>().unwrap_or(0))
        .collect::<Vec<_>>();
    let current_parts = normalize_version(current)
        .split('.')
        .map(|part| part.parse::<u32>().unwrap_or(0))
        .collect::<Vec<_>>();
    let length = latest_parts.len().max(current_parts.len());

    for index in 0..length {
        let next = latest_parts.get(index).copied().unwrap_or(0);
        let prev = current_parts.get(index).copied().unwrap_or(0);
        if next != prev {
            return next > prev;
        }
    }

    false
}

fn http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent("slate-mobile-updater")
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|error| format!("HTTP client error: {error}"))
}

async fn fetch_latest_manifest(client: &reqwest::Client) -> Result<LatestManifest, String> {
    let response = client
        .get(LATEST_JSON_URL)
        .send()
        .await
        .map_err(|error| format!("GitHub request failed: {error}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "Release check failed ({})",
            response.status().as_u16()
        ));
    }

    response
        .json::<LatestManifest>()
        .await
        .map_err(|error| format!("Invalid release manifest: {error}"))
}

async fn resolve_android_apk_url(
    client: &reqwest::Client,
    manifest: &LatestManifest,
    version: &str,
) -> Option<String> {
    if let Some(platforms) = &manifest.platforms {
        for key in ANDROID_PLATFORM_KEYS {
            if let Some(url) = platforms.get(key).and_then(|entry| entry.url.clone()) {
                return Some(url);
            }
        }
    }

    let tag = if version.starts_with('v') {
        version.to_string()
    } else {
        format!("v{version}")
    };

    for name in ANDROID_APK_NAMES {
        let url = format!("https://github.com/{GITHUB_REPO}/releases/download/{tag}/{name}");
        if let Ok(response) = client.head(&url).send().await {
            if response.status().is_success() {
                return Some(url);
            }
        }
    }

    let response = client
        .get(format!("https://api.github.com/repos/{GITHUB_REPO}/releases/latest"))
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .ok()?;

    if !response.status().is_success() {
        return None;
    }

    let release = response.json::<GithubRelease>().await.ok()?;
    for asset in release.assets.unwrap_or_default() {
        if asset.name.as_deref()?.ends_with(".apk") {
            return asset.browser_download_url;
        }
    }

    None
}

#[tauri::command]
pub async fn check_mobile_update(current_version: String) -> Result<MobileUpdateResponse, String> {
    let client = http_client()?;
    let manifest = fetch_latest_manifest(&client).await?;
    let latest_version = normalize_version(&manifest.version);
    let notes = manifest
        .notes
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);

    if !is_newer_version(&latest_version, &current_version) {
        return Ok(MobileUpdateResponse {
            available_version: None,
            current_version,
            android_download_url: None,
            message: "You're on the latest version.".into(),
            notes,
            phase: "current".into(),
        });
    }

    let android_download_url =
        resolve_android_apk_url(&client, &manifest, &latest_version).await;

    let message = if android_download_url.is_some() {
        format!("Version {latest_version} is available.")
    } else {
        format!(
            "Version {latest_version} is available, but no APK is attached to the release yet."
        )
    };

    Ok(MobileUpdateResponse {
        available_version: Some(latest_version),
        current_version,
        android_download_url,
        message,
        notes,
        phase: "available".into(),
    })
}

#[cfg(test)]
mod tests {
    use super::{is_newer_version, normalize_version};

    #[test]
    fn compares_semver_versions() {
        assert!(is_newer_version("0.2.0", "0.1.0"));
        assert!(!is_newer_version("0.1.0", "0.1.0"));
        assert!(!is_newer_version("0.1.0", "0.2.0"));
    }

    #[test]
    fn strips_version_prefix() {
        assert_eq!(normalize_version("v0.1.0"), "0.1.0");
    }
}