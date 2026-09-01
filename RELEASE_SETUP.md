# ✅ Release-Automatisierung Komplett Fertig

Dein `fixplay-diagnoseTool` macht jetzt alles **vollständig automatisch** beim Release:

## 🚀 Was beim Release automatisch passiert

Du machst nur **EINEN Git-Tag**:

```bash
git tag v0.1.0
git push origin v0.1.0
```

Dann macht GitHub Actions automatisch:

1. ✅ **Baut alle Artefakte**
   - Linux: AppImage, .deb, .rpm (+ `.sig` für den Updater)
   - Windows: .msi, .exe (+ `.sig` für den Updater)

2. ✅ **Erstellt GitHub Release**
   - Alle Dateien hochgeladen
   - `latest.json` (Updater-Manifest) generiert + hochgeladen
   - SHA256 Checksums generiert

3. ✅ **Updated AUR Pakete**
   - `fixplay-diagnosetool-bin` (AppImage) **und** `fixplay-diagnosetool` (Source-Build)
   - `pkgver`/`pkgrel` aktualisiert, `.SRCINFO` via `makepkg --printsrcinfo` regeneriert
   - **Pushes zu AUR** (wenn SSH-Key konfiguriert) — beim ersten Release legt AUR das Repo automatisch an

---

## 📋 Was du jetzt tun musst (einmalig)

### Schritt 1: SSH-Key für AUR erstellen

Folge genau dieser Anleitung: **`docs/AUR_SSH_SETUP.md`**

Kurz:

```bash
# 1. SSH-Key erstellen
ssh-keygen -t ed25519 -f ~/.ssh/aur_deploy -N ""

# 2. Public Key anzeigen und zu AUR hinzufügen
cat ~/.ssh/aur_deploy.pub
# ^ kopieren und zu https://aur.archlinux.org/account/ hinzufügen

# 3. Private Key zu GitHub Secret hinzufügen
cat ~/.ssh/aur_deploy
# ^ kopieren und als `AUR_SSH_PRIVATE_KEY` Secret hinzufügen
# https://github.com/fabioudev/fixplay-diagnoseTool/settings/secrets/actions
```

### Schritt 2: AUR Repository + GitHub-Environment

1. Das AUR-Paket **nicht** manuell anlegen — der Workflow pusht beim ersten
   Release automatisch an `fixplay-diagnosetool-bin` und `fixplay-diagnosetool`,
   und AUR legt die Repos beim ersten Push an.
2. Lege in GitHub ein **Environment** namens `aur-release` an:
   https://github.com/fabioudev/fixplay-diagnoseTool/settings/environments
   (kann leer bleiben; dient nur als Gate für den AUR-Job. Später lassen sich
   hier Required Reviewers hinterlegen.)

### Schritt 3: Tauri Signing-Key (für In-App-Updates)

Damit die App Updates selbst verifizieren + installieren kann, müssen die
Bundles signiert sein. Ein Schlüsselpaar liegt lokal in
`.updater-keys/` (gitignored, siehe unten). Lege die Secrets an:

1. **Private Key** — Inhalt von `.updater-keys/fp.key` als GitHub-Secret
   `TAURI_SIGNING_PRIVATE_KEY`:
   https://github.com/fabioudev/fixplay-diagnoseTool/settings/secrets/actions
2. **Passwort** — `fixplay-diagnoseTool-updater-2026` als Secret
   `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.

Der zugehörige Public-Key ist bereits in `src-tauri/tauri.conf.json`
(`plugins.updater.pubkey`) eingetragen. **Verlier nicht den Private-Key oder
das Passwort** — ohne sie lassen sich keine Updates mehr signieren.

> Lieber selbst generieren? `npx @tauri-apps/cli signer generate -w .updater-keys/fp.key`
> und den ausgegebenen Public-Key in `tauri.conf.json` ersetzen.

---

## 🔄 Jetzt beim Release

Nach der einmaligen Einrichtung:

```bash
# 1. Tag pushen
git tag v0.1.0
git push origin v0.1.0

# 2. GH Actions läuft automatisch und pusht zu:
# - GitHub Releases (AppImage, .deb, .rpm, .msi, .exe)
# - AUR Package (PKGBUILD, .SRCINFO)
```

**Fertig!** Alle Releases sind dann gleichzeitig live.

---

## 💡 Was passiert wenn Secrets fehlen?

**`AUR_SSH_PRIVATE_KEY` nicht gesetzt:**

- GitHub Actions baut trotzdem alles + published GitHub Release
- AUR wird nicht auto-gepushed → der `update-aur`-Job zeigt einen Hinweis
- Du kannst AUR manuell updaten (PKGBUILD in `packaging/aur/` + `makepkg --printsrcinfo`)

**`TAURI_SIGNING_PRIVATE_KEY` nicht gesetzt:**

- Bundles werden normal gebaut, aber **ohne `.sig`-Dateien**
- `latest.json` enthält dann keine Plattform-Einträge → die In-App-Update-Prüfung
  findet kein Update. AUR-Updates funktionieren weiterhin (via `yay -Syu`),
  nur der Self-Updater (Windows / standalone AppImage) ist inaktiv.

---

## 🔍 Debugging

**Workflow-Status ansehen:**

1. Gehe zu: https://github.com/fabioudev/fixplay-diagnoseTool/actions
2. Wähle das Release-Workflow
3. Klicke auf den Build
4. Siehe "update-aur" Job für Details

**SSH-Connection testen (lokal):**

```bash
ssh -i ~/.ssh/aur_deploy aur@aur.archlinux.org
# Sollte antworten: "Hi <username>, you successfully authenticated,..."
```

---

## 📚 Referenzen

- **SSH-Setup**: `docs/AUR_SSH_SETUP.md`
- **AUR Publishing**: `packaging/aur/PUBLISHING.md`
- **AUR Quickstart**: `packaging/aur/QUICKSTART.md`
- **Workflow**: `.github/workflows/release.yml`

---

## ✅ Checkliste

- [ ] SSH-Key für AUR erstellt (`ssh-keygen`)
- [ ] Public Key zu AUR hinzugefügt
- [ ] `aur-release` Environment in GitHub angelegt
- [ ] `AUR_SSH_PRIVATE_KEY` Secret zu GitHub hinzugefügt
- [ ] `TAURI_SIGNING_PRIVATE_KEY` Secret gesetzt (Inhalt `.updater-keys/fp.key`)
- [ ] `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` Secret gesetzt
- [ ] Workflow getestet mit Test-Tag (z.B. `v0.1.0-test`)

Nach allen Häkchen: **Alle zukünftigen Releases sind vollständig automatisiert!** 🚀

---

## Fragen?

Wenn etwas unklar ist, lese: `docs/AUR_SSH_SETUP.md` oder sag Bescheid!
