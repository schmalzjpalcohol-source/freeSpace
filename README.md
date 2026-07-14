# freeSpace

Free storage-layout overview using GitHub Pages for the frontend, Vercel Functions for the backend, and the Supabase Free Tier for the database.

## Architecture

- `docs/`: static GitHub Pages application
- `api/`: Vercel Serverless Functions
- `supabase/schema.sql`: database tables for storage areas and items
- Authentication: username and password stored in Supabase, followed by a custom signed backend token in `localStorage`

## Setup

1. Create a Supabase project and run `supabase/schema.sql` in the SQL Editor.
2. Import this repository into a Vercel project.
3. Configure these environment variables in Vercel:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `FRONTEND_URL=https://YOUR-GITHUB-USER.github.io/YOUR-REPOSITORY/`
   - `FRONTEND_ORIGIN=https://YOUR-GITHUB-USER.github.io`
   - `JWT_SECRET` with a long random value
4. After deploying to Vercel, configure `docs/config.js`:

```js
window.FREESPACE_API_BASE_URL = 'https://YOUR-VERCEL-PROJECT.vercel.app';
```

5. Verify the Vercel deployment:

```text
https://YOUR-VERCEL-PROJECT.vercel.app/api/health
```

The response should contain `{"ok":true,"database":"connected"}`.

6. Enable GitHub Pages:
   - Settings
   - Pages
   - Source: Deploy from a branch
   - Branch: `main`
   - Folder: `/docs`

## Local development

```bash
npm install
npm run check
npm run dev
```

The Vercel environment variables must also be available locally when running local tests. Never commit secrets to Git.

## Public repository safety

Never commit these variables:

- `SUPABASE_SERVICE_ROLE_KEY`
- `JWT_SECRET`

`docs/config.js` is publicly visible. It must contain only the public Vercel URL and no secrets.
