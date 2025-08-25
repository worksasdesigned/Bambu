# deZents kleine Bambu-Gutschein Verwaltung

Eine kleine, per Docker deploybare Web-App zur Verwaltung von Bambu-Gutscheinen. </br>

## ja...eine Excel Datei hätte es auch getan... aber irgendwie muss man den HomeServer ja beschäftigen :-)

## Features (kurz)
- Passwortschutz (Default: `bambu`, muss beim ersten Login geändert werden)
- Gutscheine erfassen, verwenden/zuweisen, planen
- KPI-Dashboard (Summen, Prognosen 3/6/12 Monate, Tabellen & Listen)
- Dunkles, modernes UI; optionales Hintergrundbild `public/background.png`
- Persistente Daten (SQLite-Datei in Volume)
- Upload einer CSV Datei mit alten Gutscheinen (Datum;GutscheinNR;Name;Objekt)

Beschreibung:
Auf dem Dashboard sieht man wie viele Gutscheine man schon erhalten hat bzw wie viele gerade offen sind.
<img width="1359" height="1137" alt="image" src="https://github.com/user-attachments/assets/8f2aabde-f709-45fa-84e7-3e8c53c9d53d" />

Detailliste der Gutscheine:
<img width="1299" height="502" alt="image" src="https://github.com/user-attachments/assets/f7b2d177-b6f9-4164-96d7-7902101d0bcc" />

Man kann auch Gutscheine (Beträge) planen und sieh welcher Plan bereits erfüllt werden könnte.
<img width="420" height="202" alt="image" src="https://github.com/user-attachments/assets/c682b02d-3aa0-43ee-a1e9-d00ab5a9143b" />



## Installation unter docker
`
doker pull ghcr.io/worksasdesigned/bambu:latest
docker run -d --name bambu-gutschein-web -p 8080:3000 -e PORT=3000 -e NODE_ENV=production ghcr.io/worksasdesigned/bambu:latest
docker logs -f bambu-gutschein-web
`

4. Nach dem Deploy ist die App unter `http://<host>:8080` erreichbar
5. Testseite aufrufen: `http://<host>:8080/test.html`
   - Zeigt, ob `styles.css` und der Healthcheck `/health` erreichbar sind
5. Beim ersten Aufruf mit Passwort `bambu` anmelden und ein neues Passwort setzen


## Hinweise
- Daten werden in `/app/data` (SQLite) persistiert. Das Compose-Volume `data` bewahrt diese Daten über Container-Neustarts.
- Passwort-Reset: Im Container ein leeres Flag `data/reset-password` anlegen (oder die Datei `reset-password` in `data/` anlegen). Nach Neustart wird wieder `bambu` verlangt und eine Änderung erzwungen.

