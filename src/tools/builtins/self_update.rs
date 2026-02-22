use std::path::Path;

use serde_json::{json, Value};

use crate::tools::{register_tool, ToolMeta};

fn find_repo_root() -> Option<std::path::PathBuf> {
    if let Ok(exe) = std::env::current_exe() {
        let mut dir = exe.parent()?.to_path_buf();
        for _ in 0..5 {
            if dir.join("Cargo.toml").exists() && dir.join("src").exists() {
                return Some(dir);
            }
            dir = dir.parent()?.to_path_buf();
        }
    }
    let cwd = std::env::current_dir().ok()?;
    if cwd.join("Cargo.toml").exists() {
        return Some(cwd);
    }
    None
}

pub async fn self_update(_workspace: &Path, args: Value) -> anyhow::Result<Value> {
    let repo_root = match find_repo_root() {
        Some(r) => r,
        None => {
            return Ok(json!({
                "status": "error",
                "message": "Could not locate the pinchy repo root."
            }));
        }
    };

    let dry_run = args
        .get("dry_run")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    // Check for available updates
    let _ = tokio::process::Command::new("git")
        .args(["fetch"])
        .current_dir(&repo_root)
        .output()
        .await;

    let status_output = tokio::process::Command::new("git")
        .args(["rev-list", "--count", "HEAD..@{u}"])
        .current_dir(&repo_root)
        .output()
        .await;

    let commits_behind: u32 = status_output
        .ok()
        .and_then(|o| String::from_utf8_lossy(&o.stdout).trim().parse().ok())
        .unwrap_or(0);

    if dry_run {
        return Ok(json!({
            "status": "ok",
            "dry_run": true,
            "repo_root": repo_root.display().to_string(),
            "commits_behind": commits_behind,
            "message": if commits_behind > 0 {
                format!("{commits_behind} new commit(s) available. Run self_update to apply.")
            } else {
                "Already up to date.".into()
            }
        }));
    }

    // Broadcast to connected clients
    crate::gateway::publish_event_json(&json!({
        "type": "self_update",
        "status": "starting",
        "message": "Pinchy is updating — be back shortly! 🔄"
    }));

    let script = repo_root.join("scripts/pinchy-update.sh");
    if script.exists() {
        spawn_update_script(&script, &repo_root).await
    } else {
        run_inline_update(&repo_root).await
    }
}

async fn spawn_update_script(script: &Path, repo_root: &Path) -> anyhow::Result<Value> {
    tracing::info!("spawning self-update script: {}", script.display());

    let mut cmd = tokio::process::Command::new("bash");
    cmd.arg(script)
        .arg(repo_root)
        .current_dir(repo_root)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null());

    // Detach from our process group so it survives our exit
    #[cfg(unix)]
    {
        #[allow(unused_imports)]
        use std::os::unix::process::CommandExt;
        unsafe {
            cmd.pre_exec(|| {
                libc::setsid();
                Ok(())
            });
        }
    }

    match cmd.spawn() {
        Ok(_) => {
            // Schedule graceful exit so the tool response gets sent first
            tokio::spawn(async {
                tokio::time::sleep(std::time::Duration::from_secs(3)).await;
                tracing::info!("exiting for self-update (systemd will restart)");
                std::process::exit(0);
            });

            Ok(json!({
                "status": "updating",
                "message": "Update started! Pulling latest code, rebuilding, and restarting. Be back in a couple minutes 🦀"
            }))
        }
        Err(e) => Ok(json!({
            "status": "error",
            "message": format!("Failed to spawn update script: {e}")
        })),
    }
}

async fn run_inline_update(repo_root: &Path) -> anyhow::Result<Value> {
    tracing::info!("running inline self-update (no script found)");

    let pull = tokio::process::Command::new("git")
        .args(["pull", "--ff-only"])
        .current_dir(repo_root)
        .output()
        .await?;

    if !pull.status.success() {
        return Ok(json!({
            "status": "error",
            "message": format!("git pull failed: {}", String::from_utf8_lossy(&pull.stderr))
        }));
    }

    let web_dir = repo_root.join("web");
    if web_dir.join("package.json").exists() {
        let _ = tokio::process::Command::new("pnpm")
            .args(["run", "build"])
            .current_dir(&web_dir)
            .output()
            .await;
    }

    let build = tokio::process::Command::new("cargo")
        .args(["build", "--release"])
        .current_dir(repo_root)
        .output()
        .await?;

    if !build.status.success() {
        return Ok(json!({
            "status": "error",
            "message": format!("Build failed: {}", String::from_utf8_lossy(&build.stderr))
        }));
    }

    let new_bin = repo_root.join("target/release/pinchy");
    let opt_bin = std::path::Path::new("/opt/pinchy/pinchy");
    if opt_bin.parent().map(|p| p.exists()).unwrap_or(false) && new_bin.exists() {
        let _ = tokio::fs::copy(&new_bin, opt_bin).await;
    }

    crate::gateway::publish_event_json(&json!({
        "type": "self_update",
        "status": "restarting",
        "message": "Build complete, restarting…"
    }));

    let commit = tokio::process::Command::new("git")
        .args(["rev-parse", "--short", "HEAD"])
        .current_dir(repo_root)
        .output()
        .await
        .ok()
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_default();

    tokio::spawn(async {
        tokio::time::sleep(std::time::Duration::from_secs(3)).await;
        tracing::info!("exiting for self-update");
        std::process::exit(0);
    });

    Ok(json!({
        "status": "updating",
        "commit": commit,
        "message": format!("Updated to {commit}! Restarting now… 🦀")
    }))
}

pub fn register() {
    register_tool(ToolMeta {
        name: "self_update".into(),
        description: "Pull latest code from git, rebuild pinchy, and restart. Use dry_run=true to check for updates first.".into(),
        args_schema: json!({
            "type": "object",
            "properties": {
                "dry_run": {
                    "type": "boolean",
                    "description": "If true, only check for updates without applying. Default: false"
                }
            }
        }),
    });
}
