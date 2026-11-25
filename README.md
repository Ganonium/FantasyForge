# FantasyForge – Schmiedetal (Prototyp 0.1)

Ein kleines Fantasy-Spiel fürs Handy: Du schmiedest Werkzeuge und Bauwerke für dein Tal, und jedes davon verändert das Tal. Es gibt dir etwas und nimmt dir etwas anderes.

Grundlage ist das Konzeptdokument „Schmiedetal – Spielkonzept“. Dieser Prototyp soll nur eine Frage beantworten:

> Ist „Wohin setze ich die Axt?“ schon eine interessante Entscheidung?

## Starten

Kein Build-Schritt. Irgendein statischer Webserver genügt:

```bash
python3 -m http.server 8080
```

Dann `http://localhost:8080` öffnen. Auf dem Handy über GitHub Pages: in den Repo-Einstellungen *Pages → Deploy from branch → main / (root)* auswählen. Danach lässt sich die Seite zum Home-Bildschirm hinzufügen (PWA, offline spielbar).

## Was drin ist

- **Das Tal:** feste Startkarte aus 19 Sechsecken – Wald, Wiese, Fluss, Berg, Moor und das Dorf in der Mitte. Am Rand liegt angedeutet Unentdecktes (noch verschlossen).
- **Werkzeuge (6 + 1):** Axt, Pflug, Spitzhacke, Sense, Angel, Spaten – dazu die Feenaxt als Ziel für die magische Glut. Werkzeuge brauchen eine Hand aus dem Dorf und nutzen sich ab. Man kann sie zurückholen.
- **Bauwerke (3):** Köhlermeiler, Wassermühle mit Damm, Brunnen. Sie belegen das Feld dauerhaft und wirken auf die Nachbarn.
- **Esse mit einem Platz** und drei Glut-Stufen (Holzfeuer → Holzkohle-Glut → magische Glut).
- **Echte Zeit:** Werkzeuge arbeiten Stunden. Nach Abwesenheit werden bis zu 24 Stunden nachgerechnet.
- **Folgen auf der Karte:** Markierungen zeigen, wo sich etwas verändert hat. Ein Antippen zeigt, *warum* („Der Rauch des Meilers verdirbt die Kräuter.“). Nach Abwesenheit oder Zeitraffer gibt es Vorher/Nachher statt einer Textliste.
- **Werkbank (☰):** Zeitraffer (+1 Std., +8 Std., +1 Tag) zum Testen, Export/Import als Code, neues Tal.
- **Hinweis auf neue Versionen** über den Service Worker.

Bewusst **noch nicht dabei** (laut Konzept): Jahreszeiten, Geister, Helden, Erbstücke.

## Gewinnen und Verlieren im Prototyp

| Entscheidung | Du bekommst | Du verlierst |
|---|---|---|
| Axt in den Wald | Holz | Wald wird lichter, Wild (= Nahrung fürs Dorf) zieht weg, Kräuter verdorren. Gerodete Hänge neben Bergen rutschen ab und treffen Nachbarfelder – auch das Dorf. |
| Köhlermeiler | Holzkohle (für bessere Glut) | Frisst den Wald im Umkreis, Rauch vertreibt Wild, Kräuter und Bienen nebenan |
| Pflug auf die Wiese | Getreide, das Dorf wächst | Boden laugt aus, Schafe (Wolle) verschwinden, Brache braucht 3 Tage |
| Spitzhacke | Erz und Stein, tiefer = mehr Erz | Einsturzgefahr steigt mit der Tiefe – Werkzeug verloren, Berg 36 Std. gesperrt |
| Wassermühle mit Damm | Esse arbeitet 1,5× so schnell | Oberhalb versumpft die Wiese zu Moor, unterhalb trocknet sie aus, weniger Fisch |
| Spaten ins Moor | Raseneisenerz, neuer fruchtbarer Boden | Moorkraut und Irrlichter (nötig für magische Glut) verschwinden für immer |
| Sense | Kräuter / Moorkraut | Bestand schrumpft, im Moor verblassen die Irrlichter |
| Angel | Fisch | Fluss wird leergefischt |

Das Dorf isst ständig. Wild aus intakten Wäldern ernährt drei Bewohner gerade so – wer den Wald rodet, muss Nahrung anders beschaffen.

## Aufbau

```
index.html            Oberfläche
css/style.css         Bilderbuch-Stil
js/data.js            Karte, Werkzeuge, Bauwerke, Rezepte, alle Balancing-Konstanten (K)
js/sim.js             Simulationskern ohne DOM (läuft auch in Node)
js/render.js          SVG-Zeichnung des Tals
js/main.js            Oberfläche, Spielschleife, Speichern, Service-Worker-Anbindung
sw.js                 Offline-Cache und Versionshinweis
tools/balance.mjs     Balancing-Test ohne Browser
```

## Balancing-Test ohne Browser

```bash
node tools/balance.mjs 14 3
```

Spielt fünf Strategien über 14 Tage mit je drei Besuchen pro Tag durch (Kahlschlag, Wald schonen, Ackerbau, Industrie, Nichts tun) und vergleicht Hände, Rohstoffe und Zustand des Tals. Aktueller Stand nach 14 Tagen (Ø aus 5 Läufen):

| Strategie | Hände | Wald Ø Dichte |
|---|---|---|
| Kahlschlag am Dorf | 2 | 13 |
| Wald schonen | 8 | 49 |
| Ackerbau zuerst | 11 | 18 |
| Industrie (Meiler + Mühle) | 2 | 0 |
| Nichts tun | 3 | 100 |

Es gibt also keinen Weg, der immer gewinnt. Ackerbau ist noch recht stark. Das ist der erste Kandidat fürs Nachjustieren.

## Neue Version veröffentlichen

`VERSION` in `sw.js` und `APP_VERSION` in `index.html` erhöhen – dann bekommen Spieler den Hinweis „Eine neue Version ist da“.
