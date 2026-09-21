# STICHEL Design- und Sicherheitsnotiz

## Produktgrenze

STICHEL erzeugt in dieser Version ausschließlich G-Code für geschlossene, aus einer horizontalen Schnittebene gewonnene Gravurkonturen mit einem Stichel. Taschen, Bohrungen, echte V-Carve-Flächenberechnung, Werkzeugradiuskorrektur, Kollisionsprüfung und maschinenspezifische Postprozessoren werden nicht behauptet oder simuliert.

## Verbindlicher Ablauf

1. Modell lokal öffnen: STL, OBJ, 3MF oder PLY.
2. Oberseite über eine von sechs Achsenrichtungen festlegen.
3. Horizontale Schnittebene knapp unter die relevante Geometrie legen.
4. Werkstück-Nullpunkt als Ecke oder Mittelpunkt festlegen; Z0 liegt auf der Oberfläche.
5. Stichel, Tiefe, Zustellung, Sicherheits-Z, Vorschübe und Drehzahl prüfen.
6. Erkannte Konturen direkt in der Draufsicht aktivieren oder ignorieren.
7. 2D- oder 3D-Bewegung ausdrücklich berechnen, Start-/Endschritte ordnen, prüfen und exportieren.

Kein Werkzeugweg und kein G-Code wird automatisch erzeugt. Jede Änderung nach einer Berechnung verwirft das Ergebnis.

## G-Code-Regeln

- Millimeter, absolut, XY-Ebene, Vorschub pro Minute: `G21 G90 G17 G94`.
- Keine unbekannte Bewegung in Maschinenkoordinaten und insbesondere kein fest verdrahtetes `G53`.
- XY-Eilgang erfolgt nur auf positivem Sicherheits-Z.
- Eintauchen erfolgt mit separatem Plunge-Vorschub.
- Jede Kontur endet mit Rückzug auf Sicherheits-Z.
- Standardende: Rückzug, `M5`, `M30`.
- Ungültige Reihenfolgen wie Endschritt vor Bewegung werden abgewiesen.

## Interaktion

- Eine Funktion hat genau einen sichtbaren Ort im siebenstufigen Ablauf.
- Konturen werden direkt in der 2D-Bühne gewählt; die Liste rechts spiegelt denselben Zustand.
- `Escape` beendet den aktuellen Fehler-/Moduszustand.
- `Strg/Cmd+Z` und `Strg/Cmd+Y` steuern Undo/Redo für Projekteinstellungen.
- `Strg/Cmd+C` kopiert den G-Code nur im berechneten Zustand und nur, wenn kein Text markiert ist.
- Alle Berechnungsparameter verwenden Geist Mono und tabellarische Ziffern.

## Visuelles System

- Geist Sans für Sprache, Geist Mono für Messwerte.
- Eine Akzentfarbe: Blau bedeutet Auswahl, Fokus oder primäre Aktion.
- Oberflächen verwenden `--mw-surface-*`, Kanten `--mw-border`; Komponenten enthalten keine eigenen UI-Farbwerte. Canvas-Farben sind dokumentierte Ausnahme.
- Übergänge dauern 160 bis 180 ms, ohne Bounce oder Dauereffekt.

## Offene Produktionsanforderungen

Vor realer Maschinenfreigabe fehlen weiterhin maschinenspezifischer Postprozessor, Halter-/Spannmittel-Kollisionen, Material- und Werkzeugdatenbank sowie ein unabhängiger G-Code-Simulator. Exportierter Code muss deshalb extern simuliert und an der Maschine im Trockenlauf geprüft werden.