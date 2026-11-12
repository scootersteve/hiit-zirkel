# iPhone-Checkliste

Was sich nur auf dem echten iPhone prüfen lässt. Ergebnisse bitte mit iPhone-Modell und iOS-Version notieren.

## Ton-Machbarkeitstest

Läuft über die eigene Testseite mit eingebauter Checkliste und Ergebnisformular:
https://scootersteve.github.io/hiit-zirkel/soundtest/

## Timer-Anzeige (Version 0.1.0)

App: https://scootersteve.github.io/hiit-zirkel/ (die Version steht unten auf der Startseite)

Am schnellsten mit dem Zirkel **"Schnelltest (alle Signale)"** (2:33 min).

| # | Prüfpunkt | Erwartung |
|---|---|---|
| 1 | Restzeit aus 2 m lesbar | Zahl und Phasenname klar erkennbar, auch bei Belastung (rot) und Pause (grün) |
| 2 | Signale ohne Hinschauen unterscheidbar | Belastung: langer hoher Ton. Pause: tiefer Doppelton. Rundenpause: drei fallende Töne. Letzte 3 s: kurze Töne. Ende: steigende Folge |
| 3 | Ansagen | "Pause. Als Nächstes: …", "Runde 1 geschafft, noch eine", "Seite wechseln" (Seitstütz, zur Halbzeit), "Geschafft" |
| 4 | Ansage und Countdown überlagern sich nie | Ansage ist fertig, bevor die 3-2-1-Töne kommen |
| 5 | Stummschalter, Modus "Immer hörbar" | Töne hörbar |
| 6 | Stummschalter aus, Modus "Musik-Modus", Spotify läuft | Töne mischen sich mit der Musik |
| 7 | Bildschirm bleibt an | Beispiel-Zirkel (20:10) komplett, automatische Sperre auf 30 s: Bildschirm geht nicht aus |
| 8 | Restzeit nach App-Wechsel | Während Belastung zu WhatsApp, 30 s warten, zurück: Restzeit ist um 30 s weiter, keine nachgeholten Pieptöne |
| 9 | Ton nach Unterbrechung | Siri oder Anruf während des Trainings, zurück: Töne kommen wieder. Falls nicht: weißer Hinweis "Ton unterbrochen. Hier tippen." erscheint und hilft |
| 10 | Tasten | Pause hält die Uhr an, Zurück, Überspringen, +10 s, Abbrechen nur nach Rückfrage |
| 11 | Sichere Bereiche | Nichts verschwindet unter Dynamic Island/Notch oder Home-Balken |

## Später (mit Offline-Schritt)

- Installation über "Zum Home-Bildschirm" mit eigenem Symbol
- App startet im Flugmodus
- Hinweis "Neue Version verfügbar" nach einem Update

## Design 0.6.0 (Branch design/apple-look, noch nicht veröffentlicht)

| # | Prüfpunkt | Erwartung |
|---|---|---|
| 1 | Hell/Dunkel: iPhone in Einstellungen → Anzeige umschalten | App folgt sofort, solange "Automatisch" gewählt ist |
| 2 | Statusleiste (Uhr, Akku) im hellen Modus als Home-Bildschirm-App | lesbar, nicht weiß auf hellem Grund |
| 3 | Schriftgröße: Einstellungen → Anzeige → Textgröße groß | Texte wachsen mit, nichts wird abgeschnitten (Tab-Leiste bleibt bewusst gleich groß) |
| 4 | Tastatur: Name im Editor, Zahl bei "Belastung", Suche in Übungen | Feld bleibt sichtbar, Seite zoomt nicht |
| 5 | Tippen auf Knöpfe | jeder Knopf reagiert sichtbar beim Antippen, kein grauer Blitz |
| 6 | Wischen vom linken Rand (Zurück-Geste) | notieren, was passiert; Zurück funktioniert sicher über die Taste oben links |
| 7 | Ring im Training | bewegt sich einmal pro Sekunde weich weiter, Restzeit aus 2 m lesbar |
| 8 | Blur der Leisten (Tab-Leiste, obere Leiste im Editor) | kein Ruckeln beim Scrollen auf dem iPhone 13 |


