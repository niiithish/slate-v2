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

#[derive(Debug, Clone)]
pub(crate) struct UpdateEndpoints {
    pub latest_json_url: String,
    pub apk_download_origin: String,
    pub releases_api_url: String,
}

impl Default for UpdateEndpoints {
    fn default() -> Self {
        Self {
            latest_json_url: LATEST_JSON_URL.into(),
            apk_download_origin: format!("https://github.com/{GITHUB_REPO}"),
            releases_api_url: format!("https://api.github.com/repos/{GITHUB_REPO}/releases/latest"),
        }
    }
}

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

pub(crate) use crate::version::{is_newer_version, normalize_version};

/// APK URLs must be openable in a browser/download manager — not GitHub API asset endpoints.
pub(crate) fn is_usable_apk_url(url: &str) -> bool {
    let trimmed = url.trim();
    if trimmed.is_empty() {
        return false;
    }

    let Ok(parsed) = reqwest::Url::parse(trimmed) else {
        return false;
    };

    let scheme = parsed.scheme();
    if scheme != "http" && scheme != "https" {
        return false;
    }

    if parsed.host_str().is_some_and(|host| host == "api.github.com") {
        return false;
    }

    let path = parsed.path().to_ascii_lowercase();
    path.ends_with(".apk")
}

pub(crate) fn release_tag_for_version(version: &str) -> String {
    if version.starts_with('v') {
        version.to_string()
    } else {
        format!("v{version}")
    }
}

pub(crate) fn build_apk_candidate_urls(version: &str, endpoints: &UpdateEndpoints) -> Vec<String> {
    let tag = release_tag_for_version(version);
    ANDROID_APK_NAMES
        .iter()
        .map(|name| {
            format!(
                "{}/releases/download/{tag}/{name}",
                endpoints.apk_download_origin
            )
        })
        .collect()
}

fn apk_url_from_manifest_platforms(
    platforms: &std::collections::HashMap<String, PlatformEntry>,
) -> Option<String> {
    for key in ANDROID_PLATFORM_KEYS {
        if let Some(url) = platforms.get(key).and_then(|entry| entry.url.clone()) {
            if is_usable_apk_url(&url) {
                return Some(url);
            }
        }
    }
    None
}

fn apk_url_from_release_assets(assets: &[GithubAsset]) -> Option<String> {
    for asset in assets {
        let Some(name) = asset.name.as_deref() else {
            continue;
        };
        if !name.ends_with(".apk") {
            continue;
        }
        if let Some(url) = asset.browser_download_url.as_deref() {
            if is_usable_apk_url(url) {
                return Some(url.to_string());
            }
        }
    }
    None
}

async fn head_ok(client: &reqwest::Client, url: &str) -> Option<String> {
    let response = client.head(url).send().await.ok()?;
    if response.status().is_success() {
        Some(url.to_string())
    } else {
        None
    }
}

fn http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .user_agent("slate-mobile-updater")
        .redirect(reqwest::redirect::Policy::limited(10))
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|error| format!("HTTP client error: {error}"))
}

async fn fetch_latest_manifest(
    client: &reqwest::Client,
    endpoints: &UpdateEndpoints,
) -> Result<LatestManifest, String> {
    let response = client
        .get(&endpoints.latest_json_url)
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
    endpoints: &UpdateEndpoints,
) -> Option<String> {
    if let Some(platforms) = &manifest.platforms {
        if let Some(url) = apk_url_from_manifest_platforms(platforms) {
            return Some(url);
        }
    }

    let apk_urls = build_apk_candidate_urls(version, endpoints);
    let (first, second) = tokio::join!(
        head_ok(client, &apk_urls[0]),
        head_ok(client, &apk_urls[1]),
    );
    if let Some(url) = first.or(second) {
        return Some(url);
    }

    let response = client
        .get(&endpoints.releases_api_url)
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .ok()?;

    if !response.status().is_success() {
        return None;
    }

    let release = response.json::<GithubRelease>().await.ok()?;
    apk_url_from_release_assets(&release.assets.unwrap_or_default())
}

