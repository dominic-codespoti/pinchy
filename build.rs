use std::process::Command;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Allow skipping install entirely via env var
    if std::env::var("PLAYWRIGHT_SKIP_INSTALL").as_deref() == Ok("1") {
        println!("cargo:warning=PLAYWRIGHT_SKIP_INSTALL=1, skipping Playwright install");
        return Ok(());
    }

    // Only run when the `playwright` feature is enabled
    if std::env::var("CARGO_FEATURE_PLAYWRIGHT").is_err() {
        return Ok(());
    }

    // Check if npx is available
    let npx_check = Command::new("which").arg("npx").output();
    match npx_check {
        Ok(output) if output.status.success() => {}
        _ => {
            println!("cargo:warning=npx not found in PATH, skipping Playwright chromium install");
            return Ok(());
        }
    }

    // Install Playwright Chromium
    println!("cargo:warning=installing Playwright chromium via npx …");
    let status = Command::new("npx")
        .args(["playwright@1.56.1", "install", "chromium"])
        .status()?;

    if !status.success() {
        return Err(format!(
            "npx playwright install chromium failed with exit code: {}",
            status.code().unwrap_or(-1)
        )
        .into());
    }

    println!("cargo:warning=playwright chromium installed");
    Ok(())
}
