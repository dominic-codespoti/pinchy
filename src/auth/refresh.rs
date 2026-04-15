//! Token refresh manager with request coalescing.
//!
//! Prevents concurrent refresh requests for the same provider by coalescing
//! multiple concurrent callers into a single refresh operation.

use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{Mutex, RwLock};
use tracing::{debug, warn};

/// Result of a token refresh operation.
#[derive(Debug, Clone)]
pub struct RefreshResult {
    /// Whether the refresh succeeded
    pub success: bool,
    /// The new access token (if successful)
    pub access_token: Option<String>,
    /// The new refresh token (if successful and rotated)
    pub refresh_token: Option<String>,
    /// Token expiry timestamp in seconds since epoch
    pub expires_at: Option<u64>,
    /// Error message (if failed)
    pub error: Option<String>,
}

/// Manages token refresh operations with request coalescing.
///
/// When multiple concurrent requests need a token refresh for the same provider,
/// only one actual refresh is performed. Other callers wait for the result.
pub struct RefreshManager {
    /// Ongoing refresh operations keyed by provider ID.
    /// Stores a broadcast channel sender that all waiting callers can subscribe to.
    pending: RwLock<HashMap<String, tokio::sync::broadcast::Sender<RefreshResult>>>,
    /// Per-provider locks to serialize refresh attempts
    locks: RwLock<HashMap<String, Arc<Mutex<()>>>>,
}

impl RefreshManager {
    /// Create a new refresh manager.
    pub fn new() -> Self {
        Self {
            pending: RwLock::new(HashMap::new()),
            locks: RwLock::new(HashMap::new()),
        }
    }

    /// Get or refresh token for a provider.
    ///
    /// - If a refresh is already in progress for this provider, wait for it
    /// - Otherwise, acquire the provider lock and perform the refresh
    /// - Returns the result of the refresh operation
    ///
    /// The `refresh_fn` is only called once even if multiple concurrent callers
    /// request a refresh for the same provider.
    pub async fn get_or_refresh<F, Fut>(
        &self,
        provider: &str,
        refresh_fn: F,
    ) -> anyhow::Result<RefreshResult>
    where
        F: FnOnce() -> Fut + Send + 'static,
        Fut: std::future::Future<Output = anyhow::Result<RefreshResult>> + Send,
    {
        let provider = provider.to_string();

        // Fast path: check if there's already a pending refresh we can join
        {
            let pending = self.pending.read().await;
            if let Some(sender) = pending.get(&provider) {
                let mut receiver = sender.subscribe();
                drop(pending);
                debug!(provider = %provider, "Joining in-progress token refresh");

                match receiver.recv().await {
                    Ok(result) => {
                        debug!(provider = %provider, success = result.success, "Received coalesced refresh result");
                        if result.success {
                            return Ok(result);
                        }
                        // If the pending refresh failed, don't cache the error
                        // Fall through to retry
                        warn!(provider = %provider, "Pending refresh failed, will retry");
                    }
                    Err(_) => {
                        // Broadcast channel closed, refresh was cancelled or panicked
                        warn!(provider = %provider, "Pending refresh cancelled, will retry");
                    }
                }
            }
        }

        // Get or create the per-provider lock
        let lock = {
            let mut locks = self.locks.write().await;
            locks
                .entry(provider.clone())
                .or_insert_with(|| Arc::new(Mutex::new(())))
                .clone()
        };

        // Acquire the lock - this serializes refresh attempts for this provider
        let _guard = lock.lock().await;

        // Double-check: another thread might have completed the refresh while we waited
        {
            let pending = self.pending.read().await;
            if let Some(sender) = pending.get(&provider) {
                let mut receiver = sender.subscribe();
                drop(pending);
                debug!(provider = %provider, "Joining refresh that started while waiting for lock");

                match receiver.recv().await {
                    Ok(result) => {
                        if result.success {
                            return Ok(result);
                        }
                        // Failed refresh - continue to retry
                    }
                    Err(_) => {
                        // Cancelled - continue to retry
                    }
                }
            }
        }

        // We are now the designated refresh worker for this provider
        // Create a broadcast channel for other callers to subscribe to
        let (tx, _rx) = tokio::sync::broadcast::channel(16);

        // Store the pending refresh so other callers can join
        {
            let mut pending = self.pending.write().await;
            pending.insert(provider.clone(), tx.clone());
        }

        debug!(provider = %provider, "Starting token refresh");

        // Perform the actual refresh
        let result = refresh_fn().await;

        // Remove from pending map regardless of success/failure
        {
            let mut pending = self.pending.write().await;
            pending.remove(&provider);
        }

        match result {
            Ok(refresh_result) => {
                debug!(
                    provider = %provider,
                    success = refresh_result.success,
                    has_token = refresh_result.access_token.is_some(),
                    "Token refresh completed"
                );

                // Broadcast the result to any waiting callers
                let _ = tx.send(refresh_result.clone());

                Ok(refresh_result)
            }
            Err(e) => {
                warn!(provider = %provider, error = %e, "Token refresh failed with error");

                // Create error result
                let error_result = RefreshResult {
                    success: false,
                    access_token: None,
                    refresh_token: None,
                    expires_at: None,
                    error: Some(e.to_string()),
                };

                // Broadcast the error
                let _ = tx.send(error_result.clone());

                Ok(error_result)
            }
        }
    }

