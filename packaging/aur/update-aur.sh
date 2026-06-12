#!/usr/bin/env bash
# update-aur.sh - Sync AUR package with latest GitHub release

set -euo pipefail

REPO="fabioudev/fixplay-diagnoseTool"
PACKAGE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/fixplay-diagnosetool-bin"
PKGBUILD="$PACKAGE_DIR/PKGBUILD"

echo "Fetching latest release from $REPO..."
LATEST=$(curl -s "https://api.github.com/repos/$REPO/releases/latest" | grep -oP '"tag_name": "\K[^"]+')

if [ -z "$LATEST" ]; then
    echo "Error: Could not fetch latest release tag"
    exit 1
fi

VERSION="${LATEST#v}"  # Remove 'v' prefix if present
echo "Latest version: $VERSION"

# Update PKGBUILD
echo "Updating PKGBUILD..."
sed -i "s/^pkgver=.*/pkgver=$VERSION/" "$PKGBUILD"
sed -i "s/^pkgrel=.*/pkgrel=1/" "$PKGBUILD"

# Regenerate .SRCINFO
echo "Regenerating .SRCINFO..."
cd "$PACKAGE_DIR"
if command -v mksrcinfo &> /dev/null; then
    mksrcinfo
    echo ".SRCINFO regenerated"
else
    echo "Warning: mksrcinfo not found. Please run 'mksrcinfo' manually or install 'pacman-contrib'"
fi

echo "Done! Updated to version $VERSION"
echo ""
echo "Next steps:"
echo "  1. Review changes: git diff $PKGBUILD"
echo "  2. Test build: cd $PACKAGE_DIR && makepkg -si"
echo "  3. Commit: git add $PACKAGE_DIR && git commit -m 'Update to $VERSION'"
echo "  4. Push to AUR: git push"

