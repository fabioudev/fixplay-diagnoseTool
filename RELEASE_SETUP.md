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
   - Linux: AppImage, .deb, .rpm
   - Windows: .msi, .exe

2. ✅ **Erstellt GitHub Release**
   - Alle Dateien hochgeladen
   - SHA256 Checksums generiert

3. ✅ **Updated AUR Paket**
   - PKGBUILD aktualisiert
   - .SRCINFO regeneriert
   - **Pushes zu AUR** (wenn SSH-Key konfiguriert)

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

### Schritt 2: AUR Repository erstellen

Falls noch nicht geschehen:
1. Gehe zu https://aur.archlinux.org/account/
2. "New Package" klicken
3. Name: `fixplay-diagnosetool-bin`
4. "Create" klicken

Das war's! 🎉

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

## 💡 Was passiert wenn SSH-Key fehlt?

Wenn du den `AUR_SSH_PRIVATE_KEY` Secret **NICHT** hinzufügst:
- GitHub Actions baut trotzdem alles
- AUR wird nicht auto-gepushed
- Der Workflow zeigt dir eine Warnung
- Du kannst AUR manuell updaten

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
- [ ] AUR Package erstellt (oder sag Bescheid, ich mache das)
- [ ] `AUR_SSH_PRIVATE_KEY` Secret zu GitHub hinzugefügt
- [ ] Workflow getestet mit Test-Tag (z.B. `v0.1.0-test`)

Nach allen Häkchen: **Alle zukünftigen Releases sind vollständig automatisiert!** 🚀

---

## Fragen?

Wenn etwas unklar ist, lese: `docs/AUR_SSH_SETUP.md` oder sag Bescheid!

