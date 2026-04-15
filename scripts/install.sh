#!/usr/bin/env bash
#
# Pinchy Installer Script
# Downloads and installs prebuilt binaries from GitHub releases
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/dominic-codespoti/pinchy/main/scripts/install.sh | bash
#   # or with options:
#   curl -fsSL ... | bash -s -- --version v0.1.19 --prefix /usr/local
#
#   ./install.sh [--version VERSION] [--prefix PREFIX] [--force] [--help]
#

set -euo pipefail

# Configuration
REPO_OWNER="dominic-codespoti"
REPO_NAME="pinchy"
GITHUB_API="https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}"
BINARY_NAME="pinchy"

# Default installation settings
INSTALL_PREFIX=""
SPECIFIC_VERSION=""
FORCE_INSTALL=false
DRY_RUN=false

# Colors for output (disabled if not a TTY or NO_COLOR is set)
if [[ -t 1 ]] && [[ -z "${NO_COLOR:-}" ]]; then
	RED='\033[0;31m'
	GREEN='\033[0;32m'
	YELLOW='\033[1;33m'
	BLUE='\033[0;34m'
	CYAN='\033[0;36m'
	BOLD='\033[1m'
	NC='\033[0m' # No Color
else
	RED=''
	GREEN=''
	YELLOW=''
	BLUE=''
	CYAN=''
	BOLD=''
	NC=''
fi

# Logging functions
log_info() { echo -e "${BLUE}[INFO]${NC} $1" >&2; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1" >&2; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1" >&2; }
log_error() { echo -e "${RED}[ERROR]${NC} $1" >&2; }
log_step() { echo -e "${CYAN}→${NC} $1" >&2; }

# Print usage information
usage() {
	cat <<EOF
Pinchy Installer

Usage: $0 [OPTIONS]

Options:
    --version VERSION   Install specific version (e.g., v0.1.19)
    --prefix PREFIX     Installation prefix directory (default: auto-detect)
    --force             Overwrite existing installation without prompting
    --dry-run           Show what would be done without installing
    --help              Show this help message

Environment Variables:
    NO_COLOR            Disable colored output
    GITHUB_TOKEN        GitHub token for API authentication (increases rate limits)

Examples:
    # Install latest version
    $0

    # Install specific version
    $0 --version v0.1.19

    # Install to /usr/local/bin
    $0 --prefix /usr/local

    # Force overwrite existing installation
    $0 --force

EOF
}

# Parse command line arguments
parse_args() {
	while [[ $# -gt 0 ]]; do
		case $1 in
		--version)
			SPECIFIC_VERSION="$2"
			shift 2
			;;
		--prefix)
			INSTALL_PREFIX="$2"
			shift 2
			;;
		--force)
			FORCE_INSTALL=true
			shift
			;;
		--dry-run)
			DRY_RUN=true
			shift
			;;
		--help | -h)
			usage
			exit 0
			;;
		*)
			log_error "Unknown option: $1"
			usage
			exit 1
			;;
		esac
	done
}

# Detect the operating system
detect_os() {
	local os
	os=$(uname -s | tr '[:upper:]' '[:lower:]')

	case "$os" in
	linux)
		echo "linux"
		;;
	darwin)
		echo "macos"
		;;
	*)
		log_error "Unsupported operating system: $os"
		log_error "Supported systems: Linux, macOS"
		exit 1
		;;
	esac
}

# Detect the architecture
detect_arch() {
	local arch
	arch=$(uname -m)

	case "$arch" in
	x86_64 | amd64)
		echo "x86_64"
		;;
	aarch64 | arm64)
		echo "aarch64"
		;;
	armv7l)
		log_warn "ARMv7 detected. Falling back to aarch64 (may not work on all ARMv7 systems)"
		echo "aarch64"
		;;
	*)
		log_error "Unsupported architecture: $arch"
		log_error "Supported architectures: x86_64, aarch64 (arm64)"
		exit 1
		;;
	esac
}

# Build the asset name based on OS and architecture
build_asset_name() {
	local os=$1
	local arch=$2
	local version=$3

	# Remove 'v' prefix from version if present for consistency
	version="${version#v}"

	# Asset naming convention: pinchy-v0.1.19-linux-x86_64.tar.gz
	echo "${BINARY_NAME}-v${version}-${os}-${arch}.tar.gz"
}

