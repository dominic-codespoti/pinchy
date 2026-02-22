use anyhow::{bail, Context, Result};
use std::path::PathBuf;

const SERVICE_NAME: &str = "pinchy";
const INSTALL_DIR: &str = "/opt/pinchy";

fn service_unit(bin_path: &str, pinchy_home: &str, user: &str) -> String {
    format!(
        r#"[Unit]
Description=Pinchy – lightweight AI agent platform
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User={user}
WorkingDirectory={pinchy_home}
ExecStart={bin_path}
Restart=always
RestartSec=5
Environment=PINCHY_HOME={pinchy_home}
Environment=RUST_LOG=info

NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths={pinchy_home}
PrivateTmp=true

[Install]
WantedBy=multi-user.target
"#
    )
}

fn current_exe_path() -> Result<PathBuf> {
    std::env::current_exe().context("failed to determine current executable path")
}

fn require_root() -> Result<()> {
    if !nix_is_root() {
        bail!("this command must be run as root (try: sudo mini_claw service install)");
    }
    Ok(())
}

fn nix_is_root() -> bool {
    unsafe { libc::geteuid() == 0 }
}

fn systemctl(args: &[&str]) -> Result<std::process::Output> {
    let out = std::process::Command::new("systemctl")
        .args(args)
        .output()
        .context("failed to run systemctl")?;
    Ok(out)
}

fn systemctl_ok(args: &[&str]) -> Result<()> {
    let out = systemctl(args)?;
    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr);
        bail!("systemctl {} failed: {}", args.join(" "), stderr.trim());
    }
    Ok(())
}

pub fn install(user: Option<&str>) -> Result<()> {
    require_root()?;

    let src = current_exe_path()?;
    let install_dir = PathBuf::from(INSTALL_DIR);
    let bin_dest = install_dir.join("mini_claw");
    let pinchy_home = install_dir.join(".pinchy");

    let run_user = user.unwrap_or_else(|| {
        if std::env::var("SUDO_USER").is_ok() {
            // We'll handle below
            ""
        } else {
            "root"
        }
    });
    let run_user = if run_user.is_empty() {
        std::env::var("SUDO_USER").unwrap_or_else(|_| "root".into())
    } else {
        run_user.to_string()
    };

    println!("📦 Installing Pinchy as a systemd service...\n");

    // 1. Create install directory
    std::fs::create_dir_all(&pinchy_home)
        .with_context(|| format!("create {}", pinchy_home.display()))?;
    println!("  ✓ Created {}", install_dir.display());

    // 2. Copy binary
    std::fs::copy(&src, &bin_dest)
        .with_context(|| format!("copy {} → {}", src.display(), bin_dest.display()))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&bin_dest, std::fs::Permissions::from_mode(0o755)).ok();
    }
    println!("  ✓ Installed binary to {}", bin_dest.display());

    // 3. Set ownership
    let chown = std::process::Command::new("chown")
        .args([
            "-R",
            &format!("{run_user}:{run_user}"),
            install_dir.to_str().unwrap(),
        ])
        .output();
    if let Ok(o) = chown {
        if o.status.success() {
            println!("  ✓ Set ownership to {run_user}");
        }
    }

    // 4. Copy existing config if the install dir doesn't have one yet
    let user_pinchy_home = dirs::home_dir()
        .map(|h| h.join(".pinchy"))
        .unwrap_or_default();
    let dest_config = pinchy_home.join("config.yaml");
    if !dest_config.exists() {
        let src_config = user_pinchy_home.join("config.yaml");
        if src_config.exists() {
            std::fs::copy(&src_config, &dest_config).ok();
            println!("  ✓ Copied config from {}", src_config.display());
        } else {
            println!("  ⚠ No config.yaml found — run: sudo -u {run_user} mini_claw onboard");
        }
    }

    // 5. Write systemd unit
    let unit_path = format!("/etc/systemd/system/{SERVICE_NAME}.service");
    let unit = service_unit(
        bin_dest.to_str().unwrap(),
        pinchy_home.to_str().unwrap(),
        &run_user,
    );
    std::fs::write(&unit_path, &unit).with_context(|| format!("write {unit_path}"))?;
    println!("  ✓ Wrote {unit_path}");

    // 6. Reload + enable
    systemctl_ok(&["daemon-reload"])?;
    systemctl_ok(&["enable", SERVICE_NAME])?;
    println!("  ✓ Service enabled");

    println!(
        "\n🎉 Done! Start with:\n   sudo systemctl start {SERVICE_NAME}\n   journalctl -u {SERVICE_NAME} -f"
    );
    Ok(())
}

pub fn uninstall() -> Result<()> {
    require_root()?;

    println!("🗑  Uninstalling Pinchy service...\n");

    // Stop + disable
    let _ = systemctl(&["stop", SERVICE_NAME]);
    let _ = systemctl(&["disable", SERVICE_NAME]);
    println!("  ✓ Stopped and disabled service");

    // Remove unit file
    let unit_path = format!("/etc/systemd/system/{SERVICE_NAME}.service");
    if std::path::Path::new(&unit_path).exists() {
        std::fs::remove_file(&unit_path).ok();
        println!("  ✓ Removed {unit_path}");
    }

    systemctl_ok(&["daemon-reload"])?;
    println!("  ✓ Reloaded systemd");

    println!("\n  Note: /opt/pinchy was left intact. Remove it manually if desired:\n   sudo rm -rf /opt/pinchy");
    Ok(())
}

pub fn start() -> Result<()> {
    require_root()?;
    systemctl_ok(&["start", SERVICE_NAME])?;
    println!("✅ {SERVICE_NAME} started");
    Ok(())
}

pub fn stop() -> Result<()> {
    require_root()?;
    systemctl_ok(&["stop", SERVICE_NAME])?;
    println!("⏹  {SERVICE_NAME} stopped");
    Ok(())
}

pub fn restart() -> Result<()> {
    require_root()?;
    systemctl_ok(&["restart", SERVICE_NAME])?;
    println!("🔄 {SERVICE_NAME} restarted");
    Ok(())
}

pub fn status() -> Result<()> {
    let out = systemctl(&["status", SERVICE_NAME])?;
    let stdout = String::from_utf8_lossy(&out.stdout);
    if stdout.is_empty() {
        let stderr = String::from_utf8_lossy(&out.stderr);
        println!("{stderr}");
    } else {
        println!("{stdout}");
    }
    Ok(())
}

pub fn logs(follow: bool, lines: usize) -> Result<()> {
    let n = lines.to_string();
    let mut args = vec!["-u", SERVICE_NAME, "-n", &n];
    if follow {
        args.push("-f");
    }
    let status = std::process::Command::new("journalctl")
        .args(&args)
        .status()
        .context("failed to run journalctl")?;
    if !status.success() {
        bail!("journalctl exited with {status}");
    }
    Ok(())
}
