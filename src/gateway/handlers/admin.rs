use axum::{
    body::Body,
    extract::Path as AxumPath,
    http::{header, StatusCode},
    response::{IntoResponse, Response},
    Json,
};
use serde::Serialize;

use crate::gateway::handlers::health::STARTUP_TIME;
use crate::gateway::types::ErrorResponse;

/// Response shape for admin stats endpoint.
/// Matches the frontend SystemStats type.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdminStats {
    pub total_agents: usize,
    pub total_sessions: usize,
    pub total_messages: usize,
    pub storage_usage: u64,
    pub uptime: u64,
    pub version: String,
}

/// `GET /api/admin/stats`
pub async fn api_admin_stats() -> impl IntoResponse {
    let stats = compute_stats();
    Json(stats)
}

fn compute_stats() -> AdminStats {
    // Total agents: count directories in agents folder
    let total_agents = crate::utils::agents_dir()
        .read_dir()
        .map(|entries| {
            entries
                .filter_map(|e| e.ok())
                .filter(|e| e.path().is_dir())
                .count()
        })
        .unwrap_or(0);

    // Database-derived stats
    let (total_sessions, total_messages, storage_usage) =
        if let Some(db) = crate::store::global_db() {
            let sessions = db.session_count_total().unwrap_or(0) as usize;
            let messages = db.receipt_count_total().unwrap_or(0) as usize;
            let db_size = db.file_size().unwrap_or(0);
            (sessions, messages, db_size)
        } else {
            (0, 0, 0)
        };

    // Uptime since startup
    let uptime = STARTUP_TIME
        .get()
        .map(|t| t.elapsed().as_secs())
        .unwrap_or(0);

    AdminStats {
        total_agents,
        total_sessions,
        total_messages,
        storage_usage,
        uptime,
        version: env!("CARGO_PKG_VERSION").to_string(),
    }
}

/// Response shape for database status.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DbStatusResponse {
    pub journal_mode: String,
    pub synchronous: i32,
    pub foreign_keys: bool,
    pub page_count: i64,
    pub page_size: i64,
    pub freelist_count: i64,
    pub estimated_size_bytes: i64,
    pub read_only: bool,
    pub wal_size_bytes: i64,
}

/// `GET /api/admin/db/status`
pub async fn api_admin_db_status() -> impl IntoResponse {
    let status = match crate::store::global_db() {
        Some(db) => match db.db_status() {
            Ok(s) => DbStatusResponse {
                journal_mode: s.journal_mode,
                synchronous: s.synchronous,
                foreign_keys: s.foreign_keys,
                page_count: s.page_count,
                page_size: s.page_size,
                freelist_count: s.freelist_count,
                estimated_size_bytes: s.estimated_size_bytes,
                read_only: s.read_only,
                wal_size_bytes: s.wal_size,
            },
            Err(e) => {
                return (
                    axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                    Json(ErrorResponse {
                        error: format!("Failed to get DB status: {e}"),
                        id: None,
                        agent_id: None,
                        filename: None,
                        allowed: None,
                    }),
                )
                    .into_response();
            }
        },
        None => {
            return (
                axum::http::StatusCode::SERVICE_UNAVAILABLE,
                Json(ErrorResponse {
                    error: "Database not available".to_string(),
                    id: None,
                    agent_id: None,
                    filename: None,
                    allowed: None,
                }),
            )
                .into_response();
        }
    };

    Json(status).into_response()
}

/// Table information response item.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TableInfo {
    pub name: String,
    pub row_count: i64,
    pub has_rowid: bool,
}

/// Response shape for database tables.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DbTablesResponse {
    pub tables: Vec<TableInfo>,
}

/// `GET /api/admin/db/tables`
pub async fn api_admin_db_tables() -> impl IntoResponse {
    let tables = match crate::store::global_db() {
        Some(db) => match db.table_stats() {
            Ok(stats) => stats
                .into_iter()
                .map(|s| TableInfo {
                    name: s.name,
                    row_count: s.row_count,
                    has_rowid: s.has_rowid,
                })
                .collect(),
            Err(e) => {
                return (
                    axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                    Json(ErrorResponse {
                        error: format!("Failed to get table stats: {e}"),
                        id: None,
                        agent_id: None,
                        filename: None,
                        allowed: None,
                    }),
                )
                    .into_response();
            }
        },
        None => {
            return (
                axum::http::StatusCode::SERVICE_UNAVAILABLE,
                Json(ErrorResponse {
                    error: "Database not available".to_string(),
                    id: None,
                    agent_id: None,
                    filename: None,
                    allowed: None,
                }),
            )
                .into_response();
        }
    };

    Json(DbTablesResponse { tables }).into_response()
}

