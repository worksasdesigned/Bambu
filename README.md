# deZents kleine Bambu-Gutschein Verwaltung

Eine kleine, per Docker deploybare Web-App zur Verwaltung von Bambu-Gutscheinen. </br>

## ja...eine Excel Datei hätte es auch getan... :-)

## Features (kurz)
- Passwortschutz (Default: `bambu`, muss beim ersten Login geändert werden)
- Gutscheine erfassen, verwenden/zuweisen, planen
- KPI-Dashboard (Summen, Prognosen 3/6/12 Monate, Tabellen & Listen)
- Dunkles, modernes UI; optionales Hintergrundbild `public/background.png`
- Persistente Daten (SQLite-Datei in Volume)
- Upload einer CSV Datei mit alten Gutscheinen (Datum;GutscheinNR;Name;Objekt)
- export der Gutscheine als CSV Datei als backup  

## docker Befehle
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

