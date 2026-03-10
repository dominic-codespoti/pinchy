# Security Audit — Pinchy

**Date:** 2026-03-10
**Scope:** Rust backend (`src/`) and React frontend (`web/src/`)

---

## Summary

| Severity | Count | Fixed |
|----------|-------|-------|
| Critical | 1     | 1     |
| High     | 4     | 4     |
| Medium   | 5     | 5     |
| Low      | 2     | 2     |

---

## Findings

### CRITICAL-01: Stored XSS via Markdown Rendering

- **Severity:** Critical
- **File:** `web/src/routes/chat.tsx` (line ~1806)
- **Description:** The `MarkdownBlock` component renders user-supplied Markdown via `marked` and injects the resulting HTML into the DOM using `dangerouslySetInnerHTML` without sanitization. An attacker can inject arbitrary JavaScript through crafted Markdown (e.g., `<img onerror=...>`), which executes in the context of any viewer's session.
- **Remediation:** Added `dompurify` dependency and wrapped the HTML output with `DOMPurify.sanitize()` before passing to `dangerouslySetInnerHTML`.
- **Status:** Fixed

---

### HIGH-01: Wildcard CORS Policy

- **Severity:** High
- **File:** `src/gateway/mod.rs` (lines 339–344)
- **Description:** The CORS layer used `allow_origin(Any)`, permitting any website to make credentialed requests to the API. This enables cross-origin data theft if the API is accessible from the network.
- **Remediation:** Replaced wildcard origin with a restrictive policy that only allows the gateway's own address (localhost variants). Supports `PINCHY_CORS_ORIGIN` env var for explicit override.
- **Status:** Fixed

---

### HIGH-02: Timing-Attack Vulnerable Token Comparison

- **Severity:** High
- **Files:**
  - `src/gateway/auth.rs` (line 38) — API token comparison
  - `src/gateway/handlers/webhook.rs` (line 48) — webhook secret comparison
- **Description:** Both the API authentication middleware and the webhook handler compared secrets using `==`, which is vulnerable to timing side-channel attacks. An attacker can iteratively guess the token one byte at a time by measuring response latency.
- **Remediation:** Replaced `==` comparisons with `ring::constant_time::verify_slices_are_equal()` for both the API token and webhook secret.
- **Status:** Fixed

---

### HIGH-03: Unsafe Default Bind Address Without Authentication

- **Severity:** High
- **File:** `src/gateway/mod.rs` (line ~394)
- **Description:** The gateway defaulted to binding on `0.0.0.0:3131` regardless of whether API authentication was configured. Without `PINCHY_API_TOKEN`, the unauthenticated API was exposed to the entire network.
- **Remediation:** When `PINCHY_API_TOKEN` is not set and `PINCHY_GATEWAY_ADDR` is not explicitly configured, the gateway now defaults to `127.0.0.1:3131` (localhost only). A warning log message explains the behavior. If a token is set, the default remains `0.0.0.0:3131`.
- **Status:** Fixed

---

### HIGH-04: API Token Leaked in Console Output

- **Severity:** High
- **File:** `src/main.rs` (lines 525–532)
- **Description:** The startup banner printed the full API token in the console URL (`🔗 http://…/?token=<full-token>`). This leaks the credential to terminal scrollback, log files, and screen-sharing sessions.
- **Remediation:** The token is now masked in console output, showing only the first 4 characters followed by `***` (e.g., `abcd***`).
- **Status:** Fixed

---

### MEDIUM-01: apply_patch Sandbox Bypass via Absolute Paths

- **Severity:** Medium
- **File:** `src/tools/builtins/apply_patch.rs` (lines 17–21)
- **Description:** The `apply_patch` tool had custom absolute-path handling that bypassed the workspace sandbox, using canonicalization-based checks that could be inconsistent with symlinks or race conditions. Other file tools used the stricter `sandbox_path()` utility.
- **Remediation:** Replaced the custom path resolution with `sandbox_path()` from `src/tools/mod.rs`, which rejects absolute paths and `..` traversal outright.
- **Status:** Fixed

---

### MEDIUM-02: Config API Exposes Sensitive Fields

- **Severity:** Medium
- **File:** `src/gateway/handlers/config.rs`
- **Description:** The `GET /api/config` endpoint returned the full configuration as JSON, including sensitive fields like `api_key`, `webhook_secret`, and `token` values from agent configurations.
- **Remediation:** Added a `redact_sensitive()` function that recursively walks the JSON response and replaces values of keys containing `api_key`, `webhook_secret`, or `token` with `"****"`. Applied to the serialized JSON before returning, without modifying the Config struct.
- **Status:** Fixed

---

### MEDIUM-03: Weak Key Derivation for Secrets Encryption

- **Severity:** Medium
- **File:** `src/secrets/mod.rs` (lines 28–33)
- **Description:** When deriving an encryption key from `PINCHY_SECRET_KEY`, a single SHA-256 hash was used. This is too fast for password-based key derivation and vulnerable to brute-force attacks.
- **Remediation:** Replaced single SHA-256 with PBKDF2-HMAC-SHA256 using 600,000 iterations and a fixed application salt (`"pinchy-secrets-v1"`). Added a migration path: on decryption failure, the code tries the legacy SHA-256-derived key, and if successful, re-encrypts with the PBKDF2-derived key. Uses the existing `ring` dependency.
- **Status:** Fixed

---

### MEDIUM-04: No Content Security Policy

- **Severity:** Medium
- **File:** `src/gateway/mod.rs`
- **Description:** The gateway served the web UI without a Content-Security-Policy header, leaving the frontend more vulnerable to XSS attacks, clickjacking, and data exfiltration.
- **Remediation:** Added an Axum middleware layer that injects the CSP header on all responses: `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws: wss:; img-src 'self' data:`.
- **Status:** Fixed

---

### MEDIUM-05: WebSocket Connections Not Authenticated in Frontend

- **Severity:** Medium
- **File:** `web/src/lib/ws.ts` (lines 5–8)
- **Description:** The `wsUrl()` helper constructed WebSocket URLs without forwarding the `?token=` query parameter from the page URL. When API authentication is enabled, WebSocket connections would fail or bypass auth.
- **Remediation:** `wsUrl()` now reads the `token` query parameter from `window.location.search` and appends it to WebSocket URLs when present.
- **Status:** Fixed

---

### LOW-01: .gitignore Missing .env Pattern

- **Severity:** Low
- **File:** `.gitignore`
- **Description:** The `.gitignore` file did not include a pattern for `.env` files, increasing the risk of accidentally committing environment files containing secrets.
- **Remediation:** Added `.env*` pattern to `.gitignore`.
- **Status:** Fixed

---

### LOW-02: CI Workflow Permissions Too Broad

- **Severity:** Low
- **File:** `.github/workflows/ci.yml`
- **Description:** The workflow had `contents: write` at the top level, granting write access to all jobs including `test` and `build`, which only need read access. This violates the principle of least privilege.
- **Remediation:** Changed top-level permission to `contents: read`. Added `contents: write` only to the `auto-tag` and `release` jobs that actually need it.
- **Status:** Fixed

---

## Notes

- All fixes maintain backward compatibility except the PBKDF2 key derivation change, which includes an automatic migration path from SHA-256 to PBKDF2.
- The `ring` crate was already a project dependency and is used for both constant-time comparisons and PBKDF2.
- The CORS change may require setting `PINCHY_CORS_ORIGIN` if accessing the API from a different origin than the gateway itself.