## Muskelgrafik 0.7.0 (Branch feature/teil-c, noch nicht veröffentlicht)

| # | Prüfpunkt | Erwartung |
|---|---|---|
| 1 | Tab "Übungen": eine eingebaute Übung antippen (z.B. Burpees) | Blatt mit Körper von vorne und hinten, Hauptmuskeln kräftig rot, Nebenmuskeln hell, darunter dieselben Muskeln als Text. "Fertig" schließt |
| 2 | Dasselbe im hellen und im dunklen Modus | Figur und alle drei Farbstufen in beiden gut zu unterscheiden, auch draußen bei Sonne |
| 3 | Eigene Übung anlegen, Muskeln antippen | Figur im Formular färbt sich sofort mit, ohne Ruckeln |
| 4 | Zirkel bearbeiten (z.B. Beispiel-Zirkel), zu "Muskeln" scrollen | Figur mit Schwerpunkt, Text daneben. Übung entfernen oder Zeit ändern: Grafik passt sich an |
| 5 | Scrollen im Editor und in der Übungsliste | bleibt flüssig (die Figur besteht aus vielen Flächen) |
| 6 | Einstellungen → Lizenzen und Quellen → Körpergrafik | Blatt mit dem MIT-Lizenztext, "Fertig" und Tippen daneben schließen |
| 7 | Textgröße des iPhones groß stellen | Figur wird kleiner statt abgeschnitten, "Zurück" und Titel in der oberen Leiste überlappen nicht |
| 8 | Flugmodus, App neu öffnen, Übung antippen | Grafik erscheint auch offline |

## Neuer Name "Circle Champ" (ab 0.7.0)

| # | Prüfpunkt | Erwartung |
|---|---|---|
| 1 | Nach dem Update: Startseite, Einstellungen unten, Teilen-Blatt | überall "Circle Champ", Zirkel, Verlauf und Einstellungen sind noch da |
| 2 | Symbol auf dem Home-Bildschirm | heißt weiter "Zirkel Dojo": iOS übernimmt den Namen nur beim Hinzufügen. Für den neuen Namen: erst in der alten App Einstellungen → Sicherung herunterladen, dann Symbol löschen, Seite in Safari öffnen, neu "Zum Home-Bildschirm", Sicherung importieren |
| 3 | Vor Punkt 2 prüfen | Ob die Daten das Löschen des Symbols überstehen, ist nicht getestet. Deshalb zuerst die Sicherung |
| 4 | Alte Sicherungsdatei (zirkel-dojo-….json) importieren | funktioniert weiter, das Format ist gleich geblieben |

## Designs, Figuren, Personalisierung, Symbol 0.8.0 (Branch feature/teil-c, noch nicht veröffentlicht)