# Fetch release information from GitHub API
fetch_release_info() {
	local version="${1:-}"
	local api_url
	local curl_opts=(-fsSL)

	# Add authentication if token is available
	if [[ -n "${GITHUB_TOKEN:-}" ]]; then
		curl_opts+=(-H "Authorization: token $GITHUB_TOKEN")
	fi

	if [[ -n "$version" ]]; then
		# Fetch specific release
		# Remove 'v' prefix if present for API call
		version="${version#v}"
		api_url="${GITHUB_API}/releases/tags/v${version}"
	else
		# Fetch latest release
		api_url="${GITHUB_API}/releases/latest"
	fi

	log_step "Fetching release info from GitHub API..."

	if [[ "$DRY_RUN" == true ]]; then
		log_info "[DRY-RUN] Would fetch: $api_url"
		# Return mock data for dry run
		if [[ -n "$version" ]]; then
			echo '{"tag_name": "v'"$version"'", "assets": [{"name": "pinchy-v'"$version"'-linux-x86_64.tar.gz", "browser_download_url": "https://example.com/mock"}]}'
		else
			echo '{"tag_name": "v0.1.19", "assets": [{"name": "pinchy-v0.1.19-linux-x86_64.tar.gz", "browser_download_url": "https://example.com/mock"}]}'
		fi
		return 0
	fi

	local response
	local http_code

	# Perform API request with error handling
	response=$(curl "${curl_opts[@]}" -w "\n%{http_code}" "$api_url" 2>&1) || {
		local exit_code=$?
		log_error "Failed to connect to GitHub API (curl exit code: $exit_code)"
		log_error "Please check your internet connection and try again."
		exit 1
	}

	# Extract HTTP code and body
	http_code=$(echo "$response" | tail -n1)
	response=$(echo "$response" | head -n -1)

	case "$http_code" in
	200)
		echo "$response"
		;;
	403)
		log_error "GitHub API rate limit exceeded (HTTP 403)"
		log_error "Set GITHUB_TOKEN environment variable to increase rate limits:"
		log_error "  export GITHUB_TOKEN=your_token_here"
		log_error "Or wait a few minutes and try again."
		exit 1
		;;
	404)
		if [[ -n "$version" ]]; then
			log_error "Release v${version} not found (HTTP 404)"
			log_error "Please check that the version exists: https://github.com/${REPO_OWNER}/${REPO_NAME}/releases"
		else
			log_error "No releases found (HTTP 404)"
		fi
		exit 1
		;;
	*)
		log_error "GitHub API request failed (HTTP $http_code)"
		log_error "Response: $response"
		exit 1
		;;
	esac
}

# Parse asset download URL from release JSON
parse_asset_url() {
	local release_json="$1"
	local asset_name="$2"

	# Use jq if available, otherwise use grep/sed fallback
	if command -v jq >/dev/null 2>&1; then
		echo "$release_json" | jq -r ".assets[] | select(.name == \"$asset_name\") | .browser_download_url"
	else
		# Fallback parsing with grep and sed (less reliable but no dependencies)
		echo "$release_json" | grep -o '"browser_download_url":"[^"]*'"$asset_name"'"[^"]*"' | sed 's/.*"browser_download_url":"\([^"]*\)".*/\1/' | head -n1
	fi
}

# Download a file with progress
download_file() {
	local url="$1"
	local output="$2"
	local curl_opts=(-fsSL --progress-bar)

	if [[ -n "${GITHUB_TOKEN:-}" ]]; then
		curl_opts+=(-H "Authorization: token $GITHUB_TOKEN")
	fi

	log_step "Downloading from $url..."

	if [[ "$DRY_RUN" == true ]]; then
		log_info "[DRY-RUN] Would download: $url → $output"
		return 0
	fi

	# Download with progress bar
	if ! curl "${curl_opts[@]}" -o "$output" "$url"; then
		log_error "Download failed from: $url"
		rm -f "$output"
		exit 1
	fi
}

# Verify that a downloaded file is a valid archive
verify_download() {
	local file="$1"

	if [[ "$DRY_RUN" == true ]]; then
		return 0
	fi

	if [[ ! -f "$file" ]]; then
		log_error "Downloaded file not found: $file"
		exit 1
	fi

	# Check if file is not empty
	if [[ ! -s "$file" ]]; then
		log_error "Downloaded file is empty: $file"
		exit 1
	fi

	# Check if it's a valid tar.gz by inspecting magic bytes
	if ! file "$file" | grep -qE "(gzip compressed|tar archive|POSIX tar)"; then
		log_warn "Downloaded file may not be a valid archive: $file"
		log_warn "File type: $(file "$file")"
		read -r -p "Continue anyway? [y/N] " response || true
		if [[ ! "$response" =~ ^[Yy]$ ]]; then
			exit 1
		fi
	fi
}