pub(crate) async fn check_mobile_update_with_endpoints(
    current_version: String,
    endpoints: &UpdateEndpoints,
) -> Result<MobileUpdateResponse, String> {
    let client = http_client()?;
    let manifest = fetch_latest_manifest(&client, endpoints).await?;
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
        resolve_android_apk_url(&client, &manifest, &latest_version, endpoints).await;

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

#[tauri::command]
pub async fn check_mobile_update(current_version: String) -> Result<MobileUpdateResponse, String> {
    check_mobile_update_with_endpoints(current_version, &UpdateEndpoints::default()).await
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use super::{
        apk_url_from_manifest_platforms, apk_url_from_release_assets, build_apk_candidate_urls,
        check_mobile_update_with_endpoints, http_client, is_newer_version, is_usable_apk_url,
        normalize_version, release_tag_for_version, resolve_android_apk_url, UpdateEndpoints,
        GithubAsset, LatestManifest, PlatformEntry,
    };
    use wiremock::matchers::{method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    const LIVE_MANIFEST_JSON: &str = r#"{
  "version": "0.1.1",
  "notes": "Install the update from Settings.",
  "platforms": {
    "linux-x86_64": {
      "url": "https://api.github.com/repos/niiithish/slate-v2/releases/assets/464482842"
    }
  }
}"#;

    #[test]
    fn compares_semver_versions() {
        assert!(is_newer_version("0.2.0", "0.1.0"));
        assert!(is_newer_version("v0.2.0", "0.1.0"));
        assert!(is_newer_version("0.2.1", "0.2.0"));
        assert!(!is_newer_version("0.1.0", "0.1.0"));
        assert!(!is_newer_version("0.1.0", "0.2.0"));
        assert!(!is_newer_version("0.1.0", "v0.1.0"));
    }

    #[test]
    fn strips_version_prefix() {
        assert_eq!(normalize_version("v0.1.0"), "0.1.0");
        assert_eq!(normalize_version("0.1.0"), "0.1.0");
    }

    #[test]
    fn builds_release_tag() {
        assert_eq!(release_tag_for_version("0.1.1"), "v0.1.1");
        assert_eq!(release_tag_for_version("v0.1.1"), "v0.1.1");
    }

    #[test]
    fn builds_apk_candidate_urls_for_live_release_shape() {
        let endpoints = UpdateEndpoints::default();
        let urls = build_apk_candidate_urls("0.1.1", &endpoints);
        assert_eq!(urls.len(), 2);
        assert_eq!(
            urls[0],
            "https://github.com/niiithish/slate-v2/releases/download/v0.1.1/slate-android.apk"
        );
        assert_eq!(
            urls[1],
            "https://github.com/niiithish/slate-v2/releases/download/v0.1.1/app-universal-release.apk"
        );
    }

    #[test]
    fn rejects_github_api_asset_urls() {
        assert!(!is_usable_apk_url(
            "https://api.github.com/repos/niiithish/slate-v2/releases/assets/464482842"
        ));
        assert!(is_usable_apk_url(
            "https://github.com/niiithish/slate-v2/releases/download/v0.1.1/slate-android.apk"
        ));
    }

    #[test]
    fn manifest_without_android_keys_falls_back_to_none() {
        let mut platforms = HashMap::new();
        platforms.insert(
            "linux-x86_64".into(),
            PlatformEntry {
                url: Some(
                    "https://api.github.com/repos/niiithish/slate-v2/releases/assets/464482842"
                        .into(),
                ),
            },
        );

        assert_eq!(apk_url_from_manifest_platforms(&platforms), None);
    }

    #[test]
    fn manifest_android_key_rejects_api_asset_url() {
        let mut platforms = HashMap::new();
        platforms.insert(
            "android-aarch64".into(),
            PlatformEntry {
                url: Some(
                    "https://api.github.com/repos/niiithish/slate-v2/releases/assets/999"
                        .into(),
                ),
            },
        );

        assert_eq!(apk_url_from_manifest_platforms(&platforms), None);
    }

    #[test]
    fn manifest_android_key_accepts_direct_download_url() {
        let mut platforms = HashMap::new();
        platforms.insert(
            "android-universal".into(),
            PlatformEntry {
                url: Some(
                    "https://github.com/niiithish/slate-v2/releases/download/v0.2.0/slate-android.apk"
                        .into(),
                ),
            },
        );

        assert_eq!(
            apk_url_from_manifest_platforms(&platforms),
            Some(
                "https://github.com/niiithish/slate-v2/releases/download/v0.2.0/slate-android.apk"
                    .into()
            )
        );
    }

    #[test]
    fn release_assets_prefer_browser_download_url() {
        let assets = vec![GithubAsset {
            name: Some("slate-android.apk".into()),
            browser_download_url: Some(
                "https://github.com/niiithish/slate-v2/releases/download/v0.1.1/slate-android.apk"
                    .into(),
            ),
        }];

        assert_eq!(
            apk_url_from_release_assets(&assets),
            Some(
                "https://github.com/niiithish/slate-v2/releases/download/v0.1.1/slate-android.apk"
                    .into()
            )
        );
    }

    fn live_shape_manifest() -> LatestManifest {
        serde_json::from_str(LIVE_MANIFEST_JSON).expect("fixture manifest")
    }

    async fn mock_update_server() -> (MockServer, UpdateEndpoints) {
        let server = MockServer::start().await;
        let origin = server.uri();

        Mock::given(method("GET"))
            .and(path("/latest.json"))
            .respond_with(
                ResponseTemplate::new(200)
                    .set_body_raw(LIVE_MANIFEST_JSON.replace("0.1.1", "0.2.0"), "application/json"),
            )
            .mount(&server)
            .await;

        Mock::given(method("HEAD"))
            .and(path("/releases/download/v0.2.0/slate-android.apk"))
            .respond_with(ResponseTemplate::new(200))
            .mount(&server)
            .await;

        Mock::given(method("HEAD"))
            .and(path("/releases/download/v0.2.0/app-universal-release.apk"))
            .respond_with(ResponseTemplate::new(404))
            .mount(&server)
            .await;

        let endpoints = UpdateEndpoints {
            latest_json_url: format!("{origin}/latest.json"),
            apk_download_origin: origin.clone(),
            releases_api_url: format!("{origin}/api/releases/latest"),
        };

        (server, endpoints)
    }

    #[tokio::test]
    async fn resolve_android_apk_url_returns_slate_android_apk_via_head_probe() {
        let (_server, endpoints) = mock_update_server().await;
        let client = http_client().expect("client");
        let manifest = live_shape_manifest();

        let resolved =
            resolve_android_apk_url(&client, &manifest, "0.2.0", &endpoints).await;

        let expected = format!(
            "{}/releases/download/v0.2.0/slate-android.apk",
            endpoints.apk_download_origin
        );
        assert_eq!(resolved, Some(expected));
    }

    #[tokio::test]
    async fn check_mobile_update_returns_android_download_url_for_newer_version() {
        let (_server, endpoints) = mock_update_server().await;

        let response = check_mobile_update_with_endpoints("0.1.0".into(), &endpoints)
            .await
            .expect("check should succeed");

        assert_eq!(response.phase, "available");
        assert_eq!(response.available_version.as_deref(), Some("0.2.0"));
        let download_url = response
            .android_download_url
            .expect("apk url should be resolved");
        assert!(download_url.ends_with("/releases/download/v0.2.0/slate-android.apk"));
        assert_eq!(response.message, "Version 0.2.0 is available.");
    }

    #[tokio::test]
    async fn check_mobile_update_returns_current_when_versions_match() {
        let (_server, endpoints) = mock_update_server().await;

        let response = check_mobile_update_with_endpoints("0.2.0".into(), &endpoints)
            .await
            .expect("check should succeed");

        assert_eq!(response.phase, "current");
        assert!(response.android_download_url.is_none());
        assert_eq!(response.message, "You're on the latest version.");
    }

    #[tokio::test]
    async fn resolve_android_apk_url_falls_back_to_releases_api() {
        let server = MockServer::start().await;
        let origin = server.uri();

        Mock::given(method("HEAD"))
            .and(path("/releases/download/v0.3.0/slate-android.apk"))
            .respond_with(ResponseTemplate::new(404))
            .mount(&server)
            .await;
        Mock::given(method("HEAD"))
            .and(path("/releases/download/v0.3.0/app-universal-release.apk"))
            .respond_with(ResponseTemplate::new(404))
            .mount(&server)
            .await;
        Mock::given(method("GET"))
            .and(path("/api/releases/latest"))
            .respond_with(ResponseTemplate::new(200).set_body_raw(
                r#"{"assets":[{"name":"slate-android.apk","browser_download_url":"MOCK_ORIGIN/releases/download/v0.3.0/slate-android.apk"}]}"#
                    .replace("MOCK_ORIGIN", &origin),
                "application/json",
            ))
            .mount(&server)
            .await;

        let endpoints = UpdateEndpoints {
            latest_json_url: format!("{origin}/unused/latest.json"),
            apk_download_origin: origin.clone(),
            releases_api_url: format!("{origin}/api/releases/latest"),
        };

        let client = http_client().expect("client");
        let manifest = LatestManifest {
            version: "0.3.0".into(),
            notes: None,
            platforms: Some(HashMap::from([(
                "linux-x86_64".into(),
                PlatformEntry {
                    url: Some(
                        "https://api.github.com/repos/niiithish/slate-v2/releases/assets/1"
                            .into(),
                    ),
                },
            )])),
        };

        let resolved =
            resolve_android_apk_url(&client, &manifest, "0.3.0", &endpoints).await;

        assert_eq!(
            resolved,
            Some(format!(
                "{origin}/releases/download/v0.3.0/slate-android.apk"
            ))
        );
    }

    #[tokio::test]
    #[ignore = "hits live GitHub; run with --ignored when online"]
    async fn live_github_resolve_returns_slate_android_apk_for_published_release() {
        let endpoints = UpdateEndpoints::default();
        let client = http_client().expect("client");
        let manifest_json = client
            .get(&endpoints.latest_json_url)
            .send()
            .await
            .expect("live latest.json request")
            .text()
            .await
            .expect("live latest.json body");
        let manifest: LatestManifest =
            serde_json::from_str(&manifest_json).expect("live manifest json");
        let version = normalize_version(&manifest.version);

        let resolved = resolve_android_apk_url(&client, &manifest, &version, &endpoints).await;

        let apk_url = resolved.expect("live release should expose slate-android.apk");
        assert!(
            apk_url.contains("slate-android.apk"),
            "expected slate-android.apk in {apk_url}"
        );
        assert!(!apk_url.contains("api.github.com"));
        eprintln!("LIVE_RESOLVED_APK_URL={apk_url}");
    }
}