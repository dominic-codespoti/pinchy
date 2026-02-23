fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Always skip Playwright browser download for all platforms
    println!("cargo:rustc-env=PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1");
    println!("cargo:warning=PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 (browser download always skipped by pinchy)");
    Ok(())
}
