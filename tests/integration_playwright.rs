// Opt-in Playwright integration test.
//
// This test exercises the real headless-Chromium BrowserService
// backed by `playwright-rs`.  It is **not** run by default — you
// must enable both the cargo feature and a runtime env-var:
//
//   PLAYWRIGHT_INTEGRATION=1 cargo test --test integration_playwright --features playwright
//
// The env-var guard keeps CI green even when Playwright browsers
// are not installed.

#![cfg(feature = "playwright")]

use mini_claw::tools::browser_service::BrowserService;

#[tokio::test]
async fn playwright_browser_roundtrip() {
    // Opt-in: skip unless the caller explicitly asked for this test.
    if std::env::var("PLAYWRIGHT_INTEGRATION").as_deref() != Ok("1") {
        eprintln!("skipping playwright integration test");
        return;
    }

    // (a) Launch Playwright + headless Chromium.
    let svc = BrowserService::new(true)
        .await
        .expect("BrowserService::new() failed — is Playwright installed?");

    // (b) Create a session for a test agent.
    let session = svc
        .create_session("test-agent")
        .await
        .expect("create_session failed");

    // (c) Navigate to a well-known page.
    svc.goto(&session, "https://example.com")
        .await
        .expect("goto failed");

    // (d) Evaluate JS to grab the page HTML and verify content.
    let page = svc
        .eval(&session, "document.documentElement.outerHTML")
        .await
        .expect("eval failed");

    let html = match &page {
        serde_json::Value::String(s) => s.clone(),
        other => other.to_string(),
    };
    assert!(
        html.contains("Example Domain"),
        "page HTML should contain 'Example Domain', got: {html:.200}"
    );

    // (e) Take a screenshot and verify it's non-empty.
    let png = svc.screenshot(&session).await.expect("screenshot failed");
    assert!(png.len() > 0, "screenshot should be non-empty");

    // (f) Tear down the session.
    svc.close(&session).await.expect("close failed");
}