| # | Prüfpunkt | Erwartung |
|---|---|---|
| 1 | Einstellungen → Design: Flammen, Ninja, Wildnis, Donner nacheinander wählen | Farben, Titelschrift und Figur wechseln sofort, in Hell und Dunkel alles lesbar |
| 2 | App schließen und neu öffnen | gewähltes Design ist sofort da, kein kurzes Aufblitzen des Standard-Designs |
| 3 | Training in einem Design starten (Schnelltest) | Belastung: Linien, Raster und Aura um den Ring. Pausen: nur Aura, Figur steht unten rechts (bei langem Übungsnamen weicht sie aus). Restzeit aus 2 m lesbar, Zahl wackelt nicht |
| 4 | Dasselbe ein paar Minuten laufen lassen | flüssig, iPhone wird nicht warm, kein Ruckeln des Rings. Im Browser gemessen kostet ein Design mit Effekten 14 bis 37 % mehr Rechenzeit als Standard (je nach Lauf), absolut unter 2 s pro Minute, ohne Arbeit pro Bild. Wenn es auf dem iPhone ruckelt oder warm wird: "Bewegte Effekte" aus und notieren |
| 5 | Einstellungen → "Bewegte Effekte" aus, Training starten | Aura und Linien stehen still |
| 6 | iPhone: Einstellungen → Bedienungshilfen → Bewegung reduzieren an | Effekte stehen ebenfalls still |
| 7 | Training bis zum Ende | Figur jubelt auf dem Abschlussbildschirm, bei Abbruch nur das schlichte Zeichen |
| 8 | Statusleiste (Uhr, Akku) in jedem Design, hell und dunkel | lesbar, Farbe passt zum Seitenhintergrund |
| 9 | Persönlich → Hintergrundbild: Foto aus der Mediathek wählen, einmal Hochformat, einmal Querformat | Vorschau erscheint, "gespeichert". Foto steht richtig herum (iPhone-Fotos sind HEIC und tragen die Drehung als Zusatzangabe: nur am Gerät prüfbar). Training: Foto liegt abgedunkelt hinter der Phasenfarbe, Restzeit bleibt lesbar, auch bei sehr hellem Foto |
| 10 | Persönlich → Ton "Ende": kurze Tondatei wählen (z.B. aus "Dateien"), "Anhören" | Ton spielt. Im Training kommt er am Ende statt der Fanfare, auch mit Stummschalter im Modus "Immer hörbar" |
| 11 | Ton länger als 8 s wählen | wird mit Begründung abgelehnt |
| 11a | Langen eigenen Ton (5 bis 8 s) für "Runde geschafft" bei kurzer Rundenpause (z.B. 10 s) | Ton bricht beim ersten Countdown-Ton ab, Countdown bleibt hörbar |
| 12 | Sicherung herunterladen, Datei ansehen | enthält weder Bild noch Ton |
| 13 | App vom Home-Bildschirm löschen und neu hinzufügen | neues Symbol (blaue wirbelnde Kugel mit offenem Ring), Name "Circle Champ". Vorher Sicherung herunterladen, Bild und Töne müssen danach neu gewählt werden |
| 14 | Flugmodus, App neu öffnen, Design wechseln | Schrift und Figuren erscheinen auch offline |

## Porträts der Designs (Branch feature/teil-d, noch nicht veröffentlicht)

| # | Prüfpunkt | Erwartung |
|---|---|---|
| 1 | Erster Start ohne gewähltes Design | Flammen ist aktiv, Porträt oben rechts neben dem Titel |
| 2 | Einstellungen → Design | Flammen und Ninja zeigen das Gesicht ihres Porträts im runden Bild, klar erkennbar |
| 3 | Training in Flammen oder Ninja, Pause | rundes Porträt mit weißem Rand unten rechts, verdeckt keinen Text |
| 4 | Training bis zum Ende | großes Siegerbild auf dem Abschlussbildschirm, scharf, nicht verpixelt |
| 5 | Flugmodus, App öffnen | Porträts erscheinen auch offline |
| 6 | Übung hinzufügen, mehrere antippen, "Fertig", erneut "Übung hinzufügen" | gewählte Übungen tragen einen Haken, oben "… im Zirkel"; Tipp auf eine markierte nimmt sie heraus |

## Szenen-Designs (Branch feature/teil-d): Messung Rechenzeit

Im Browser gemessen (tools/perf.mjs, 30 s Training, CPU 4x gedrosselt, je 4 Läufe abwechselnd, Median): Standard 1.970 ms/min, Szenen 2.011 bis 2.581 ms/min, also bis etwa +30 %. Die Streuung zwischen Läufen ist groß (bis ±40 %); am stabilsten ist die Stilberechnung: Standard 272, Szenen 352 bis 407 ms/min. Keine Arbeit pro Bild (0 requestAnimationFrame, 60 Timer pro Minute wie bisher). Auf dem iPhone prüfen: Wird es bei 20 Minuten Training in einem Szenen-Design warm oder ruckelt der Ring? Wenn ja: "Bewegte Effekte" aus und notieren.
