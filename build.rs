use std::path::Path;
use std::process::Command;
use std::time::SystemTime;

/// Recursively check if any file in the source directory is newer than the reference time
fn source_is_newer(src_dir: &Path, reference_time: SystemTime) -> bool {
    if let Ok(entries) = std::fs::read_dir(src_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                if let Ok(metadata) = entry.metadata() {
                    if let Ok(modified) = metadata.modified() {
                        if modified > reference_time {
                            return true;
                        }
                    }
                }
            } else if path.is_dir() {
                if source_is_newer(&path, reference_time) {
                    return true;
                }
            }
        }
    }
    false
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Rebuild React UI when web/ sources change
    let web_dir = Path::new("web");
    let out_dir = Path::new("static/react");
    let out_index = out_dir.join("index.html");

    // Only attempt build if web/ source exists (not present in crates.io package)
    if !web_dir.join("package.json").exists() {
        return Ok(());
    }

    // Tell cargo to rebuild when these files change
    println!("cargo:rerun-if-changed=web/src");
    println!("cargo:rerun-if-changed=web/index.html");
    println!("cargo:rerun-if-changed=web/package.json");
    println!("cargo:rerun-if-changed=web/vite.config.ts");
    println!("cargo:rerun-if-changed=web/tailwind.config.ts");

    // Check if we need to rebuild by comparing timestamps
    if out_index.exists() {
        let out_mtime = std::fs::metadata(&out_index)?.modified()?;
        let src_dir = web_dir.join("src");

        // Check if any source file is newer than output
        let needs_rebuild = source_is_newer(&src_dir, out_mtime);

        if !needs_rebuild {
            println!("cargo:warning=Web build is up to date");
            return Ok(());
        }
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
        println!(
            "cargo:warning={pm} install failed — web UI will use embedded fallback if available"
        );
        return Ok(());
    }

    let status = Command::new(pm)
        .args(["run", "build"])
        .current_dir(web_dir)
        .status()?;
    if !status.success() {
        println!(
            "cargo:warning={pm} run build failed — web UI will use embedded fallback if available"
        );
        return Ok(());
    }

    println!("cargo:warning=React UI built successfully into static/react/");

    Ok(())
}
