use std::path::Path;
use std::process::Command;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Regenerate TypeScript bindings when gateway types change
    println!("cargo:rerun-if-changed=src/gateway/types.rs");

    // In dev mode, skip web build - Next.js dev server handles it
    if std::env::var("PINCHY_DEV_MODE").as_deref() == Ok("1") {
        println!("cargo:warning=Dev mode: skipping web build (using Next.js dev server)");
        // Ensure folder exists for RustEmbed
        std::fs::create_dir_all("static/react").ok();
        return Ok(());
    }

    // Rebuild React UI when web/ sources change
    let web_dir = Path::new("web");
    let _out_dir = Path::new("static/react");

    // Only attempt build if web/ source exists (not present in crates.io package)
    if web_dir.join("package.json").exists() {
        println!("cargo:rerun-if-changed=web/app");
        println!("cargo:rerun-if-changed=web/package.json");
        println!("cargo:rerun-if-changed=web/next.config.mjs");
        println!("cargo:rerun-if-changed=web/tailwind.config.ts");

        // REMOVED: Skip if output already exists (make web was run manually)
        // This check prevented proper UI regeneration during development.
        // The `make dev` command now handles cleanup via dev.sh.

        // Detect package manager with lockfile priority:
        // - Use pnpm only if pnpm-lock.yaml exists
        // - Use npm if package-lock.json exists (or as fallback)
        let web_dir_path = Path::new("web");
        let (pm, install_args) = if web_dir_path.join("pnpm-lock.yaml").exists()
            && Command::new("pnpm").arg("--version").output().is_ok()
        {
            ("pnpm", &["install", "--frozen-lockfile"][..])
        } else if web_dir_path.join("package-lock.json").exists()
            && Command::new("npm").arg("--version").output().is_ok()
        {
            ("npm", &["ci"][..])
        } else if Command::new("npm").arg("--version").output().is_ok() {
            // Fallback to npm install if no lockfile found
            ("npm", &["install"][..])
        } else {
            println!("cargo:warning=Neither pnpm nor npm found - skipping web build");
            // Ensure folder exists for RustEmbed even if no package manager found
            std::fs::create_dir_all("static/react").ok();
            return Ok(());
        };

        println!("cargo:warning=Building React UI with {pm}...");

        let status = Command::new(pm)
            .args(install_args)
            .current_dir(web_dir)
            .status()?;
        if !status.success() {
            println!("cargo:warning={pm} install failed — web UI will use embedded fallback if available");
            // Ensure folder exists for RustEmbed even on failure
            std::fs::create_dir_all("static/react").ok();
            return Ok(());
        }

        let status = Command::new(pm)
            .args(["run", "build"])
            .current_dir(web_dir)
            .status()?;
        if !status.success() {
            println!("cargo:warning={pm} run build failed — web UI will use embedded fallback if available");
            // Ensure folder exists for RustEmbed even on failure
            std::fs::create_dir_all("static/react").ok();
            return Ok(());
        }

        println!("cargo:warning=React UI built successfully into static/react/");
    }

    // Ensure static/react exists for RustEmbed (even if empty or web/ doesn't exist)
    std::fs::create_dir_all("static/react").ok();

    Ok(())
}
