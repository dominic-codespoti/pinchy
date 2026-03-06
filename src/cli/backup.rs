//! Backup and restore — `pinchy backup` / `pinchy restore`.
//!
//! Creates timestamped `.tar.gz` snapshots of the entire `PINCHY_HOME`
//! directory (config, secrets, agent workspaces, templates) and restores
//! them on demand.

use std::fs;
use std::io::IsTerminal;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};

use anyhow::{bail, Context};
use flate2::read::GzDecoder;
use flate2::write::GzEncoder;
use flate2::Compression;
use tracing::debug;

/// Default subdirectory inside `PINCHY_HOME` for backup archives.
const BACKUPS_DIR: &str = "backups";

/// Filename prefix for backup archives.
const BACKUP_PREFIX: &str = "pinchy-backup-";

// ── Backup ───────────────────────────────────────────────────────────────────

/// Create a compressed tarball of the entire `PINCHY_HOME`.
///
/// Includes: `config.yaml`, `.secrets/`, `templates/`, `agents/*/`.
/// Excludes: the `backups/` directory itself.
pub async fn create(pinchy_home: &Path, output_dir: Option<&Path>) -> anyhow::Result<()> {
    if !pinchy_home.exists() {
        bail!("PINCHY_HOME does not exist: {}", pinchy_home.display());
    }

    let out = output_dir
        .map(PathBuf::from)
        .unwrap_or_else(|| pinchy_home.join(BACKUPS_DIR));

    fs::create_dir_all(&out).with_context(|| format!("create output dir {}", out.display()))?;

    let timestamp = chrono::Local::now().format("%Y%m%d-%H%M%S");
    let filename = format!("{BACKUP_PREFIX}{timestamp}.tar.gz");
    let archive_path = out.join(&filename);

    println!("📦 Backing up {} …", pinchy_home.display());

    // Collect files to back up (relative to pinchy_home).
    let files = collect_backup_files(pinchy_home)?;
    debug!("collected {} files for backup", files.len());

    if files.is_empty() {
        bail!("nothing to back up — PINCHY_HOME appears empty");
    }

    // Build the archive (blocking I/O — offload to a thread).
    let home = pinchy_home.to_path_buf();
    let archive = archive_path.clone();
    let file_count = files.len();

    tokio::task::spawn_blocking(move || -> anyhow::Result<()> {
        let file = fs::File::create(&archive)
            .with_context(|| format!("create archive {}", archive.display()))?;
        let enc = GzEncoder::new(file, Compression::fast());
        let mut tar = tar::Builder::new(enc);

        for rel in &files {
            let abs = home.join(rel);
            debug!("  + {}", rel.display());
            tar.append_path_with_name(&abs, rel)
                .with_context(|| format!("add {}", rel.display()))?;
        }

        tar.into_inner()
            .context("finalize gzip stream")?
            .finish()
            .context("flush gzip")?;

        Ok(())
    })
    .await
    .context("backup task panicked")??;

    let size = humanize_bytes(fs::metadata(&archive_path)?.len());
    println!(
        "✅ Backup created: {} ({}, {} files)",
        archive_path.display(),
        size,
        file_count
    );
    println!(
        "   Restore with:  pinchy restore {}",
        archive_path.display()
    );

    Ok(())
}

// ── List ─────────────────────────────────────────────────────────────────────

/// List existing backup archives in `PINCHY_HOME/backups/`.
pub async fn list(pinchy_home: &Path) -> anyhow::Result<()> {
    let dir = pinchy_home.join(BACKUPS_DIR);

    if !dir.exists() {
        println!(
            "No backups found (directory does not exist: {})",
            dir.display()
        );
        return Ok(());
    }

    let mut entries: Vec<(String, u64, String)> = Vec::new();

    for entry in fs::read_dir(&dir).context("read backups dir")? {
        let entry = entry?;
        let name = entry.file_name().to_string_lossy().to_string();
        if !name.starts_with(BACKUP_PREFIX) || !name.ends_with(".tar.gz") {
            continue;
        }
        let meta = entry.metadata()?;
        let modified = meta
            .modified()
            .ok()
            .map(|t| {
                let dt: chrono::DateTime<chrono::Local> = t.into();
                dt.format("%Y-%m-%d %H:%M:%S").to_string()
            })
            .unwrap_or_else(|| "unknown".into());
        entries.push((name, meta.len(), modified));
    }

    if entries.is_empty() {
        println!("No backups found in {}", dir.display());
        return Ok(());
    }

    // Sort newest-first by filename (timestamp is embedded).
    entries.sort_by(|a, b| b.0.cmp(&a.0));

    println!("📋 Backups in {}:\n", dir.display());
    println!("  {:42} {:>8}  Date", "File", "Size");
    println!("  {}", "─".repeat(70));

    for (name, size, date) in &entries {
        println!("  {name:<42} {:>8}  {date}", humanize_bytes(*size));
    }

    println!("\n  {} backup(s) total", entries.len());

    Ok(())
}

// ── Restore ──────────────────────────────────────────────────────────────────

