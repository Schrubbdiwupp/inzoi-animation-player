# inZOI Animation Player

**English** · [Deutsch](#deutsch)

A UI mod for **inZOI** (toggle with **F9**): play any animation or pose on any Zoi, play your **AI Emote motions**, freeze time for photos and bend single bones in the **Pose Editor**. English/German UI.

## Features

- **Animations tab** – search all game and mod animations (categories, full list, favourites), loop (keeps running with the window closed, one loop per Zoi), speed 0.25–3x, random toggle (with loop: random playlist), stop / stop all, freeze / pause at the end for photos, progress bar with length.
- **AI Motions tab** – plays the AI motions you created in the game (*click a Zoi > AI Emote*), with loop, stop, progress bar and custom slot names.
- **Pose Editor** – bend single bones (additive or replace), save and load your own poses.
  *Note (game limitation, tested Oct 2026):* the game's experimental pose command visibly works on the **head** (tilt, turn, size). On most Zois arms, hands, legs and torso don't follow – at most the elbow/wrist twists a little. Users report that it does work on some Zois; we suspect clothing (sleeves) and are looking into it. Arm poses (e.g. a handshake) are more reliable as a custom animation.
- **Target Zoi** – your Zoi, the Zoi in front of the camera, Zois nearby or your household.

## Install

Download the ZIP from [Releases](../../releases) (or Nexus / CurseForge), copy the folder `Animation_Player_4B649335` to `Documents\inZOI\Mods\`, enable *Animation_Player* in the in-game mod manager and press **F9**.

The release ZIP contains the packaged mod. The folder [`mod/`](mod/Animation_Player_4B649335) in this repository is the readable source of the UI (`ui/animation_player/*.js`) plus the example files.

## AI motions: titles and lengths

The game loads at most **30** AI motions from `Documents\inZOI\AIGenerated\MyAIMotions` into 30 slots (sorted by folder name). A UI mod cannot read that folder, so titles and lengths come from a small script:

[`KI-Bewegungen_einlesen.bat`](mod/Animation_Player_4B649335/Beispiele_Examples/KI-Bewegungen_einlesen.bat) reads `meta.json` (title) and `motion.dat` (frame count, 30 fps) of every motion and writes `saved\ai_motions.cfg` for the player. Double-click it, then click *Reload* in the *AI Motions* tab. It only reads your AI motion folder and writes this one file – you can read the whole script in the .bat (it runs PowerShell).

Without the file the tab simply shows *Slot 1* to *Slot 30*. AI motions always play in real time – speed, freeze and game pause don't affect them.

Full manual: [README.txt](mod/Animation_Player_4B649335/Beispiele_Examples/README.txt)

## Changelog

**2.5.3** (Oct 30, 2026)
- Random loop no longer gets stuck on animations with their own loop section (e.g. `SmartPhone_Check`, `Multi_SmartPhone_Check`, `Click_SmartPhone_Light`): after one full length it moves on to the next animation. On their own they still loop as before.
- Fewer spins between animations in a loop: if an animation has an End section (the way back to the idle pose), the next one now starts right before it instead of at the very end.
- Loop timing for animations with a loop section now uses the game's playback rate (the measured rate was wrong there).
- Manual: new troubleshooting entries (stuck random loop, teens and "Animation has no valid montage").

**2.5.2** – Freeze uses the real game pause, Pose tab note and Head group first.  
**2.5.1** – "+" in named lists works (all ages, no strike-through).  
**2.5** – Precise loop timer, teen check for fixed lists, named lists (`saved/lists/*.cfg`).

## License

[MIT](LICENSE)

---

## Deutsch

Ein UI-Mod für **inZOI** (Ein-/Ausblenden mit **F9**): beliebige Animationen und Posen auf jedem Zoi abspielen, deine **KI-Emote-Bewegungen** abspielen, die Zeit für Fotos einfrieren und einzelne Knochen im **Pose-Editor** verbiegen. Oberfläche Deutsch/Englisch.

### Funktionen

- **Reiter Animationen** – alle Spiel- und Mod-Animationen durchsuchen (Kategorien, Gesamtliste, Favoriten), Loop (läuft auch bei geschlossenem Fenster, eigener Loop pro Zoi), Tempo 0,25–3x, Zufall-Schalter (mit Loop: zufällige Abfolge), Stopp / Alle stoppen, Einfrieren / am Ende anhalten für Fotos, Fortschrittsbalken mit Länge.
- **Reiter KI-Bewegungen** – spielt die KI-Bewegungen ab, die du im Spiel erstellt hast (*Zoi anklicken > KI-Emote*), mit Loop, Stopp, Fortschrittsbalken und eigenen Slot-Namen.
- **Pose-Editor** – einzelne Knochen verbiegen (additiv oder ersetzen), eigene Posen speichern und laden.
  *Hinweis (Grenze des Spiels, getestet Okt. 2026):* Der experimentelle Posen-Befehl des Spiels wirkt sichtbar am **Kopf** (Neigen, Drehen, Größe). Bei den meisten Zois folgen Arme, Hände, Beine und Oberkörper nicht – höchstens Ellbogen/Handgelenk verdrehen sich leicht. Laut Nutzern klappt es bei manchen Zois doch; wir vermuten die Kleidung (Ärmel) und prüfen das. Arm-Posen (z. B. Händeschütteln) sind als eigene Animation zuverlässiger.
- **Ziel-Zoi** – dein Zoi, der Zoi vor der Kamera, Zois in der Nähe oder dein Haushalt.

### Installation

ZIP unter [Releases](../../releases) (oder bei Nexus / CurseForge) herunterladen, den Ordner `Animation_Player_4B649335` nach `Documents\inZOI\Mods\` kopieren, im Mod-Manager des Spiels *Animation_Player* aktivieren und **F9** drücken.

### KI-Bewegungen: Titel und Längen

Das Spiel lädt höchstens **30** KI-Bewegungen aus `Documents\inZOI\AIGenerated\MyAIMotions` in 30 Slots (sortiert nach Ordnername). Ein UI-Mod kann diesen Ordner nicht lesen, deshalb liefert ein kleines Skript Titel und Längen:

[`KI-Bewegungen_einlesen.bat`](mod/Animation_Player_4B649335/Beispiele_Examples/KI-Bewegungen_einlesen.bat) liest `meta.json` (Titel) und `motion.dat` (Anzahl Frames, 30 fps) jeder Bewegung und schreibt `saved\ai_motions.cfg` für den Player. Per Doppelklick starten, dann im Reiter *KI-Bewegungen* auf *Neu laden* klicken. Das Skript liest nur deinen KI-Bewegungsordner und schreibt nur diese eine Datei – der komplette Code steht lesbar in der .bat (sie startet PowerShell).

Ohne die Datei zeigt der Reiter einfach *Slot 1* bis *Slot 30*. KI-Bewegungen laufen immer in Echtzeit – Tempo, Einfrieren und Spielpause wirken auf sie nicht.

Ausführliche Anleitung: [LIESMICH.txt](mod/Animation_Player_4B649335/Beispiele_Examples/LIESMICH.txt)

### Änderungen

**2.5.3** (30.10.2026)
- Zufall-Loop bleibt nicht mehr bei Animationen mit eigenem Loop-Abschnitt hängen (z. B. `SmartPhone_Check`, `Multi_SmartPhone_Check`, `Click_SmartPhone_Light`): nach einmal ihrer Länge geht es zur nächsten Animation. Allein loopen sie wie bisher.
- Weniger Dreher zwischen Animationen im Loop: Hat eine Animation einen End-Abschnitt (Rückweg in die Grundhaltung), startet die nächste jetzt kurz davor statt ganz am Schluss.
- Loop-Zeitpunkt bei Animationen mit Loop-Abschnitt nutzt jetzt das Abspieltempo des Spiels (die Messung war dort falsch).
- Anleitung: neue Einträge bei „Häufige Probleme“ (hängender Zufall-Loop, Teenager und „Animation has no valid montage“).

**2.5.2** – Einfrieren nutzt die echte Spielpause, Hinweis im Pose-Reiter, Kopf-Gruppe zuerst.  
**2.5.1** – „+“ in eigenen Listen funktioniert (alle Altersstufen, nicht durchgestrichen).  
**2.5** – Genauer Loop-Timer, Teen-Prüfung für feste Listen, benannte Listen (`saved/lists/*.cfg`).