/// Response shape for optimize operation.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OptimizeResponse {
    pub success: bool,
    pub size_before_bytes: i64,
    pub size_after_bytes: i64,
    pub bytes_reclaimed: i64,
}

/// `POST /api/admin/db/optimize`
pub async fn api_admin_db_optimize() -> impl IntoResponse {
    let result = match crate::store::global_db() {
        Some(db) => match db.optimize() {
            Ok(r) => OptimizeResponse {
                success: true,
                size_before_bytes: r.size_before_bytes,
                size_after_bytes: r.size_after_bytes,
                bytes_reclaimed: r.bytes_reclaimed,
            },
            Err(e) => {
                return (
                    axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                    Json(ErrorResponse {
                        error: format!("Optimization failed: {e}"),
                        id: None,
                        agent_id: None,
                        filename: None,
                        allowed: None,
                    }),
                )
                    .into_response();
            }
        },
        None => {
            return (
                axum::http::StatusCode::SERVICE_UNAVAILABLE,
                Json(ErrorResponse {
                    error: "Database not available".to_string(),
                    id: None,
                    agent_id: None,
                    filename: None,
                    allowed: None,
                }),
            )
                .into_response();
        }
    };

    Json(result).into_response()
}

/// Response shape for WAL checkpoint.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WalCheckpointResponse {
    pub success: bool,
    pub status: String,
    pub log_frames_checkpointed: i64,
    pub frames_checkpointed_since_last: i64,
    pub wal_size_before_bytes: i64,
    pub wal_size_after_bytes: i64,
}

/// `POST /api/admin/db/wal-checkpoint`
pub async fn api_admin_db_wal_checkpoint() -> impl IntoResponse {
    let result = match crate::store::global_db() {
        Some(db) => match db.wal_checkpoint() {
            Ok(r) => WalCheckpointResponse {
                success: r.status == "completed",
                status: r.status,
                log_frames_checkpointed: r.log_frames_checkpointed,
                frames_checkpointed_since_last: r.frames_checkpointed_since_last,
                wal_size_before_bytes: r.wal_size_before_bytes,
                wal_size_after_bytes: r.wal_size_after_bytes,
            },
            Err(e) => {
                return (
                    axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                    Json(ErrorResponse {
                        error: format!("WAL checkpoint failed: {e}"),
                        id: None,
                        agent_id: None,
                        filename: None,
                        allowed: None,
                    }),
                )
                    .into_response();
            }
        },
        None => {
            return (
                axum::http::StatusCode::SERVICE_UNAVAILABLE,
                Json(ErrorResponse {
                    error: "Database not available".to_string(),
                    id: None,
                    agent_id: None,
                    filename: None,
                    allowed: None,
                }),
            )
                .into_response();
        }
    };

    Json(result).into_response()
}

/// Backup info response item.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo {
    pub filename: String,
    pub size_bytes: u64,
    pub created_at: String,
}

/// Response shape for backup list.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupListResponse {
    pub backups: Vec<BackupInfo>,
    pub backup_dir: String,
}

/// `GET /api/admin/backups`
pub async fn api_admin_backups_list() -> impl IntoResponse {
    let pinchy_home = crate::pinchy_home();
    let backup_dir = pinchy_home.join("backups");

    let mut backups = Vec::new();

    if backup_dir.exists() {
        match std::fs::read_dir(&backup_dir) {
            Ok(entries) => {
                for entry in entries.flatten() {
                    let name = entry.file_name().to_string_lossy().to_string();
                    if !name.starts_with("pinchy-backup-") || !name.ends_with(".tar.gz") {
                        continue;
                    }
                    if let Ok(meta) = entry.metadata() {
                        let modified = meta
                            .modified()
                            .ok()
                            .map(|t| {
                                let dt: chrono::DateTime<chrono::Local> = t.into();
                                dt.format("%Y-%m-%d %H:%M:%S").to_string()
                            })
                            .unwrap_or_else(|| "unknown".into());
                        backups.push(BackupInfo {
                            filename: name,
                            size_bytes: meta.len(),
                            created_at: modified,
                        });
                    }
                }
                // Sort newest first by filename (timestamp embedded)
                backups.sort_by(|a, b| b.filename.cmp(&a.filename));
            }
            Err(e) => {
                return (
                    axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                    Json(ErrorResponse {
                        error: format!("Failed to read backup directory: {e}"),
                        id: None,
                        agent_id: None,
                        filename: None,
                        allowed: None,
                    }),
                )
                    .into_response();
            }
        }
    }

    Json(BackupListResponse {
        backups,
        backup_dir: backup_dir.to_string_lossy().to_string(),
    })
    .into_response()
}