# Extract binary from tar.gz archive
extract_binary() {
	local archive="$1"
	local output_dir="$2"

	log_step "Extracting binary..."

	if [[ "$DRY_RUN" == true ]]; then
		log_info "[DRY-RUN] Would extract: $archive → $output_dir"
		return 0
	fi

	# Create temp extraction directory
	local temp_extract
	temp_extract=$(mktemp -d)
	trap "rm -rf $temp_extract" RETURN

	# Extract archive
	if ! tar -xzf "$archive" -C "$temp_extract" 2>/dev/null; then
		log_error "Failed to extract archive: $archive"
		exit 1
	fi

	# Find the binary in the extracted contents
	local binary_path
	binary_path=$(find "$temp_extract" -type f -name "$BINARY_NAME" | head -n1)

	if [[ -z "$binary_path" ]]; then
		log_error "Binary '$BINARY_NAME' not found in archive contents:"
		find "$temp_extract" -type f >&2
		exit 1
	fi

	# Move to output directory
	mv "$binary_path" "$output_dir/$BINARY_NAME"
}

# Determine installation directory
detect_install_dir() {
	# If prefix is explicitly set, use it
	if [[ -n "$INSTALL_PREFIX" ]]; then
		echo "$INSTALL_PREFIX/bin"
		return 0
	fi

	# Try to find the best installation directory
	local candidates=(
		"$HOME/.local/bin"
		"/usr/local/bin"
		"$HOME/bin"
	)

	for dir in "${candidates[@]}"; do
		# Check if directory exists and is writable, or if we can create it
		if [[ -d "$dir" ]] && [[ -w "$dir" ]]; then
			echo "$dir"
			return 0
		fi

		# Try to create the directory
		if [[ ! -d "$dir" ]]; then
			local parent
			parent=$(dirname "$dir")
			if [[ -d "$parent" ]] && [[ -w "$parent" ]]; then
				echo "$dir"
				return 0
			fi
		fi
	done

	# Default to ~/.local/bin as fallback
	echo "$HOME/.local/bin"
}

# Check if directory is in PATH
check_in_path() {
	local dir="$1"
	case ":$PATH:" in
	*":$dir:"*) return 0 ;;
	*) return 1 ;;
	esac
}

# Prompt user for yes/no
confirm() {
	local message="$1"
	local default="${2:-n}"

	# Non-interactive mode - return default
	if [[ ! -t 0 ]]; then
		[[ "$default" == "y" ]]
		return
	fi

	local prompt
	if [[ "$default" == "y" ]]; then
		prompt="[Y/n]"
	else
		prompt="[y/N]"
	fi

	read -r -p "$message $prompt " response || true

	if [[ -z "$response" ]]; then
		response="$default"
	fi

	[[ "$response" =~ ^[Yy]$ ]]
}

# Check for existing installation and handle accordingly
check_existing() {
	local install_dir="$1"
	local binary_path="$install_dir/$BINARY_NAME"

	if [[ ! -f "$binary_path" ]]; then
		return 0
	fi

	local existing_version
	if existing_version=$("$binary_path" --version 2>/dev/null); then
		log_warn "Existing installation found: $existing_version"
	else
		log_warn "Existing installation found at: $binary_path"
	fi

	if [[ "$FORCE_INSTALL" == true ]]; then
		log_info "Force flag set - overwriting existing installation"
		return 0
	fi

	if ! confirm "Overwrite existing installation?" "n"; then
		log_info "Installation cancelled by user"
		exit 0
	fi

	return 0
}

# Create directory if it doesn't exist
ensure_dir() {
	local dir="$1"

	if [[ "$DRY_RUN" == true ]]; then
		log_info "[DRY-RUN] Would create directory: $dir"
		return 0
	fi

	if [[ ! -d "$dir" ]]; then
		log_step "Creating directory: $dir"
		if ! mkdir -p "$dir"; then
			log_error "Failed to create directory: $dir"
			log_error "Please check permissions or run with appropriate privileges"
			exit 1
		fi
	fi
}

# Install the binary
install_binary() {
	local source="$1"
	local dest="$2"

	log_step "Installing binary to $dest..."

	if [[ "$DRY_RUN" == true ]]; then
		log_info "[DRY-RUN] Would install: $source → $dest"
		log_info "[DRY-RUN] Would set executable permissions on $dest"
		return 0
	fi

	# Move binary to destination
	if ! mv "$source" "$dest"; then
		log_error "Failed to install binary to: $dest"
		log_error "Please check permissions or try with --prefix option"
		exit 1
	fi

	# Set executable permissions
	if ! chmod +x "$dest"; then
		log_error "Failed to set executable permissions on: $dest"
		exit 1
	fi
}

