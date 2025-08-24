# deZents kleine Bambu-Gutschein Verwaltung

Eine kleine, per Docker Compose (Portainer) deploybare Web-App zur Verwaltung von Bambu-Gutscheinen.

## Features (kurz)
- Passwortschutz (Default: `bambu`, muss beim ersten Login geändert werden)
- Gutscheine erfassen, verwenden/zuweisen, planen
- KPI-Dashboard (Summen, Prognosen 3/6/12 Monate, Tabellen & Listen)
- Dunkles, modernes UI; optionales Hintergrundbild `public/background.png`
- Persistente Daten (SQLite-Datei in Volume)

## Schnellstart (Docker Compose / Portainer)

1. Optional: `public/background.png` bereitstellen (wird automatisch eingebunden)
2. In Portainer einen neuen Stack erstellen
3. Folgendes Compose YAML in Portainer einfügen und deployen:

```yaml
version: '3.8'
services:
  web:
    image: ghcr.io/your-org/bambu-gutschein:latest # ODER build aus Repository; hier beim lokalen Deploy build: .
    build: .
    container_name: bambu-gutschein-web
    ports:
      - "8080:3000"
    environment:
      - PORT=3000
      - NODE_ENV=production
    volumes:
      - data:/app/data
      - ./public/background.png:/app/public/background.png:ro
    restart: unless-stopped
volumes:
  data:
```

4. Nach dem Deploy ist die App unter `http://<host>:8080` erreichbar
5. Beim ersten Aufruf mit Passwort `bambu` anmelden und ein neues Passwort setzen

## Lokaler Build ohne Portainer

```bash
npm install
npm run start
# App unter http://localhost:3000
```

## Hinweise
- Daten werden in `/app/data` (SQLite) persistiert. Das Compose-Volume `data` bewahrt diese Daten über Container-Neustarts.
- Passwort-Reset: Im Container ein leeres Flag `data/reset-password` anlegen (oder die Datei `reset-password` in `data/` anlegen). Nach Neustart wird wieder `bambu` verlangt und eine Änderung erzwungen.

Weitere Funktionen und die komplette UI folgen in den nächsten Schritten.

## Portainer: Schritt-für-Schritt

- In Portainer: Stacks -> Add Stack
- Namen vergeben (z.B. bambu-gutschein)
- Compose-Datei aus diesem Repo in das Textfeld kopieren (siehe Abschnitt oben)
- Optional: Unter "Web editor" eine Datei `public/background.png` per Bind-Mount hinzufügen (siehe volumes-Zeile)
- Deploy Stack klicken

Standard-URL: `http://<server>:8080`

### Umgebungsvariablen (optional)
- `PORT` (default 3000)
- `DEFAULT_PASSWORD` (default `bambu`)
- `APP_SECRET` (HMAC Secret für Session-Cookie, bitte setzen)
- `DATA_DIR` (default `/app/data`)
