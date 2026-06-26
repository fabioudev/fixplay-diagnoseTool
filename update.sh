#!/usr/bin/env bash
set -euo pipefail

REPO="fabioudev/fixplay-diagnoseTool"
INSTALL_NAME="fixplay-diagnosetool"

echo "==> Neueste Version ermitteln..."
LATEST=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" \
  | grep '"tag_name"' | cut -d'"' -f4)
VERSION="${LATEST#v}"

echo "==> Neueste Version: ${LATEST}"

PKGFILE="${INSTALL_NAME}-${VERSION}-1-x86_64.pkg.tar.zst"
URL="https://github.com/${REPO}/releases/download/${LATEST}/${PKGFILE}"

echo "==> Herunterladen..."
curl -L --progress-bar -o "/tmp/${PKGFILE}" "${URL}"

echo "==> Installieren..."
sudo pacman -U --noconfirm "/tmp/${PKGFILE}"

echo "==> Icon-Cache aktualisieren..."
sudo gtk-update-icon-cache /usr/share/icons/hicolor -f 2>/dev/null || true

rm -f "/tmp/${PKGFILE}"

echo ""
echo "✓ ${INSTALL_NAME} wurde auf ${LATEST} aktualisiert."