/// Response shape for backup creation.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateBackupResponse {
    pub success: bool,
    pub filename: String,
    pub path: String,
    pub size_bytes: u64,
    pub file_count: usize,
}

/// `POST /api/admin/backups`
pub async fn api_admin_backup_create() -> impl IntoResponse {
    let pinchy_home = crate::pinchy_home();

    match crate::cli::backup::create(&pinchy_home, None).await {
        Ok(()) => {
            // Find the newest backup file to get details
            let backup_dir = pinchy_home.join("backups");
            let mut newest_backup: Option<(String, u64)> = None;

            if let Ok(entries) = std::fs::read_dir(&backup_dir) {
                for entry in entries.flatten() {
                    let name = entry.file_name().to_string_lossy().to_string();
                    if name.starts_with("pinchy-backup-") && name.ends_with(".tar.gz") {
                        if let Ok(meta) = entry.metadata() {
                            if newest_backup.is_none() || name > newest_backup.as_ref().unwrap().0 {
                                newest_backup = Some((name, meta.len()));
                            }
                        }
                    }
                }
            }

            if let Some((filename, size)) = newest_backup {
                // Count files in the backup by collecting
                let file_count =
                    crate::cli::backup::collect_backup_files(&pinchy_home).map_or(0, |v| v.len());

                Json(CreateBackupResponse {
                    success: true,
                    filename: filename.clone(),
                    path: backup_dir.join(filename).to_string_lossy().to_string(),
                    size_bytes: size,
                    file_count,
                })
                .into_response()
            } else {
                (
                    axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                    Json(ErrorResponse {
                        error: "Backup created but could not locate file".to_string(),
                        id: None,
                        agent_id: None,
                        filename: None,
                        allowed: None,
                    }),
                )
                    .into_response()
            }
        }
        Err(e) => (
            axum::http::StatusCode::INTERNAL_SERVER_ERROR,
            Json(ErrorResponse {
                error: format!("Backup creation failed: {e}"),
                id: None,
                agent_id: None,
                filename: None,
                allowed: None,
            }),
        )
            .into_response(),
    }
}

/// Response shape for database index info.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexInfoResponse {
    pub name: String,
    pub table: String,
    pub unique: bool,
    pub columns: Vec<String>,
    pub partial: bool,
}

/// Response shape for agent storage summary.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentStorageResponse {
    pub agent_id: String,
    pub session_count: i64,
    pub exchange_count: i64,
    pub receipt_count: i64,
    pub memory_count: i64,
    pub estimated_bytes: i64,
}

/// Response shape for PRAGMA diagnostics.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PragmaDiagnosticsResponse {
    pub encoding: String,
    pub schema_version: i32,
    pub user_version: i32,
    pub application_id: i32,
    pub auto_vacuum: i32,
    pub cache_size: i64,
    pub temp_store: i32,
    pub legacy_alter_table: bool,
    pub reverse_unordered_selects: bool,
}

/// Response shape for database diagnostics.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DbDiagnosticsResponse {
    pub indexes: Vec<IndexInfoResponse>,
    pub agent_storage: Vec<AgentStorageResponse>,
    pub pragma: PragmaDiagnosticsResponse,
}

