//! Shared semver helpers for mobile and desktop update checks.

pub(crate) fn normalize_version(version: &str) -> String {
    version.trim_start_matches('v').to_string()
}

pub(crate) fn is_newer_version(latest: &str, current: &str) -> bool {
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

#[cfg(test)]
mod tests {
    use super::{is_newer_version, normalize_version};

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
}
