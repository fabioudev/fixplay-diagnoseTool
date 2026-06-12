# AUR SSH Key Setup für GitHub Actions

Diese Anleitung zeigt, wie du GitHub Actions erlaubst, automatisch zu AUR zu pushen.

## Schritt 1: Lokal SSH-Key für AUR erstellen

```bash
# Erstelle einen SSH-Key speziell für AUR (leave passphrase empty)
ssh-keygen -t ed25519 -f ~/.ssh/aur_deploy -N ""

# Zeige den Public Key (Kopiere diesen!)
cat ~/.ssh/aur_deploy.pub
```

## Schritt 2: Public Key zu AUR hinzufügen

1. Gehe zu https://aur.archlinux.org/account/
2. Login mit deinem AUR-Account
3. Unter "SSH Public Key (Upload)":
   - Paste den kompletten Output aus `cat ~/.ssh/aur_deploy.pub`
   - "Update" klicken

## Schritt 3: Private Key zu GitHub Secrets hinzufügen

```bash
# Zeige den Private Key (Kopiere diesen!)
cat ~/.ssh/aur_deploy
```

1. Gehe zu: https://github.com/fabioudev/fixplay-diagnoseTool/settings/secrets/actions
2. "New repository secret" klicken
3. Name: `AUR_SSH_PRIVATE_KEY`
4. Value: Komplett paste den Output aus `cat ~/.ssh/aur_deploy`
5. "Add secret" klicken

## Schritt 4: (Optional) SSH Host Key speichern

Falls GitHub das AUR-Host-Key-Verify meckert, benötige ich noch:

```bash
ssh-keyscan -t rsa aur.archlinux.org
```

Das Ergebnis (nur die Zeile mit `aur.archlinux.org`) speichere ich ggf. auch als Secret.

---

## Troubleshooting

**Test der SSH-Konfiguration (lokal)**:
```bash
ssh -i ~/.ssh/aur_deploy aur@aur.archlinux.org
```

Sollte antworten:
```
Hi <your-username>, you successfully authenticated,...
```

Falls das fehlschlägt, überprüfe:
- Public Key wurde korrekt zu AUR hinzugefügt
- Private Key wurden korrekt kopiert
- Passphrase ist leer

