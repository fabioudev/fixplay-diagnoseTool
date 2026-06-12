# Publishing to AUR

This guide explains how to publish `fixplay-diagnosetool-bin` to the Arch User Repository (AUR).

## Prerequisites

1. **AUR Account**: Create an account at https://aur.archlinux.org
2. **SSH Key**: Generate an SSH key and add it to your AUR account:
   - Follow: https://aur.archlinux.org/account/

3. **Required Packages**:
   ```bash
   sudo pacman -S git pacman-contrib
   ```

## Step 1: Create the AUR Repository

On the AUR web interface:
1. Go to https://aur.archlinux.org/account/
2. Click "New Package"
3. Enter package name: `fixplay-diagnosetool-bin`
4. Click "Create"

## Step 2: Clone the AUR Repository

```bash
git clone ssh://aur@aur.archlinux.org/fixplay-diagnosetool-bin.git
cd fixplay-diagnosetool-bin
```

## Step 3: Copy Package Files

From your `fixplay-diagnoseTool` repo:

```bash
cp packaging/aur/fixplay-diagnosetool-bin/{PKGBUILD,.SRCINFO} /path/to/fixplay-diagnosetool-bin/
```

## Step 4: Test the Package Locally

```bash
cd /path/to/fixplay-diagnosetool-bin
makepkg -si
```

This will:
- Download the AppImage from GitHub
- Install it to `/opt/fixplay-diagnosetool-bin`
- Create menu entries and wrapper scripts
- Test the installation

## Step 5: Commit and Push

```bash
cd /path/to/fixplay-diagnosetool-bin
git add PKGBUILD .SRCINFO
git commit -m "Initial commit: fixplay-diagnosetool-bin 0.1.0"
git push
```

## Keeping AUR Updated

After each GitHub release, update the package:

```bash
# In your fixplay-diagnoseTool repo
packaging/aur/update-aur.sh

# This will:
# 1. Fetch the latest GitHub release
# 2. Update PKGBUILD with new version
# 3. Regenerate .SRCINFO
```

Then push to AUR:

```bash
cd /path/to/fixplay-diagnosetool-bin-aur-clone
git add PKGBUILD .SRCINFO
git commit -m "Update to <version>"
git push
```

## Troubleshooting

### SSH Connection Fails

Make sure your SSH key is properly configured:

```bash
ssh -T aur@aur.archlinux.org
# Should respond: "Hi <username>, you successfully authenticated..."
```

### makepkg fails

Check the build output. Common issues:

- **Network error**: The AppImage download failed. Check your internet connection.
- **Missing libfuse2**: Install `libfuse2` on your system (runtime dependency check).
- **Permission denied**: Make sure the script has execute permissions.

### PKGBUILD syntax error

Validate your PKGBUILD:

```bash
bash -n PKGBUILD
```

## More Information

- AUR Submission Guidelines: https://wiki.archlinux.org/title/Arch_User_Repository#Submitting_packages
- PKGBUILD Reference: https://wiki.archlinux.org/title/PKGBUILD
- AUR Best Practices: https://wiki.archlinux.org/title/AUR_submission_guidelines

## Notes for Maintainers

- DES Signing: If you want to sign packages, add your GPG key to the AUR account.
- Notifications: Enable email notifications on your AUR account to be notified of comments.
- Co-maintainers: You can add co-maintainers via the AUR web interface if needed.