    /// Check if a refresh is currently in progress for a provider.
    pub async fn is_refresh_in_progress(&self, provider: &str) -> bool {
        let pending = self.pending.read().await;
        pending.contains_key(provider)
    }

    /// Mark a token as needing proactive refresh.
    ///
    /// This is a hint that the caller should initiate a refresh soon,
    /// but does not trigger the refresh itself. The actual refresh
    /// should still go through `get_or_refresh`.
    ///
    /// Currently a no-op placeholder for future proactive refresh scheduling.
    pub async fn schedule_proactive_refresh(&self, _provider: &str) {
        // Placeholder for future implementation
        // Could track tokens nearing expiry and trigger background refresh
    }

    /// Clear any pending state for a provider.
    /// Useful for testing or force-reset scenarios.
    pub async fn clear_provider(&self, provider: &str) {
        let mut pending = self.pending.write().await;
        pending.remove(provider);

        let mut locks = self.locks.write().await;
        locks.remove(provider);

        debug!(provider = %provider, "Cleared refresh manager state for provider");
    }
}

impl Default for RefreshManager {
    fn default() -> Self {
        Self::new()
    }
}

// ---------------------------------------------------------------------------
// Global instance
// ---------------------------------------------------------------------------

use once_cell::sync::Lazy;

/// Global refresh manager instance.
static REFRESH_MANAGER: Lazy<RefreshManager> = Lazy::new(RefreshManager::new);

