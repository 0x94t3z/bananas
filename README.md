# Banana Tap Snap

Banana Tap is a Farcaster Snap version of the original Banana Tap Frame. It is a
server-rendered mini app: the API returns Snap JSON, and Farcaster clients render the
native UI, buttons, image, and actions.

Players tap to increase their banana price. Scores are keyed by Farcaster `fid`,
usernames are looked up from Farcaster, and the leaderboard is stored in Neon/Postgres.

## Architecture

- `src/index.ts` contains the Snap handler, UI definition, tap action, share action,
  database reads/writes, rank calculation, and fallback HTML.
- `src/server.ts` is local-dev only. It starts the Hono server and serves static
  images/fonts.
- `public/images/banana-hero.png` is the rendered hero image shown inside the Snap.
- `public/images/bananas.png` is the source banana art used by the hero generator.
- `scripts/generate-hero.py` regenerates the pixel hero image with Pixelify Sans.
- `assets/fonts` contains Pixelify Sans for generated images and browser fallback.
- `vercel.json` configures the Hono deployment and includes font assets for rendering.
- `.agentdeploy` is Neynar-host metadata from an earlier deployment path. The current
  production path can stay on Vercel.

## Environment

The app only needs a Postgres connection string for persistent production data:

```bash
DATABASE_URL="postgresql://..."
```

`NEON_DATABASE_URL` is also supported:

```bash
NEON_DATABASE_URL="postgresql://..."
```

If neither variable is set, the app falls back to in-memory scores. That is useful for
local testing, but all scores reset when the dev server restarts.

### Canonical Snap URL

`SNAP_PUBLIC_BASE_URL` controls the public origin used for Snap image URLs and button
targets.

Set it in production when you want every shared cast to embed one canonical domain:

```bash
SNAP_PUBLIC_BASE_URL="https://bananastap.0x94t3z.site"
```

Use the origin only: no path, no query string, and no trailing slash. The Share button
opens Farcaster's composer with this cast text:

```text
I just grew my banana to $X.XX by playing Banana Tap.

Snap by @0x94t3z.eth
```

The Share action does not pass an explicit `embeds` array. Farcaster can attach the
active Snap context when sharing from inside the Snap; omitting the explicit embed avoids
duplicating the same Snap preview in clients that already do that.

If `SNAP_PUBLIC_BASE_URL` is unset, the app derives the base URL from the incoming
request. That works locally and can work on Vercel, but a fixed production value is
cleaner when you use a custom domain.

Old Frame env vars are not used anymore:

- `STACK_API_KEY`
- `STACK_POINT_SYSTEM_ID`
- `AIRSTACK_API_KEY`

## Database

The app creates the table automatically on first use:

```sql
create table if not exists banana_scores (
  fid bigint primary key,
  username text not null,
  taps integer not null default 0,
  updated_at timestamptz not null default now()
);
```

Each tap upserts by `fid`, stores the latest username, increments `taps`, and updates the
timestamp. The visible leaderboard shows the top five players. The current user's rank is
calculated against the full table, so a user outside the top five still sees their real
rank instead of `Unranked`.

## Run Locally

```bash
npm install
npm run dev
```

The local server runs at:

```bash
http://localhost:3003
```

Opening that URL in a browser shows the fallback page. Farcaster clients request Snap
JSON using the Snap `Accept` header.

## Validate Snap JSON

```bash
curl -sS -H 'Accept: application/vnd.farcaster.snap+json' \
  http://localhost:3003/
```

You should see a Snap response with:

```json
{
  "version": "2.0",
  "ui": {
    "root": "page",
    "elements": {}
  }
}
```

## Test A Tap Locally

`npm run dev` sets `SKIP_JFS_VERIFICATION=true`, so POST actions can be tested with a
development JFS-shaped payload.

```bash
PAYLOAD=$(printf '%s' "{\"fid\":1,\"inputs\":{},\"audience\":\"http://localhost:3003\",\"timestamp\":$(date +%s),\"user\":{\"fid\":1},\"surface\":{\"type\":\"standalone\"}}" \
  | base64 | tr -d '\n' | tr '+/' '-_' | tr -d '=')

curl -sS -X POST \
  -H 'Accept: application/vnd.farcaster.snap+json' \
  -H 'Content-Type: application/json' \
  -d "{\"header\":\"dev\",\"payload\":\"$PAYLOAD\",\"signature\":\"dev\"}" \
  'http://localhost:3003/?action=tap'
```

FID `1` should resolve to `@farcaster`, increment the tap count, and return the updated
Snap JSON.

## Test The Leaderboard

```bash
PAYLOAD=$(printf '%s' "{\"fid\":1,\"inputs\":{},\"audience\":\"http://localhost:3003\",\"timestamp\":$(date +%s),\"user\":{\"fid\":1},\"surface\":{\"type\":\"standalone\"}}" \
  | base64 | tr -d '\n' | tr '+/' '-_' | tr -d '=')

curl -sS -X POST \
  -H 'Accept: application/vnd.farcaster.snap+json' \
  -H 'Content-Type: application/json' \
  -d "{\"header\":\"dev\",\"payload\":\"$PAYLOAD\",\"signature\":\"dev\"}" \
  'http://localhost:3003/?action=leaderboard'
```

This returns the leaderboard Snap page.

## Assets And Fonts

The Snap uses:

- `/images/banana-hero.png` for the purple Banana Tap hero.
- `/images/bananas.png` as the source banana art.
- `/fonts/pixelify-sans-400.ttf` and `/fonts/pixelify-sans-600.ttf` for browser fallback.
- A purple Snap accent for buttons, badges, and progress.

Native Snap text does not support a custom font family. Farcaster clients control native
Snap typography so the UI stays consistent in-feed. Pixelify Sans is used inside the
generated hero image and browser fallback.

To regenerate the hero after editing `scripts/generate-hero.py`:

```bash
python3 scripts/generate-hero.py
```

If Pillow is missing locally:

```bash
python3 -m pip install pillow
```

## Production

Preferred production flow:

1. Set `DATABASE_URL` in Vercel.
2. Set `SNAP_PUBLIC_BASE_URL` in Vercel to the canonical public origin.
3. Push to GitHub.
4. Let the connected Vercel project deploy from Git.

Useful production URLs:

```bash
https://bananastap.0x94t3z.site
https://bananas-tap.vercel.app
```

Validate the live Snap:

```bash
curl -sS -H 'Accept: application/vnd.farcaster.snap+json' \
  https://bananastap.0x94t3z.site/
```

You can also paste the same URL into the Farcaster developer Snap emulator.

## Manual Vercel Deploy

Use the Git-backed Vercel deployment when possible. If you intentionally deploy from the
CLI, make sure the production env vars are already configured in Vercel, then run:

```bash
npm run deploy -- --prod
```

Do not commit `.env`.