/// Restore a backup archive into `PINCHY_HOME`.
pub async fn restore(
    pinchy_home: &Path,
    archive: &Path,
    yes: bool,
    no_safety: bool,
) -> anyhow::Result<()> {
    if !archive.exists() {
        bail!("backup file not found: {}", archive.display());
    }

    // ── Preview ──────────────────────────────────────────────────────────
    let archive_buf = archive.to_path_buf();
    let preview = tokio::task::spawn_blocking({
        let archive_buf = archive_buf.clone();
        move || archive_preview(&archive_buf)
    })
    .await
    .context("preview task panicked")??;

    let size = humanize_bytes(fs::metadata(archive)?.len());

    println!("🔄 Restore preview");
    println!("   Archive:  {} ({})", archive.display(), size);
    println!("   Target:   {}", pinchy_home.display());
    println!("   Files:    {}", preview.file_count);
    if !preview.agents.is_empty() {
        println!("   Agents:   {}", preview.agents.join(", "));
    }
    println!();

    // ── Confirm ──────────────────────────────────────────────────────────
    if !yes {
        if !std::io::stdout().is_terminal() {
            bail!("refusing to restore without --yes in non-interactive mode");
        }
        let confirm = dialoguer::Confirm::new()
            .with_prompt("This will overwrite files in the target directory. Continue?")
            .default(false)
            .interact()
            .context("confirmation prompt")?;
        if !confirm {
            println!("Aborted.");
            return Ok(());
        }
    }

    // ── Safety backup ────────────────────────────────────────────────────
    if !no_safety && pinchy_home.exists() {
        println!("🛟 Creating safety backup first …");
        match create(pinchy_home, None).await {
            Ok(()) => {}
            Err(e) => {
                eprintln!("⚠️  Safety backup failed: {e}");
                eprintln!("   Continuing with restore anyway.");
            }
        }
    }

    // ── Extract ──────────────────────────────────────────────────────────
    let home = pinchy_home.to_path_buf();
    let archive_owned = archive_buf;

    println!("📦 Extracting …");

    tokio::task::spawn_blocking(move || -> anyhow::Result<()> {
        fs::create_dir_all(&home)
            .with_context(|| format!("create PINCHY_HOME {}", home.display()))?;

        let file = fs::File::open(&archive_owned)
            .with_context(|| format!("open archive {}", archive_owned.display()))?;
        let dec = GzDecoder::new(file);
        let mut tar = tar::Archive::new(dec);

        tar.unpack(&home)
            .with_context(|| format!("extract into {}", home.display()))?;

        // Fix permissions on secrets directory.
        let secrets_dir = home.join(".secrets");
        if secrets_dir.exists() {
            fs::set_permissions(&secrets_dir, fs::Permissions::from_mode(0o700))
                .context("chmod .secrets/")?;
            if let Ok(entries) = fs::read_dir(&secrets_dir) {
                for entry in entries.flatten() {
                    let _ = fs::set_permissions(entry.path(), fs::Permissions::from_mode(0o600));
                }
            }
        }

        Ok(())
    })
    .await
    .context("restore task panicked")??;

    println!(
        "✅ Restore complete — {} files extracted",
        preview.file_count
    );

    if !preview.agents.is_empty() {
        println!("\n   Restored agents:");
        for a in &preview.agents {
            println!("     • {a}");
        }
    }

    println!(
        "\n   Next: review config with `cat {}/config.yaml`",
        pinchy_home.display()
    );
    println!("         then start with `pinchy` or `make dev`");

    Ok(())
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/// Metadata extracted from scanning an archive.
struct ArchivePreview {
    file_count: usize,
    agents: Vec<String>,
}

/// Scan an archive and return a preview without extracting.
fn archive_preview(archive: &Path) -> anyhow::Result<ArchivePreview> {
    let file =
        fs::File::open(archive).with_context(|| format!("open archive {}", archive.display()))?;
    let dec = GzDecoder::new(file);
    let mut tar = tar::Archive::new(dec);

    let mut file_count = 0usize;
    let mut agents = std::collections::BTreeSet::new();

    for entry in tar.entries().context("read archive entries")? {
        let entry = entry?;
        file_count += 1;
        let path = entry.path()?;
        // Detect agent ids from paths like `agents/<id>/...`
        let mut components = path.components();
        if let Some(first) = components.next() {
            if first.as_os_str() == "agents" {
                if let Some(second) = components.next() {
                    agents.insert(second.as_os_str().to_string_lossy().to_string());
                }
            }
        }
    }

    Ok(ArchivePreview {
        file_count,
        agents: agents.into_iter().collect(),
    })
}

/// Collect all files to back up, returned as paths relative to `pinchy_home`.
///
/// Includes: config files, `.secrets/`, `templates/`, `agents/`.
/// Excludes: `backups/` directory.
fn collect_backup_files(pinchy_home: &Path) -> anyhow::Result<Vec<PathBuf>> {
    let mut files = Vec::new();

    // Top-level config files.
    for name in ["config.yaml", "config.yaml.bak"] {
        let p = pinchy_home.join(name);
        if p.is_file() {
            files.push(PathBuf::from(name));
        }
    }

    // Recursive directories to include.
    let include_dirs = [".secrets", "templates", "agents", "skills", "sessions"];

    for dir_name in include_dirs {
        let dir = pinchy_home.join(dir_name);
        if !dir.is_dir() {
            continue;
        }
        walk_dir(&dir, pinchy_home, &mut files)?;
    }

    Ok(files)
}

/// Recursively walk a directory, appending relative paths to `out`.
fn walk_dir(dir: &Path, base: &Path, out: &mut Vec<PathBuf>) -> anyhow::Result<()> {
    for entry in fs::read_dir(dir).with_context(|| format!("read {}", dir.display()))? {
        let entry = entry?;
        let path = entry.path();
        if path.is_dir() {
            walk_dir(&path, base, out)?;
        } else if path.is_file() {
            if let Ok(rel) = path.strip_prefix(base) {
                out.push(rel.to_path_buf());
            }
        }
    }
    Ok(())
}

/// Format a byte count as a human-readable string.
fn humanize_bytes(bytes: u64) -> String {
    const UNITS: &[&str] = &["B", "KB", "MB", "GB"];
    let mut size = bytes as f64;
    for unit in UNITS {
        if size < 1024.0 {
            return format!("{size:.1} {unit}");
        }
        size /= 1024.0;
    }
    format!("{size:.1} TB")
}
