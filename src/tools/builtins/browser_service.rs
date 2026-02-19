//! BrowserService — headless browser automation.
//!
//! Two back-ends are available at compile time:
//!
//! * **Default (sidecar)** — talks to a Playwright/CDP sidecar over HTTP.
//!   If the sidecar is not running, [`BrowserService::new`] returns an
//!   error immediately (fail-fast).
//!
//! * **`playwright` feature** — drives a headless Chromium directly via
//!   the [`playwright-rs`](https://github.com/padamson/playwright-rust)
//!   crate (no sidecar needed).

// ── Playwright-backed implementation ────────────────────────
#[cfg(feature = "playwright")]
mod impl_playwright {
    use serde_json::Value;
    use std::collections::HashMap;
    use std::sync::Arc;
    use tokio::sync::Mutex;

    use playwright_rust::api::LaunchOptions;
    use playwright_rust::protocol::Playwright;
    // TODO: if the crate re-exports `Page` / `Browser` at a different path,
    //       adjust these imports accordingly.
    use playwright_rust::protocol::{Browser, Page};

    /// Headless browser automation backed by `playwright-rs`.
    ///
    /// Each `BrowserService` owns a Playwright server process and a
    /// single Chromium browser instance.  Sessions map 1-to-1 to pages
    /// inside that browser.
    pub struct BrowserService {
        _playwright: Playwright,
        browser: Browser,
        /// session-id → Page handle.
        sessions: Arc<Mutex<HashMap<String, Page>>>,
    }

    // playwright_rs types are Send but not necessarily Debug.
    impl std::fmt::Debug for BrowserService {
        fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
            f.debug_struct("BrowserService")
                .field("backend", &"playwright-rs")
                .finish()
        }
    }

    impl BrowserService {
        /// Launch Playwright + Chromium.
        ///
        /// When `headless` is `true` (the default) the browser runs
        /// without a visible window.
        pub async fn new(headless: bool) -> anyhow::Result<Self> {
            let playwright = Playwright::launch()
                .await
                .map_err(|e| anyhow::anyhow!("failed to launch Playwright server: {e}"))?;

            let launch_opts = LaunchOptions::new().headless(headless);
            let browser = playwright
                .chromium()
                .launch_with_options(launch_opts)
                .await
                .map_err(|e| anyhow::anyhow!("failed to launch Chromium: {e}"))?;

            Ok(Self {
                _playwright: playwright,
                browser,
                sessions: Arc::new(Mutex::new(HashMap::new())),
            })
        }

        /// Create a new browser page for `agent_id` and return its session id.
        pub async fn create_session(&self, _agent_id: &str) -> anyhow::Result<String> {
            let page = self
                .browser
                .new_page()
                .await
                .map_err(|e| anyhow::anyhow!("failed to create page: {e}"))?;

            let session_id = uuid::Uuid::new_v4().to_string();
            self.sessions.lock().await.insert(session_id.clone(), page);
            Ok(session_id)
        }

        // ── helpers ──────────────────────────────────────────

        async fn get_page(&self, session_id: &str) -> anyhow::Result<Page> {
            self.sessions
                .lock()
                .await
                .get(session_id)
                .cloned()
                .ok_or_else(|| anyhow::anyhow!("unknown session: {session_id}"))
        }

        /// Navigate to a URL within a session.
        pub async fn goto(&self, session_id: &str, target_url: &str) -> anyhow::Result<Value> {
            let page = self.get_page(session_id).await?;
            let _response = page
                .goto(target_url, None)
                .await
                .map_err(|e| anyhow::anyhow!("goto failed: {e}"))?;

            // Return a small JSON envelope so callers stay compatible.
            Ok(serde_json::json!({
                "ok": true,
                "url": target_url,
            }))
        }

        /// Evaluate a JavaScript expression in the current page.
        pub async fn eval(&self, session_id: &str, expr: &str) -> anyhow::Result<Value> {
            let page = self.get_page(session_id).await?;
            // `evaluate_value` returns a `String` representation of the result.
            let result = page
                .evaluate_value(expr)
                .await
                .map_err(|e| anyhow::anyhow!("eval failed: {e}"))?;

            // Wrap in a JSON value for caller compatibility.
            Ok(Value::String(result))
        }

        /// Take a PNG screenshot of the page and return the raw bytes.
        pub async fn screenshot(&self, session_id: &str) -> anyhow::Result<Vec<u8>> {
            let page = self.get_page(session_id).await?;
            let bytes = page
                .screenshot(None)
                .await
                .map_err(|e| anyhow::anyhow!("screenshot failed: {e}"))?;
            Ok(bytes)
        }

        /// Close a browser session (page).
        pub async fn close(&self, session_id: &str) -> anyhow::Result<Value> {
            let page = self
                .sessions
                .lock()
                .await
                .remove(session_id)
                .ok_or_else(|| anyhow::anyhow!("unknown session: {session_id}"))?;

            page.close()
                .await
                .map_err(|e| anyhow::anyhow!("page close failed: {e}"))?;

            Ok(serde_json::json!({ "ok": true }))
        }
    }
}

