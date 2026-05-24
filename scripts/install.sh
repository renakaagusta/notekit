#!/usr/bin/env sh
# NoteKit install script.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/renakaagusta/notekit/main/scripts/install.sh | sh
#
# Optional env:
#   NOTEKIT_VERSION  Pin a release tag (default: latest, e.g. "v0.4.0").
#   NOTEKIT_PREFIX   Install location (default: $HOME/.local/bin).
#                    Use /usr/local/bin (with sudo) for a system-wide install.
#
# Detects your platform, downloads the right precompiled binary from the
# GitHub release matching $NOTEKIT_VERSION, verifies the SHA256, drops it
# in $NOTEKIT_PREFIX/notekit, and prints next steps.

set -eu

REPO="renakaagusta/notekit"
VERSION="${NOTEKIT_VERSION:-}"
PREFIX="${NOTEKIT_PREFIX:-$HOME/.local/bin}"

# ─── helpers ──────────────────────────────────────────────────────────

err() {
  printf "\033[31m✗ %s\033[0m\n" "$*" >&2
  exit 1
}

ok() {
  printf "\033[32m✓\033[0m %s\n" "$*"
}

info() {
  printf "  %s\n" "$*"
}

need() {
  command -v "$1" >/dev/null 2>&1 || err "missing required tool: $1"
}

need curl
need uname

# Either sha256sum (Linux) or shasum (macOS) is fine.
if command -v sha256sum >/dev/null 2>&1; then
  SHA_CMD="sha256sum"
elif command -v shasum >/dev/null 2>&1; then
  SHA_CMD="shasum -a 256"
else
  err "need sha256sum or shasum to verify the download"
fi

# ─── platform detection ───────────────────────────────────────────────

OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
  Darwin) os_slug="darwin" ;;
  Linux) os_slug="linux" ;;
  MINGW*|MSYS*|CYGWIN*) os_slug="windows" ;;
  *) err "unsupported OS: $OS" ;;
esac

case "$ARCH" in
  arm64|aarch64) arch_slug="arm64" ;;
  x86_64|amd64) arch_slug="x64" ;;
  *) err "unsupported arch: $ARCH" ;;
esac

# Windows only ships x64 today.
if [ "$os_slug" = "windows" ] && [ "$arch_slug" != "x64" ]; then
  err "no Windows $arch_slug build yet; please file an issue"
fi

artifact="notekit-${os_slug}-${arch_slug}"
[ "$os_slug" = "windows" ] && artifact="${artifact}.exe"

# ─── resolve version ──────────────────────────────────────────────────

if [ -z "$VERSION" ]; then
  info "Resolving latest release…"
  VERSION="$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" | \
    grep -E '"tag_name"' | head -n1 | sed -E 's/.*"tag_name": *"([^"]+)".*/\1/')"
  [ -n "$VERSION" ] || err "could not determine latest release tag"
fi
ok "Using $VERSION"

# ─── download ─────────────────────────────────────────────────────────

base="https://github.com/${REPO}/releases/download/${VERSION}"
binary_url="${base}/${artifact}"
checksum_url="${binary_url}.sha256"

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

info "Downloading ${artifact}…"
curl -fsSL "$binary_url" -o "${tmpdir}/${artifact}" || err "download failed: $binary_url"
curl -fsSL "$checksum_url" -o "${tmpdir}/${artifact}.sha256" || err "checksum download failed"

info "Verifying SHA256…"
(cd "$tmpdir" && $SHA_CMD -c "${artifact}.sha256") >/dev/null || err "checksum mismatch"
ok "Verified"

# ─── install ──────────────────────────────────────────────────────────

mkdir -p "$PREFIX"
target_name="notekit"
[ "$os_slug" = "windows" ] && target_name="notekit.exe"
target="${PREFIX}/${target_name}"

mv "${tmpdir}/${artifact}" "$target"
chmod +x "$target"

# macOS quarantine bit — Gatekeeper otherwise refuses to run unsigned
# binaries downloaded by curl. Apple-notarized signing is on the roadmap;
# until then, stripping the bit yields a one-time "are you sure?" prompt
# on first launch, but lets the binary run.
if [ "$os_slug" = "darwin" ]; then
  xattr -d com.apple.quarantine "$target" 2>/dev/null || true
fi

ok "Installed notekit ${VERSION} → ${target}"

# ─── PATH hint ────────────────────────────────────────────────────────

case ":$PATH:" in
  *":${PREFIX}:"*) ;;
  *)
    printf "\n"
    printf "\033[33m!\033[0m %s is not on your PATH.\n" "$PREFIX"
    info "Add this to your shell rc (e.g. ~/.zshrc, ~/.bashrc):"
    printf "\n    export PATH=\"%s:\$PATH\"\n\n" "$PREFIX"
    ;;
esac

printf "\nNext:\n"
info "1. notekit auth login          # one-time auth"
info "2. notekit mcp doctor          # verify your setup"
info "3. notekit mcp install cursor  # or claude-code, codex, opencode, …"