/// `GET /api/admin/db/diagnostics`
pub async fn api_admin_db_diagnostics() -> impl IntoResponse {
    let diagnostics = match crate::store::global_db() {
        Some(db) => match db.db_diagnostics() {
            Ok(d) => DbDiagnosticsResponse {
                indexes: d
                    .indexes
                    .into_iter()
                    .map(|i| IndexInfoResponse {
                        name: i.name,
                        table: i.table,
                        unique: i.unique,
                        columns: i.columns,
                        partial: i.partial,
                    })
                    .collect(),
                agent_storage: d
                    .agent_storage
                    .into_iter()
                    .map(|a| AgentStorageResponse {
                        agent_id: a.agent_id,
                        session_count: a.session_count,
                        exchange_count: a.exchange_count,
                        receipt_count: a.receipt_count,
                        memory_count: a.memory_count,
                        estimated_bytes: a.estimated_bytes,
                    })
                    .collect(),
                pragma: PragmaDiagnosticsResponse {
                    encoding: d.pragma.encoding,
                    schema_version: d.pragma.schema_version,
                    user_version: d.pragma.user_version,
                    application_id: d.pragma.application_id,
                    auto_vacuum: d.pragma.auto_vacuum,
                    cache_size: d.pragma.cache_size,
                    temp_store: d.pragma.temp_store,
                    legacy_alter_table: d.pragma.legacy_alter_table,
                    reverse_unordered_selects: d.pragma.reverse_unordered_selects,
                },
            },
            Err(e) => {
                return (
                    axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                    Json(ErrorResponse {
                        error: format!("Failed to get DB diagnostics: {e}"),
                        id: None,
                        agent_id: None,
                        filename: None,
                        allowed: None,
                    }),
                )
                    .into_response();
            }
        },
        None => {
            return (
                axum::http::StatusCode::SERVICE_UNAVAILABLE,
                Json(ErrorResponse {
                    error: "Database not available".to_string(),
                    id: None,
                    agent_id: None,
                    filename: None,
                    allowed: None,
                }),
            )
                .into_response();
        }
    };

    Json(diagnostics).into_response()
}

/// Validate a backup filename for security.
/// Only allows `pinchy-backup-YYYYmmdd-HHMMSS.tar.gz` format.
fn is_valid_backup_filename(filename: &str) -> bool {
    // Must start with prefix and end with .tar.gz
    if !filename.starts_with("pinchy-backup-") || !filename.ends_with(".tar.gz") {
        return false;
    }

    // Check for path traversal attempts
    if filename.contains("..") || filename.contains('/') || filename.contains('\\') {
        return false;
    }

    // Validate the timestamp portion: pinchy-backup-YYYYMMDD-HHMMSS.tar.gz
    let expected_len = "pinchy-backup-".len() + "YYYYMMDD-HHMMSS".len() + ".tar.gz".len();
    if filename.len() != expected_len {
        return false;
    }

    // Extract and validate timestamp portion
    let timestamp_part = &filename["pinchy-backup-".len()..filename.len() - ".tar.gz".len()];
    if timestamp_part.len() != "YYYYMMDD-HHMMSS".len() {
        return false;
    }

    // Check date format (basic validation)
    if !timestamp_part.chars().enumerate().all(|(i, c)| {
        match i {
            0..=7 => c.is_ascii_digit(), // YYYYMMDD
            8 => c == '-',
            9..=14 => c.is_ascii_digit(), // HHMMSS
            _ => false,
        }
    }) {
        return false;
    }

    true
}

/// `GET /api/admin/backups/:filename/download`
pub async fn api_admin_backup_download(AxumPath(filename): AxumPath<String>) -> impl IntoResponse {
    // Strict filename validation
    if !is_valid_backup_filename(&filename) {
        return (
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "Invalid backup filename".to_string(),
                id: None,
                agent_id: None,
                filename: None,
                allowed: None,
            }),
        )
            .into_response();
    }

    let pinchy_home = crate::pinchy_home();
    let backup_path = pinchy_home.join("backups").join(&filename);

    // Ensure the resolved path is within the backups directory (prevent traversal)
    let canonical_backup = match backup_path.canonicalize() {
        Ok(p) => p,
        Err(_) => {
            return (
                StatusCode::NOT_FOUND,
                Json(ErrorResponse {
                    error: "Backup file not found".to_string(),
                    id: None,
                    agent_id: None,
                    filename: None,
                    allowed: None,
                }),
            )
                .into_response();
        }
    };

    let canonical_backups_dir = match pinchy_home.join("backups").canonicalize() {
        Ok(p) => p,
        Err(_) => {
            return (
                StatusCode::NOT_FOUND,
                Json(ErrorResponse {
                    error: "Backups directory not found".to_string(),
                    id: None,
                    agent_id: None,
                    filename: None,
                    allowed: None,
                }),
            )
                .into_response();
        }
    };

    // Double-check the file is actually inside the backups directory
    if !canonical_backup.starts_with(&canonical_backups_dir) {
        return (
            StatusCode::FORBIDDEN,
            Json(ErrorResponse {
                error: "Access denied".to_string(),
                id: None,
                agent_id: None,
                filename: None,
                allowed: None,
            }),
        )
            .into_response();
    }

    // Check file exists and is a file
    if !canonical_backup.is_file() {
        return (
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "Backup file not found".to_string(),
                id: None,
                agent_id: None,
                filename: None,
                allowed: None,
            }),
        )
            .into_response();
    }

    // Get file metadata
    let file_size = match tokio::fs::metadata(&canonical_backup).await {
        Ok(m) => m.len(),
        Err(_) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "Failed to read backup file metadata".to_string(),
                    id: None,
                    agent_id: None,
                    filename: None,
                    allowed: None,
                }),
            )
                .into_response();
        }
    };

    // Open file for streaming
    let file = match tokio::fs::File::open(&canonical_backup).await {
        Ok(f) => f,
        Err(_) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(ErrorResponse {
                    error: "Failed to open backup file".to_string(),
                    id: None,
                    agent_id: None,
                    filename: None,
                    allowed: None,
                }),
            )
                .into_response();
        }
    };

    // Create stream from file
    let stream = tokio_util::io::ReaderStream::new(file);
    let body = Body::from_stream(stream);

    // Build response with appropriate headers
    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "application/gzip")
        .header(
            header::CONTENT_DISPOSITION,
            format!("attachment; filename=\"{}\"", filename),
        )
        .header(header::CONTENT_LENGTH, file_size)
        .body(body)
        .unwrap()
}