#[cfg(feature = "playwright")]
pub use impl_playwright::BrowserService;

// ── Sidecar-based (default) implementation ──────────────────
#[cfg(not(feature = "playwright"))]
mod impl_sidecar {
    use anyhow::Context;
    use serde_json::Value;

    /// Default base URL for the browser sidecar.
    const DEFAULT_SIDECAR_URL: &str = "http://127.0.0.1:9514";

    /// Thin HTTP client for a headless-browser sidecar process.
    #[derive(Debug, Clone)]
    pub struct BrowserService {
        client: reqwest::Client,
        base_url: String,
    }

    impl BrowserService {
        /// Connect to the browser sidecar.
        ///
        /// Performs a health-check request; returns an error if the sidecar
        /// is unreachable.  The `_headless` parameter is ignored for the
        /// sidecar backend (the sidecar controls its own browser mode).
        pub async fn new(_headless: bool) -> anyhow::Result<Self> {
            let base_url = std::env::var("BROWSER_SIDECAR_URL")
                .unwrap_or_else(|_| DEFAULT_SIDECAR_URL.to_string());

            let client = reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(30))
                .build()
                .context("building HTTP client for browser sidecar")?;

            // Health check — fail fast if sidecar is down.
            let health = format!("{base_url}/health");
            client
                .get(&health)
                .send()
                .await
                .with_context(|| format!("browser sidecar not reachable at {base_url}"))?;

            Ok(Self { client, base_url })
        }

        /// Create a new browser session for the given agent.
        pub async fn create_session(&self, agent_id: &str) -> anyhow::Result<String> {
            let url = format!("{}/sessions", self.base_url);
            let body = serde_json::json!({ "agent_id": agent_id });
            let resp = self
                .client
                .post(&url)
                .json(&body)
                .send()
                .await
                .context("creating browser session")?;
            let json: Value = resp.json().await.context("parsing session response")?;
            json["session_id"]
                .as_str()
                .map(|s| s.to_string())
                .ok_or_else(|| anyhow::anyhow!("sidecar did not return session_id"))
        }

        /// Navigate to a URL within a session.
        pub async fn goto(&self, session_id: &str, target_url: &str) -> anyhow::Result<Value> {
            let endpoint = format!("{}/sessions/{}/goto", self.base_url, session_id);
            let body = serde_json::json!({ "url": target_url });
            let resp = self
                .client
                .post(&endpoint)
                .json(&body)
                .send()
                .await
                .context("browser goto")?;
            resp.json().await.context("parsing goto response")
        }

        /// Evaluate a JavaScript expression in the current page.
        pub async fn eval(&self, session_id: &str, expr: &str) -> anyhow::Result<Value> {
            let endpoint = format!("{}/sessions/{}/eval", self.base_url, session_id);
            let body = serde_json::json!({ "expression": expr });
            let resp = self
                .client
                .post(&endpoint)
                .json(&body)
                .send()
                .await
                .context("browser eval")?;
            resp.json().await.context("parsing eval response")
        }

        /// Close a browser session.
        pub async fn close(&self, session_id: &str) -> anyhow::Result<Value> {
            let endpoint = format!("{}/sessions/{}", self.base_url, session_id);
            let resp = self
                .client
                .delete(&endpoint)
                .send()
                .await
                .context("closing browser session")?;
            resp.json().await.context("parsing close response")
        }
    }
}

#[cfg(not(feature = "playwright"))]
pub use impl_sidecar::BrowserService;
