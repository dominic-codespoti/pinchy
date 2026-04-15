#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION=""
PUSH=false
DRY_RUN=false

usage() {
	cat <<'EOF'
Release helper for Pinchy.

Usage:
  scripts/release.sh --version X.Y.Z [--push] [--dry-run]

Options:
  --version X.Y.Z   Required release version without the leading v
  --push            Push the release commit and tag after verification
  --dry-run         Print the actions without changing git state
  -h, --help        Show this help text

What it does:
  1. Verifies you are on main with a clean worktree
  2. Updates Cargo.toml and Cargo.lock to the requested version
  3. Runs the release verification suite
  4. Creates a release commit if needed, then creates the matching git tag
  5. Optionally pushes main and the tag
EOF
}

run() {
	if $DRY_RUN; then
		printf '[dry-run] %s\n' "$*"
	else
		"$@"
	fi
}

require_clean_worktree() {
	local status
	status=$(git status --short)
	if [[ -n "$status" ]]; then
		echo "Working tree must be clean before preparing a release." >&2
		printf '%s\n' "$status" >&2
		exit 1
	fi
}

require_main_branch() {
	local branch
	branch=$(git branch --show-current)
	if [[ "$branch" != "main" ]]; then
		echo "Release preparation must run from main. Current branch: $branch" >&2
		exit 1
	fi
}

validate_version() {
	if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
		echo "Version must look like X.Y.Z (example: 0.1.21)" >&2
		exit 1
	fi
}

update_version_files() {
	run perl -0pi -e "s/version = \"[0-9]+\.[0-9]+\.[0-9]+\"/version = \"$VERSION\"/" Cargo.toml
	run cargo generate-lockfile
}

verify_version_state() {
	local cargo_version
	cargo_version=$(grep '^version = ' Cargo.toml | head -1 | sed -E 's/version = "([^"]+)"/\1/')
	if [[ "$cargo_version" != "$VERSION" ]]; then
		echo "Cargo.toml version mismatch after update: expected $VERSION, got $cargo_version" >&2
		exit 1
	fi
}

verify_tag_does_not_exist() {
	if git rev-parse "v$VERSION" >/dev/null 2>&1; then
		echo "Tag v$VERSION already exists." >&2
		exit 1
	fi
}

run_verification() {
	run cargo fmt
	run cargo clippy --no-default-features -- -D warnings
	run cargo test --no-default-features --lib
	run npm ci --prefix web
	run npm run lint --prefix web
	run npm run type-check --prefix web
	run npm run build --prefix web
	run cargo build --release --no-default-features
	run cargo package --no-default-features --allow-dirty --no-verify
}

create_release_commit_and_tag() {
	if git diff --quiet -- Cargo.toml Cargo.lock; then
		printf 'Version files already match v%s; skipping release commit.\n' "$VERSION"
	else
		run git add Cargo.toml Cargo.lock
		run git commit -m "chore(release): prepare v$VERSION"
	fi
	run git tag "v$VERSION"
}

push_release() {
	run git push origin main
	run git push origin "v$VERSION"
}

while [[ $# -gt 0 ]]; do
	case "$1" in
	--version)
		VERSION="$2"
		shift 2
		;;
	--push)
		PUSH=true
		shift
		;;
	--dry-run)
		DRY_RUN=true
		shift
		;;
	-h | --help)
		usage
		exit 0
		;;
	*)
		echo "Unknown option: $1" >&2
		usage >&2
		exit 1
		;;
	esac
done

if [[ -z "$VERSION" ]]; then
	echo "--version is required" >&2
	usage >&2
	exit 1
fi

validate_version

cd "$ROOT_DIR"

require_main_branch
require_clean_worktree
verify_tag_does_not_exist
update_version_files
verify_version_state
run_verification
create_release_commit_and_tag

if $PUSH; then
	push_release
	printf 'Release v%s prepared and pushed.\n' "$VERSION"
else
	printf 'Release v%s prepared locally. Push with:\n' "$VERSION"
	printf '  git push origin main && git push origin v%s\n' "$VERSION"
fi
