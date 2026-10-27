# CH341A — Hardware-Guide für NOR-Flash

Praxisleitfaden für den CH341A Mini Programmer im Einsatz mit dem
fixplay-diagnoseTool (PS5-NOR & weitere 25‑Series SPI‑Flash). Pinout,
Jumper, und vor allem die **5V/3,3V-Problematik**, die ungeübte Nutzer
sonst den Flash-Chip (oder das Target-Board) kostet.

> Für die reine Software-Seite (Lesen/Schreiben/Validieren) siehe die App
> und `README.md`. Hier geht es um das **Hardware-Handwerk** davor.

---

## 1. Worum es geht & Board-Varianten

Der CH341A (WCH) ist ein USB-Interface-Chip, der u.a. SPI spricht. Die
verbreitete „Mini Programmer"-Platine gibt es in zwei relevanten Varianten:

| Variante                                                           | Erkennen                                           | Socket             | 5V/3,3V                                                        |
| ------------------------------------------------------------------ | -------------------------------------------------- | ------------------ | -------------------------------------------------------------- |
| **Black board** (klassisch, mit IC-Sockel)                         | schwarze PCB, 16-Pin-ZIF-Sockel, zwei 7-Pin-Header | ja                 | **kritisch — siehe §3**                                        |
| **Blue board** (ohne Sockel)                                       | blaue PCB, Header zum Außenverdrahten              | nein               | korrekt gepuffert, per Jumper 3,3 V / 5 V wählbar              |
| **Color Light v1.5+** / neuere schwarze (ab ~2025, goldene Kanten) | Schalter K1, J1-Header                             | 16-Pin-Rastschloss | oft ab Werk 3,3 V auf den Datenleitungen — **trotzdem messen** |

Die folgenden Abschnitte beziehen sich primär auf das **black board**,
weil es am häufigsten verbaut wird und die bekannte Schwachstelle trägt.

---

## 2. ⚠️ Das 5V-Problem — bitte zuerst lesen

Das black board hat einen Spannungsregler (AMS1117), der dem **Sockel**
3,3 V liefert — aber der **CH341A-Chip selbst hängt an 5 V (USB)**. Die
Folge: die SPI-Signalpegel (CS, MISO, MOSI, CLK) werden mit **~5 V
getrieben** (gemessenes HIGH bis 4,5 V auf CLK), obwohl der Flash-Chip im
Sockel nur 3,3 V bekommt.

**3,3-V-NOR (wie die PS5-NOR, W25Q-/MX25L-Serie) verträgt das nicht
dauerhaft.** Der Chip mag einmal durchlaufen, stirbt aber früher oder
später an den Überpegeln. Beim **In-Circuit-Lesen** ist es noch schlimmer:
die 5 V speisen über die Schutzdioden/Cs den 3,3-V-Strang des Targets
rückwärts, der Ziel-MCU startet und treibt die Datenleitungen
gegenläufig → korrupter Dump, ggf. Totalschaden am Board.

**Conclusus:** Vor dem ersten PS5-NOR-Lesen am black board **zwingend**
den 3,3-V-Fix (§4) machen **oder** auf ein korrektes Board (blue / neuere
schwarze / RT809H / FT2232) ausweichen.

---

## 3. Vor dem Einsatz: Multimeter-Check

Nie blind vertrauen, auch nicht bei „neuen" Boards:

1. Programmer **ohne Chip** per USB anstecken.
2. Multimeter: GND (Chip-Pin 4 = ZIF 8) gegen **CS, CLK, MOSI, MISO**
   (ZIF 5, 10, 9, 6) messen (DC, Board im Leerlauf / eine Lesung
   anstoßen).
3. Steht dort **3,3 V** → Board i.O. für 3,3-V-Flash.
4. Steht dort **~5 V** → Fix (§4) nötig.

---

## 4. 3,3-V-Fix (black board)

Drei gängige Varianten, alle führen zum selben Ergebnis: CH341A-VCC (Pin 28) und V3 (Pin 9) werden vom 3,3-V-Regler statt von 5 V gespeist. Danach
liegen **alle** SPI-Leitungen bei 3,3 V.

### Variante A — Pin 28 heben (am verbreitetsten)

1. **Pin 28 (VCC)** des CH341A ca. 1 mm anheben: Lötkolben erhitzen,
   Klinge/Pick darunterschieben.
2. **Isolieren**: Kapton-/Isolierband zwischen angehobenen Pin und Pad,
   damit kein Kontakt zur 5-V-Leiterbahn mehr entsteht.
3. **Pin 28 → 3,3 V**: Drahtbrücke zum Ausgang des AMS1117 (mittlerer
   Pin) bzw. zu C4 (führt an Pin 9/V3).
4. **Pin 9 (V3) → 3,3 V**: laut Datenblatt muss V3 = VCC sein.
5. **Messen**: GND gegen jede Signalleitung → jetzt 3,3 V.

### Variante B — Leiterbahn trennen (ohne Pin-Heben)

