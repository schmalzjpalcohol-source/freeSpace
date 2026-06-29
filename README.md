# freeSpace

Kostenlose Regalübersicht mit GitHub Pages als Frontend, Vercel Functions als Backend und Supabase Free Tier als Datenbank.

## Architektur

- `docs/`: statische App für GitHub Pages
- `api/`: Vercel Serverless Functions
- `supabase/schema.sql`: Tabellen für Regale und Pakete
- Auth: GitHub OAuth, danach eigenes signiertes Backend-Token im `localStorage`

## Setup

1. Supabase-Projekt erstellen und `supabase/schema.sql` im SQL Editor ausführen.
2. GitHub OAuth App erstellen:
   - Homepage URL: deine GitHub-Pages-URL
   - Authorization callback URL: `https://DEIN-VERCEL-PROJEKT.vercel.app/api/auth/github/callback`
3. Vercel-Projekt aus diesem Repo importieren.
4. In Vercel diese Environment Variables setzen:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `GITHUB_CLIENT_ID`
   - `GITHUB_CLIENT_SECRET`
   - `GITHUB_CALLBACK_URL=https://DEIN-VERCEL-PROJEKT.vercel.app/api/auth/github/callback`
   - `FRONTEND_URL=https://DEIN-GITHUB-USER.github.io/DEIN-REPO/`
   - `FRONTEND_ORIGIN=https://DEIN-GITHUB-USER.github.io`
   - `JWT_SECRET` mit langem zufälligem Wert
   - optional `GITHUB_ALLOWED_USERS=deinGithubLogin`
5. Nach dem Vercel-Deploy in `docs/config.js` eintragen:

```js
window.FREESPACE_API_BASE_URL = 'https://DEIN-VERCEL-PROJEKT.vercel.app';
```

6. Vercel prüfen:

```text
https://DEIN-VERCEL-PROJEKT.vercel.app/api/health
```

Die Antwort sollte `{"ok":true,"database":"connected"}` enthalten.

7. GitHub Pages aktivieren:
   - Settings
   - Pages
   - Source: Deploy from a branch
   - Branch: `main`
   - Folder: `/docs`

## Lokal prüfen

```bash
npm install
npm run check
npm run dev
```

Für lokale OAuth-Tests müssen die Vercel-Env-Variablen lokal vorhanden sein. Die Secrets gehören nicht in Git.

## Wichtig für ein öffentliches Repo

Keine dieser Variablen darf in Git landen:

- `SUPABASE_SERVICE_ROLE_KEY`
- `GITHUB_CLIENT_SECRET`
- `JWT_SECRET`

`docs/config.js` ist öffentlich sichtbar. Dort steht nur die öffentliche Vercel-URL, keine geheimen Daten.