/// Response shape for backup verification.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VerifyBackupResponse {
    pub valid: bool,
    pub filename: String,
    pub file_count: usize,
    pub agents: Vec<String>,
    pub error: Option<String>,
}

/// `GET /api/admin/backups/:filename/verify`
pub async fn api_admin_backup_verify(AxumPath(filename): AxumPath<String>) -> impl IntoResponse {
    // Strict filename validation (same as download)
    if !is_valid_backup_filename(&filename) {
        return (
            StatusCode::BAD_REQUEST,
            Json(ErrorResponse {
                error: "Invalid backup filename".to_string(),
                id: None,
                agent_id: None,
                filename: None,
                allowed: None,
            }),
        )
            .into_response();
    }

    let pinchy_home = crate::pinchy_home();
    let backup_path = pinchy_home.join("backups").join(&filename);

    // Ensure the resolved path is within the backups directory (prevent traversal)
    let canonical_backup = match backup_path.canonicalize() {
        Ok(p) => p,
        Err(_) => {
            return (
                StatusCode::NOT_FOUND,
                Json(ErrorResponse {
                    error: "Backup file not found".to_string(),
                    id: None,
                    agent_id: None,
                    filename: None,
                    allowed: None,
                }),
            )
                .into_response();
        }
    };

    let canonical_backups_dir = match pinchy_home.join("backups").canonicalize() {
        Ok(p) => p,
        Err(_) => {
            return (
                StatusCode::NOT_FOUND,
                Json(ErrorResponse {
                    error: "Backups directory not found".to_string(),
                    id: None,
                    agent_id: None,
                    filename: None,
                    allowed: None,
                }),
            )
                .into_response();
        }
    };

    // Double-check the file is actually inside the backups directory
    if !canonical_backup.starts_with(&canonical_backups_dir) {
        return (
            StatusCode::FORBIDDEN,
            Json(ErrorResponse {
                error: "Access denied".to_string(),
                id: None,
                agent_id: None,
                filename: None,
                allowed: None,
            }),
        )
            .into_response();
    }

    // Check file exists and is a file
    if !canonical_backup.is_file() {
        return (
            StatusCode::NOT_FOUND,
            Json(ErrorResponse {
                error: "Backup file not found".to_string(),
                id: None,
                agent_id: None,
                filename: None,
                allowed: None,
            }),
        )
            .into_response();
    }

    // Run verification in blocking task
    let path = canonical_backup.clone();
    let verify_result =
        tokio::task::spawn_blocking(move || crate::cli::backup::verify_backup(&path)).await;

    match verify_result {
        Ok(Ok(preview)) => Json(VerifyBackupResponse {
            valid: true,
            filename: filename.clone(),
            file_count: preview.file_count,
            agents: preview.agents,
            error: None,
        })
        .into_response(),
        Ok(Err(e)) => Json(VerifyBackupResponse {
            valid: false,
            filename: filename.clone(),
            file_count: 0,
            agents: vec![],
            error: Some(format!("{e}")),
        })
        .into_response(),
        Err(_) => Json(VerifyBackupResponse {
            valid: false,
            filename: filename.clone(),
            file_count: 0,
            agents: vec![],
            error: Some("Verification task failed".to_string()),
        })
        .into_response(),
    }
}