5-V-Leiterbahn auf der **Platinenunterseite** zum Pin 28 mit Cutter
trennen, dann 3,3 V vom Regler per Bodge-Wire auf Pin 28 + Pin 9 führen.
Kein Risiko des Pin-Abreißens.

### Variante C — Spannungswahl-Schalter

Wie B, aber Pin 28 an einen **SPDT-Schalter**, der zwischen 5 V (C2) und
3,3 V (C1) umschaltet. Ermöglicht Betrieb für alte 5-V-Chips **und**
3,3-V-NOR. Empfohlen, wenn man beide Welten bedient.

> **Hinweis:** Bei Varianten A/B liefern die vormals 5-V-Header-Pins
> rund um den Sockel danach 3,3 V. Die VCC-Klemme ggf. mit Schrumpfschlauch
> isolieren, damit beim In-Circuit-Betrieb das Target nicht rückgespeist
> wird.

---

## 5. Pinout — 8-Pin SPI-NOR (25-Series)

Standard-Belegung eines 8-poligen SPI-NOR (W25Q, MX25L, EN25Q, …). Pin 1
ist am Chip meist mit Punkt/Kerbe markiert.

| Pin | Name  | Funktion                      | ZIF-Position |
| --: | ----- | ----------------------------- | ------------ |
|   1 | #CS   | Chip Select                   | 5            |
|   2 | DO    | MISO (Data Out)               | 6            |
|   3 | #WP   | Write Protect (Sockel: 3,3 V) | 7            |
|   4 | GND   | Masse                         | 8            |
|   5 | DI    | MOSI (Data In)                | 9            |
|   6 | CLK   | Serial Clock                  | 10           |
|   7 | #HOLD | Hold (Sockel: 3,3 V)          | 11           |
|   8 | VCC   | +3,3 V                        | 12           |

