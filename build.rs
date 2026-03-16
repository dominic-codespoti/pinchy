use std::path::Path;
use std::process::Command;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Rebuild React UI when web/ sources change
    let web_dir = Path::new("web");
    let out_dir = Path::new("static/react");

    // Only attempt build if web/ source exists (not present in crates.io package)
    if web_dir.join("package.json").exists() {
        println!("cargo:rerun-if-changed=web/src");
        println!("cargo:rerun-if-changed=web/index.html");
        println!("cargo:rerun-if-changed=web/package.json");
        println!("cargo:rerun-if-changed=web/vite.config.ts");
        println!("cargo:rerun-if-changed=web/tailwind.config.ts");

        // Skip if output already exists (make web was run manually)
        if out_dir.join("index.html").exists() {
            println!("cargo:warning=static/react/ already exists, skipping web build");
            return Ok(());
        }

        // Detect pnpm or npm
        let (pm, install_args): (&str, &[&str]) =
            if Command::new("pnpm").arg("--version").output().is_ok() {
                ("pnpm", &["install", "--frozen-lockfile"])
            } else {
                ("npm", &["ci"])
            };

        println!("cargo:warning=Building React UI with {pm}...");

        let status = Command::new(pm)
            .args(install_args)
            .current_dir(web_dir)
            .status()?;
        if !status.success() {
            println!("cargo:warning={pm} install failed — web UI will use embedded fallback if available");
            return Ok(());
        }

        let status = Command::new(pm)
            .args(["run", "build"])
            .current_dir(web_dir)
            .status()?;
        if !status.success() {
            println!("cargo:warning={pm} run build failed — web UI will use embedded fallback if available");
            return Ok(());
        }

        println!("cargo:warning=React UI built successfully into static/react/");
    }

    Ok(())
}
