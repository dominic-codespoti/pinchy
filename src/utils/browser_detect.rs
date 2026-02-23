//! Detects system Chromium/Chrome browser for Playwright automation.
use std::path::Path;

/// List of common browser executable paths (in order of preference)
const COMMON_BROWSER_PATHS: &[&str] = &[
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "/usr/bin/google-chrome",
    "/usr/bin/chrome",
];

/// Try to find a system Chromium/Chrome browser.
pub fn detect_browser_path() -> Option<String> {
    for &path in COMMON_BROWSER_PATHS {
        if Path::new(path).exists() {
            return Some(path.to_string());
        }
    }
    // Try $PATH lookup as fallback
    if let Ok(output) = std::process::Command::new("which")
        .arg("chromium-browser")
        .output()
    {
        if output.status.success() {
            let p = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !p.is_empty() {
                return Some(p);
            }
        }
    }
    if let Ok(output) = std::process::Command::new("which").arg("chromium").output() {
        if output.status.success() {
            let p = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !p.is_empty() {
                return Some(p);
            }
        }
    }
    if let Ok(output) = std::process::Command::new("which")
        .arg("google-chrome")
        .output()
    {
        if output.status.success() {
            let p = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !p.is_empty() {
                return Some(p);
            }
        }
    }
    None
}