Im **16-Pin-ZIF-Sockel** des black board sitzt der 8-polige Chip in der
**hinteren Hälfte auf den ZIF-Positionen 5–12** (Aufdruck „25 SPI", fern
vom USB-Stecker), Pin 1 an der markierten Ecke (eckiges Pad). Die vordere
Hälfte (ZIF 1–4/13–16, Aufdruck „24 I²C") führt beim 8-Pin-Chip keine
Signale (bzw. ist für I²C-EEPROMs 24xx — SDA/SCL liegen auf ZIF 13/14).
Im Sockel liegen #WP/#HOLD fest auf 3,3 V (ZIF 7/11). **Vor dem Schließen
des ZIF-Hebels Lage prüfen** — falschrum ist ein Klassiker.

### 16-polige SPI-NOR

Pinbelegung entspricht der 8-Pin-Variante auf der unteren Reihe; obere
Reihe größtenteils NC. Datenblatt des konkreten Chips konsultieren
(PS5-NOR ist je nach Revision 8-Pin SOP oder WSON — ggf.
SOIC-Test-Clip statt Sockel).

---

## 6. Seiten-Header & Jumper

Das black board hat neben dem Sockel zwei 7-Pin-Header (je Pin 1 Richtung
USB-Stecker):

- **SPI-Header** (Seiten-Header beim „25XXX"-Aufdruck): Belegung
  **CLK · CS · MOSI · MISO · GND · 3V3 · 5V** (Pin 1 = CLK) → für
  externe Sockel/SOIC-Clip oder Boards ohne ZIF. Nur CH341A-CS0 ist
  herausgeführt — CS1/CS2 sind nicht verbunden.
- **UART/Mode-Header** (Aufdruck „1 2 3 TX RX GND 5V"): **Pins 1 und 2
  müssen gejumpert werden**, um den **ACT#-Pin auf GND zu ziehen** — nur
  dann meldet sich der CH341A als Programmer. **Ohne diesen Jumper**
  taucht er als normaler USB-Seriell-Wandler auf und
  `flashrom -p ch341a_spi` findet nichts. Jumper auf **2↔3** = USB-TTL-
  Seriell-Modus (TXD/RXD/GND/5V ab Pin 4).

### Jumper-Übersicht

| Jumper                                   | Funktion                | Einstellung                                     |
| ---------------------------------------- | ----------------------- | ----------------------------------------------- |
| Mode-Jumper (UART-Header 1↔2)            | Programmer-Modus (ACT#) | **gesetzt** — 2↔3 = nur USB-Seriell             |
| Voltage-Jumper (nur blue board, 2× blau) | Sockel-VCC              | **3,3 V** (grün) — 5 V nur für alte 5-V-EEPROMs |
| K1-Schalter (Color Light v1.5+)          | VCC-Level               | **3,3 V** für PS5-NOR                           |

> Die Jumper-Belegung kann je nach Revision abweichen. Aufdruck auf der
> PCB geht vor. Wenn ein Board **keinen** Spannungswahl-Jumper hat, ist
> das ein starkes Indiz für das §2-Problem.

---

## 7. In-Circuit-Lesen — Risiken

Beim Lesen **auf dem Target-Board** (Chip bleibt eingelötet, SOIC-Clip)
gelten unabhängig vom 3,3-V-Fix zusätzliche Regeln:

- Der Programmer speist den Chip mit VCC → damit kann der Ziel-MCU
  hochlaufen und die Leitungen treiben → **korrupter Dump**.
- Abhilfe: **Target komplett stromlos**, und ggf. den Chip **isolieren**
  (Datenleitung/Cs/CS am Target trennen oder Chip-Pin anheben), damit nur
  der Programmer das Sagen hat.
- **Board-seitiges WP#/HOLD#** beachten: manche Targets ziehen die auf
  GND oder steuern sie — ggf. während des Lesens auf 3,3 V legen.
- VCC-Klemme/Clip isolieren, damit der Programmer nicht das ganze Target
  versorgt (Backfeed-Schutz).

Für PS5-NOR gilt erfahrungsgemäß: **lieber Chip auslöten und im Sockel
lesen** als In-Circuit, wenn es um valide Dumps geht.

---

## 8. flashrom-Befehle (CH341A)

Das diagnoseTool nutzt `flashrom -p ch341a_spi` intern. Für die
Kommandozeile:

```bash
flashrom -p ch341a_spi                      # Programmer + Chip erkennen
flashrom -p ch341a_spi -r dump.bin          # Lesen
flashrom -p ch341a_spi -w repaired.bin      # Schreiben
flashrom -p ch341a_spi -v repaired.bin      # Verifizieren
```

Linux: Device-Permissions via udev, sonst läuft `flashrom` nur als root:

```
# /etc/udev/rules.d/99-ch341a.rules
SUBSYSTEM=="usb", ATTRS{idVendor}=="1a86", ATTRS{idProduct}=="5512", MODE="0666"
```

Windows: Für den Programmer-Modus braucht der CH341A den
**CH341PAR**-Treiber (nicht `CH341SER`, das ist nur der Seriell-Modus).
flashrom spricht das Gerät aber direkt via libusb/WinUSB — aktuelle
flashrom-Builds (wie die im Tool gebündelte Version) regeln das selbst.

> flashrom **stützt über den CH341A nur SPI-Flash**, **keine** I²C-EEPROMs
> (24xx). Für I²C braucht es andere Tools (SNANDer, ch341prog, IMSProg).

---

## 9. Checkliste vor dem ersten PS5-NOR-Lesen

- [ ] Board-Variante bekannt (black / blue / Color Light)
- [ ] Mit Multimeter gemessen: Datenleitungen = 3,3 V (§3)
- [ ] Bei 5 V: Fix gemacht (§4) und neu gemessen
- [ ] ACT#-Jumper gesetzt (Programmer-Modus, §6)
- [ ] SPI/I2C-Jumper auf SPI
- [ ] Chip richtig im Sockel/Clip (Pin 1, §5) — Lage vor ZIF-Schluss prüfen
- [ ] flashrom erkennt Programmer + Chip (`-p ch341a_spi`)
- [ ] In-Circuit: Target stromlos, ggf. Chip isoliert (§7)
- [ ] Ersten Dump lesen, **zweiten** lesen, **vergleichen** — identisch?
      (sonst Kontakt- oder Pegelproblem; niemals auf einen einzelnen
      Dump vertrauen)

---

## Quellen

- [flashrom — CH341A/B Dokumentation](https://www.flashrom.org/supported_hw/supported_prog/ch341ab.html) — Pinout-Map, 3,3-V-Fix, Befehle
- [OneTransistor — CH341A Mini Programmer Schematic](https://www.onetransistor.eu/2017/08/ch341a-mini-programmer-schematic.html) — Sockel/Header-Pinout, 5V-Problem, fehlender C an RSTI
- [OpenIPC Wiki — CH341A Voltage Fix](https://github.com/OpenIPC/wiki/blob/master/en/hardware-programmer-ch341a-voltage-fix.md) — Trace-Cut-Methode, udev-Regel
- [Chuck Nemeth — 3.3V CH341A Mod](https://wiki.chucknemeth.com/usb-devices/ch341a/3v-ch341a-mod) — Pin-28-Heben Schritt für Schritt
- [Voltlog #318 — CH341A 3.3V Fix](https://www.voltlog.com/ch341a-programmer-3-3v-fix-voltlog-318/) — Video-Walkthrough
- [Johannes' Blog — 3.3V fix without lifting a pin](https://wej.k.vu/electronics/ch341a-mini-programmer-fix/) — Leiterbahn-Trenn-Methode
- [Maurycy's Blog — Fixing the CH341A/B flash reader](http://maurycyz.com/projects/ch341a/) — Spannungswahl-Schalter-Variante
- [CH341A Programmer Instructions (Color Light v1.5–v1.7, PDF)](https://m.media-amazon.com/images/I/B1cML5t-HGL.pdf) — J1-Header-Tabelle, K1-Schalter, Adapter-Boards
- [matzes-hardware/ch341a-miniprogrammer (GitHub)](https://github.com/matzes-hardware/ch341a-miniprogrammer) — abgeleitetes Schaltplan-PDF, Hardware-Patches
- [stahir/CH341-Store (GitHub)](https://github.com/stahir/CH341-Store) — Datasheet (CH341_EN.pdf), Treiber-Sammlung
