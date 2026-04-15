#!/bin/bash
#
# Pinchy Installer
# One-liner installation script for Pinchy
#
# Usage: curl -fsSL https://raw.githubusercontent.com/dominic-codespoti/pinchy/main/install.sh | bash
#

set -euo pipefail

REPO="dominic-codespoti/pinchy"
BINARY_NAME="pinchy"
INSTALL_DIR="${INSTALL_DIR:-$HOME/.local/bin}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
info() {
	echo -e "${BLUE}[INFO]${NC} $1"
}

success() {
	echo -e "${GREEN}[SUCCESS]${NC} $1"
}

warn() {
	echo -e "${YELLOW}[WARN]${NC} $1"
}

error() {
	echo -e "${RED}[ERROR]${NC} $1" >&2
}

# Detect architecture
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
	armv7l | armhf)
		error "ARMv7 is not supported. Please build from source."
		exit 1
		;;
	*)
		error "Unsupported architecture: $arch"
		exit 1
		;;
	esac
}

# Detect OS
detect_os() {
	local os
	os=$(uname -s)
	case "$os" in
	Linux)
		echo "linux"
		;;
	Darwin)
		echo "macos"
		;;
	*)
		error "Unsupported operating system: $os"
		exit 1
		;;
	esac
}

# Get the latest release version unless a specific version was requested
get_latest_version() {
	if [ -n "${VERSION:-}" ]; then
		echo "${VERSION#v}"
		return 0
	fi

	local version
	version=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" | grep '"tag_name":' | sed -E 's/.*"tag_name": "v?([^"]+)".*/\1/')
	echo "$version"
}

# Download binary and checksum
download_binary() {
	local platform="$1"
	local version="$2"
	local binary_name="${BINARY_NAME}-${platform}"
	local checksum_name="${binary_name}.sha256"
	local download_url="https://github.com/${REPO}/releases/download/v${version}"
	local temp_dir
	temp_dir=$(mktemp -d)

	info "Downloading ${binary_name} (v${version})..."

	# Download binary
	if ! curl -fsSL "${download_url}/${binary_name}" -o "${temp_dir}/${binary_name}"; then
		error "Failed to download binary from ${download_url}/${binary_name}"
		rm -rf "$temp_dir"
		exit 1
	fi

	# Download checksum
	if ! curl -fsSL "${download_url}/${checksum_name}" -o "${temp_dir}/${checksum_name}"; then
		error "Failed to download checksum from ${download_url}/${checksum_name}"
		rm -rf "$temp_dir"
		exit 1
	fi

	echo "$temp_dir"
}

# Verify checksum
verify_checksum() {
	local temp_dir="$1"
	local binary_name="$2"

	info "Verifying checksum..."

	cd "$temp_dir"
	if command -v sha256sum &>/dev/null; then
		if ! sha256sum -c "${binary_name}.sha256" >/dev/null 2>&1; then
			error "Checksum verification failed!"
			exit 1
		fi
	elif command -v shasum &>/dev/null; then
		if ! shasum -a 256 -c "${binary_name}.sha256" >/dev/null 2>&1; then
			error "Checksum verification failed!"
			exit 1
		fi
	else
		warn "Neither sha256sum nor shasum found. Skipping checksum verification."
	fi

	success "Checksum verified"
}

# Install binary
install_binary() {
	local temp_dir="$1"
	local binary_name="$2"

	# Create install directory if it doesn't exist
	if [ ! -d "$INSTALL_DIR" ]; then
		info "Creating installation directory: $INSTALL_DIR"
		mkdir -p "$INSTALL_DIR"
	fi

	# Check if we need sudo
	local use_sudo=""
	if [ ! -w "$INSTALL_DIR" ]; then
		use_sudo="sudo"
		info "Using sudo to install to $INSTALL_DIR"
	fi

	# Move binary to install directory
	info "Installing ${BINARY_NAME} to ${INSTALL_DIR}..."
	$use_sudo cp "${temp_dir}/${binary_name}" "${INSTALL_DIR}/${BINARY_NAME}"
	$use_sudo chmod +x "${INSTALL_DIR}/${BINARY_NAME}"

	success "Installed ${BINARY_NAME} to ${INSTALL_DIR}/${BINARY_NAME}"
}

# Add to PATH if needed
ensure_in_path() {
	if [[ ":$PATH:" != *":$INSTALL_DIR:"* ]]; then
		warn "$INSTALL_DIR is not in your PATH"
		info "Adding $INSTALL_DIR to PATH..."

		# Detect shell
		local shell_rc=""
		if [ -n "$ZSH_VERSION" ] || [ -f "$HOME/.zshrc" ]; then
			shell_rc="$HOME/.zshrc"
		elif [ -n "$BASH_VERSION" ] || [ -f "$HOME/.bashrc" ]; then
			shell_rc="$HOME/.bashrc"
		fi

		if [ -n "$shell_rc" ]; then
			echo "export PATH=\"\$PATH:$INSTALL_DIR\"" >>"$shell_rc"
			success "Added $INSTALL_DIR to PATH in $shell_rc"
			info "Please run 'source $shell_rc' or restart your shell to use $BINARY_NAME"
		else
			warn "Could not detect shell configuration file. Please manually add $INSTALL_DIR to your PATH"
		fi
	fi
}

# Main installation function
main() {
	echo ""
	echo "╔══════════════════════════════════════════════════╗"
	echo "║           Pinchy Installer                       ║"
	echo "║   Lightweight Rust agent platform               ║"
	echo "╚══════════════════════════════════════════════════╝"
	echo ""

	# Check dependencies
	if ! command -v curl &>/dev/null; then
		error "curl is required but not installed. Please install curl."
		exit 1
	fi

	# Detect platform
	local arch
	arch=$(detect_arch)
	local os
	os=$(detect_os)
	local platform="${os}-${arch}"

	info "Detected platform: $platform"

	# Get latest version
	local version
	version=$(get_latest_version)
	if [ -z "$version" ]; then
		error "Could not determine latest version"
		exit 1
	fi
	info "Latest version: v$version"

	# Download
	local temp_dir
	temp_dir=$(download_binary "$platform" "$version")
	local binary_name="${BINARY_NAME}-${platform}"

	# Verify
	verify_checksum "$temp_dir" "$binary_name"

	# Install
	install_binary "$temp_dir" "$binary_name"

	local binary_path="${INSTALL_DIR}/${BINARY_NAME}"

	# Check PATH
	ensure_in_path

	# Test installation
	if "$binary_path" --version &>/dev/null; then
		local installed_version
		installed_version=$("$binary_path" --version 2>/dev/null || echo "unknown")
		success "Installation complete!"
		info "Version: $installed_version"
		echo ""
		echo "Quick start:"
		echo "  pinchy --help        # Show help"
		echo "  pinchy onboard       # Interactive setup"
		echo "  pinchy               # Start the daemon"
		echo ""
	else
		warn "Installation complete, but $BINARY_NAME is not in your current PATH"
		warn "You may need to restart your shell or run: source ~/.bashrc (or ~/.zshrc)"
	fi

	# Cleanup
	rm -rf "$temp_dir"
}

# Handle script arguments
while [[ $# -gt 0 ]]; do
	case $1 in
	-d | --dir)
		INSTALL_DIR="$2"
		shift 2
		;;
	-v | --version)
		VERSION="$2"
		shift 2
		;;
	-h | --help)
		echo "Pinchy Installer"
		echo ""
		echo "Usage: curl -fsSL https://raw.githubusercontent.com/${REPO}/main/install.sh | bash"
		echo ""
		echo "Options:"
		echo "  -d, --dir DIR        Installation directory (default: ~/.local/bin)"
		echo "  -v, --version VER    Install a specific release version"
		echo ""
		echo "Environment variables:"
		echo "  INSTALL_DIR          Installation directory override"
		echo ""
		exit 0
		;;
	*)
		error "Unknown option: $1"
		exit 1
		;;
	esac
done

main
