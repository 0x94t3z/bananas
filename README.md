# Banana Tap Snap

Banana Tap is a Farcaster Snap version of the original Banana Tap Frame. A Snap is a
small server-rendered app embedded in a cast. The server returns JSON, and the Farcaster
client renders the UI, buttons, images, and interactions.

This project lets a signed-in Farcaster user tap to increase their banana price. Scores
are stored by Farcaster `fid`, usernames are looked up from Farcaster, and the
leaderboard is shown inside the Snap.

## How This Project Works

- `src/index.ts` is the Snap app. It registers the Snap handler, builds the Snap JSON UI,
  handles taps, stores scores, and renders the leaderboard.
- `src/server.ts` is only for local development. It starts the Hono server and serves
  static images/fonts.
- `public/images/bananas.png` is the banana image used in the Snap.
- `assets/fonts` and `public/fonts` contain Pixelify Sans for the browser fallback and
  OG preview image. Native Snap text uses the Farcaster client's font.
- `vercel.json` configures deployment as a Hono app and includes font assets for OG
  rendering.

## Environment

For local development and production persistence, you only need a Postgres connection
string:

```bash
DATABASE_URL="postgresql://..."
```

`NEON_DATABASE_URL` also works if you prefer that name:

```bash
NEON_DATABASE_URL="postgresql://..."
```

`SNAP_PUBLIC_BASE_URL` is optional. If it is unset, the app derives the public URL from
the incoming request. That is usually the easiest setup for Vercel. If you use a fixed
custom domain, set it to that origin:

```bash
SNAP_PUBLIC_BASE_URL="https://bananas-tap.vercel.app"
```

Locally, leave `SNAP_PUBLIC_BASE_URL` unset if you want buttons to target
`http://localhost:3003`.

Old Frame env vars are no longer needed:

- `STACK_API_KEY`
- `STACK_POINT_SYSTEM_ID`
- `AIRSTACK_API_KEY`

## Database

The app creates this table automatically on first use:

```sql
create table if not exists banana_scores (
  fid bigint primary key,
  username text not null,
  taps integer not null default 0,
  updated_at timestamptz not null default now()
);
```

Each tap upserts one row by `fid` and increments `taps`. The leaderboard reads the top
five rows ordered by tap count.

If no `DATABASE_URL` or `NEON_DATABASE_URL` is present, the app falls back to in-memory
scores. That is useful for local testing, but scores reset when the dev server restarts.

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

You should see JSON with:

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

`npm run dev` sets `SKIP_JFS_VERIFICATION=true`, so you can test POST actions with a
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

- `/images/bananas.png` for the banana image.
- `/fonts/pixelify-sans-400.ttf` and `/fonts/pixelify-sans-600.ttf` for the browser
  fallback.

Important: native Snap text does not support a custom font family. Farcaster clients
control native Snap typography so the UI looks consistent in-feed. Pixelify Sans is used
for the browser fallback and OG preview image.

## Live URL

The current Vercel production Snap URL is:

```bash
https://bananas-tap.vercel.app
```

To validate the live Snap:

```bash
curl -sS -H 'Accept: application/vnd.farcaster.snap+json' \
  https://bananas-tap.vercel.app/
```

## Deploy To Vercel

The project is linked to Vercel. To deploy again:

```bash
npm run deploy -- --prod --yes -e "DATABASE_URL=$DATABASE_URL"
```

Do not commit `.env`. Vercel should receive the database URL as an environment variable.