/// Get the global refresh manager instance.
pub fn get_refresh_manager() -> &'static RefreshManager {
    &REFRESH_MANAGER
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::time::Duration;

    #[tokio::test]
    async fn test_concurrent_refreshes_are_coalesced() {
        let manager = Arc::new(RefreshManager::new());
        let refresh_count = Arc::new(AtomicUsize::new(0));

        // Spawn 10 concurrent refresh requests
        let mut handles = vec![];
        for _ in 0..10 {
            let manager = manager.clone();
            let count = refresh_count.clone();
            let handle = tokio::spawn(async move {
                manager
                    .get_or_refresh("test-provider", move || {
                        let count = count.clone();
                        async move {
                            // Simulate slow refresh
                            tokio::time::sleep(Duration::from_millis(50)).await;
                            count.fetch_add(1, Ordering::SeqCst);
                            Ok(RefreshResult {
                                success: true,
                                access_token: Some("token123".to_string()),
                                refresh_token: None,
                                expires_at: Some(1234567890),
                                error: None,
                            })
                        }
                    })
                    .await
            });
            handles.push(handle);
        }

        // All should succeed
        for handle in handles {
            let result = handle.await.unwrap().unwrap();
            assert!(result.success);
            assert_eq!(result.access_token, Some("token123".to_string()));
        }

        // But refresh should only have been called once
        assert_eq!(refresh_count.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn test_failed_refresh_allows_retry() {
        let manager = RefreshManager::new();
        let should_fail = Arc::new(Mutex::new(true));

        // First call fails
        {
            let should_fail = should_fail.clone();
            let result = manager
                .get_or_refresh("failing-provider", move || {
                    let should_fail = should_fail.clone();
                    async move {
                        if *should_fail.lock().await {
                            Err(anyhow::anyhow!("Refresh failed"))
                        } else {
                            Ok(RefreshResult {
                                success: true,
                                access_token: Some("token".to_string()),
                                refresh_token: None,
                                expires_at: None,
                                error: None,
                            })
                        }
                    }
                })
                .await
                .unwrap();

            assert!(!result.success);
            assert!(result.error.is_some());
        }

        // Second call (with flag cleared) should succeed
        {
            let mut guard = should_fail.lock().await;
            *guard = false;
        }

        let result = manager
            .get_or_refresh("failing-provider", || async {
                Ok(RefreshResult {
                    success: true,
                    access_token: Some("token".to_string()),
                    refresh_token: None,
                    expires_at: None,
                    error: None,
                })
            })
            .await
            .unwrap();

        assert!(result.success);
    }

    #[tokio::test]
    async fn test_is_refresh_in_progress() {
        let manager = Arc::new(RefreshManager::new());

        assert!(!manager.is_refresh_in_progress("slow-provider").await);

        let (tx, rx) = tokio::sync::oneshot::channel::<()>();

        // Start a slow refresh in background
        let manager_ref = manager.clone();
        let handle = tokio::spawn(async move {
            manager_ref
                .get_or_refresh("slow-provider", move || {
                    let rx = rx;
                    async move {
                        // Wait for signal to complete
                        let _ = rx.await;
                        Ok(RefreshResult {
                            success: true,
                            access_token: Some("token".to_string()),
                            refresh_token: None,
                            expires_at: None,
                            error: None,
                        })
                    }
                })
                .await
        });

        // Give the refresh time to start
        tokio::time::sleep(Duration::from_millis(10)).await;

        // Should report in-progress
        assert!(manager.is_refresh_in_progress("slow-provider").await);

        // Complete the refresh
        let _ = tx.send(());
        let _ = handle.await;

        // Should no longer be in progress
        assert!(!manager.is_refresh_in_progress("slow-provider").await);
    }

    #[tokio::test]
    async fn test_different_providers_are_isolated() {
        let manager_a = Arc::new(RefreshManager::new());
        let manager_b = Arc::new(RefreshManager::new());
        let call_order = Arc::new(Mutex::new(Vec::new()));

        // Start two refreshes for different providers concurrently
        let order_a = call_order.clone();
        let manager_a_ref = manager_a.clone();
        let handle_a = tokio::spawn(async move {
            manager_a_ref
                .get_or_refresh("provider-a", move || {
                    let order_a = order_a.clone();
                    async move {
                        tokio::time::sleep(Duration::from_millis(20)).await;
                        order_a.lock().await.push("a");
                        Ok(RefreshResult {
                            success: true,
                            access_token: Some("token-a".to_string()),
                            refresh_token: None,
                            expires_at: None,
                            error: None,
                        })
                    }
                })
                .await
        });

        // Small delay to ensure different start times
        tokio::time::sleep(Duration::from_millis(5)).await;

        let order_b = call_order.clone();
        let handle_b = tokio::spawn(async move {
            manager_b
                .get_or_refresh("provider-b", move || {
                    let order_b = order_b.clone();
                    async move {
                        tokio::time::sleep(Duration::from_millis(10)).await;
                        order_b.lock().await.push("b");
                        Ok(RefreshResult {
                            success: true,
                            access_token: Some("token-b".to_string()),
                            refresh_token: None,
                            expires_at: None,
                            error: None,
                        })
                    }
                })
                .await
        });

        let result_a = handle_a.await.unwrap().unwrap();
        let result_b = handle_b.await.unwrap().unwrap();

        assert_eq!(result_a.access_token, Some("token-a".to_string()));
        assert_eq!(result_b.access_token, Some("token-b".to_string()));
    }
}