# Verify installation by running version command
verify_installation() {
	local binary_path="$1"

	log_step "Verifying installation..."

	if [[ "$DRY_RUN" == true ]]; then
		log_info "[DRY-RUN] Would verify: $binary_path --version"
		return 0
	fi

	if [[ ! -f "$binary_path" ]]; then
		log_error "Binary not found at expected location: $binary_path"
		exit 1
	fi

	local version_output
	if ! version_output=$("$binary_path" --version 2>&1); then
		log_error "Installation verification failed - binary doesn't execute properly"
		log_error "Output: $version_output"
		exit 1
	fi

	log_success "Installation verified: $version_output"
}

# Print installation summary and PATH advice
print_summary() {
	local install_dir="$1"
	local binary_path="$2"

	echo
	echo -e "${GREEN}${BOLD}Pinchy installed successfully!${NC}"
	echo
	echo "  Binary location: $binary_path"
	echo "  Version: $("$binary_path" --version 2>/dev/null || echo "Unknown")"
	echo

	# Check if in PATH
	if ! check_in_path "$install_dir"; then
		echo -e "${YELLOW}Note: $install_dir is not in your PATH${NC}"
		echo
		echo "To add it to your PATH, add the following to your shell profile:"
		echo
		case "${SHELL:-}" in
		*/zsh)
			echo "  echo 'export PATH=\"$install_dir:\$PATH\"' >> ~/.zshrc"
			echo "  source ~/.zshrc"
			;;
		*/fish)
			echo "  fish_add_path $install_dir"
			;;
		*)
			echo "  echo 'export PATH=\"$install_dir:\$PATH\"' >> ~/.bashrc"
			echo "  source ~/.bashrc"
			;;
		esac
		echo
	fi

	echo "Get started:"
	echo "  pinchy --help"
	echo
	echo "Documentation: https://github.com/$REPO_OWNER/$REPO_NAME"
}

# Main installation flow
main() {
	parse_args "$@"

	# Print banner
	echo
	echo -e "${BOLD}Pinchy Installer${NC}"
	echo -e "${CYAN}================${NC}"
	echo

	# Detect platform
	local os arch
	os=$(detect_os)
	arch=$(detect_arch)
	log_info "Detected platform: ${os}-${arch}"

	# Fetch release information
	local release_json
	release_json=$(fetch_release_info "$SPECIFIC_VERSION")

	# Extract version tag
	local version
	if command -v jq >/dev/null 2>&1; then
		version=$(echo "$release_json" | jq -r '.tag_name')
	else
		version=$(echo "$release_json" | grep -o '"tag_name":"[^"]*"' | head -n1 | sed 's/.*"tag_name":"\([^"]*\)".*/\1/')
	fi

	log_info "Installing version: $version"

	# Build asset name and find download URL
	local asset_name
	asset_name=$(build_asset_name "$os" "$arch" "$version")

	local download_url
	download_url=$(parse_asset_url "$release_json" "$asset_name")

	if [[ -z "$download_url" ]] || [[ "$download_url" == "null" ]]; then
		log_error "No binary available for ${os}-${arch} in release $version"
		log_error "Asset name looked for: $asset_name"
		log_error "Available assets:"
		if command -v jq >/dev/null 2>&1; then
			echo "$release_json" | jq -r '.assets[].name' >&2
		else
			echo "$release_json" | grep -o '"name":"[^"]*"' | sed 's/.*"name":"\([^"]*\)".*/  - \1/' >&2
		fi
		exit 1
	fi

	# Determine installation directory
	local install_dir
	install_dir=$(detect_install_dir)
	local binary_path="$install_dir/$BINARY_NAME"

	log_info "Installation directory: $install_dir"

	# Check for existing installation
	check_existing "$install_dir"

	# Create temp directory for download
	local temp_dir
	temp_dir=$(mktemp -d)
	trap "rm -rf $temp_dir" EXIT

	local archive_path="$temp_dir/$asset_name"

	# Download and extract
	download_file "$download_url" "$archive_path"
	verify_download "$archive_path"

	# Extract binary
	local extracted_binary="$temp_dir/$BINARY_NAME"
	extract_binary "$archive_path" "$temp_dir"

	# Create installation directory
	ensure_dir "$install_dir"

	# Install binary
	install_binary "$extracted_binary" "$binary_path"

	# Verify installation
	verify_installation "$binary_path"

	# Print summary
	print_summary "$install_dir" "$binary_path"
}

# Run main function
main "$@"
