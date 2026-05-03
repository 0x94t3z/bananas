# Banana Tap Snap

Banana Tap is a Farcaster Snap version of the original Banana Tap Frame. It is a
server-rendered mini app: the API returns Snap JSON, and Farcaster clients render the
native UI, buttons, image, and actions.

Players tap to increase their banana price. Scores are keyed by Farcaster `fid`,
usernames are looked up from Farcaster, and the leaderboard is stored in Neon/Postgres.

## Terms And Disclaimer

Banana Tap is only a game. The displayed dollar price is a fictional score for
answering "how much is your banana worth?" It is not money, has no cash value, and does
not represent a token, investment, payout, airdrop, or reward.

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

Set it in production when you want every generated Snap URL and button target to use one
canonical domain:

```bash
SNAP_PUBLIC_BASE_URL="https://bananastap.0x94t3z.site"
```

Use the origin only: no path, no query string, and no trailing slash. The Share button
opens Farcaster's composer with this cast text and explicitly passes the canonical URL in
`embeds` so the shared cast renders as a Snap. When the player has a saved score, the
shared URL includes `?player=<fid>` so the cast opens on that player's current progress
instead of the default guest state:

```text
I just grew my banana to $X.XX by playing Banana Tap.

Snap by @0x94t3z.eth
```

If you paste the URL manually into a cast, some Farcaster clients may show a normal Open
Graph card instead of the Snap. Sharing through the Snap button is the reliable path
because it uses the `compose_cast` action with an explicit embed.

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

## Leaderboard Guardrails

Tap requests must come from a signed Farcaster Snap action, so the server uses the
authenticated `fid` from the request instead of trusting a wallet address or user input.
The tap write path also enforces a one-second cooldown per `fid`. If someone scripts
rapid requests, only the first tap inside that window counts; the rest return the current
score without incrementing.

This does not make cheating impossible, but it keeps the leaderboard from being a simple
spam race and gives the board a basic integrity floor.

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
- `/images/bananas.png` as the source banana art, browser fallback image, favicon, and
  Open Graph image.
- `/fonts/pixelify-sans-400.ttf` and `/fonts/pixelify-sans-600.ttf` for browser fallback.
- A purple Snap accent for buttons, badges, and milestone progress.

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

## Learning References

Use these docs to understand the project from the protocol outward.

### Farcaster Snap Basics

- [Snap introduction](https://docs.farcaster.xyz/snap) explains the core idea: the
  server returns JSON, and the Farcaster client renders the UI.
- [Snap spec overview](https://docs.farcaster.xyz/snap/spec-overview) explains the
  request/response lifecycle, `version`, `theme`, `effects`, `ui.root`, and
  `ui.elements`.
- [Integrating Snaps](https://docs.farcaster.xyz/snap/integrating) explains how one URL
  can serve Snap JSON to Farcaster clients and fallback HTML to normal browsers.
- [HTTP headers](https://docs.farcaster.xyz/snap/http-headers) explains the Snap
  `Accept` and `Content-Type` headers used by the local `curl` examples.

### Snap UI And Actions

- [Elements](https://docs.farcaster.xyz/snap/elements) explains the component catalog
  used by `image`, `item`, `badge`, `progress`, `stack`, `button`, and `item_group`.
- [Buttons](https://docs.farcaster.xyz/snap/buttons) explains button props and how
  button presses submit signed POST payloads.
- [Actions](https://docs.farcaster.xyz/snap/actions) explains `submit`,
  `compose_cast`, `open_url`, `open_snap`, and other action types.
- [Theme and styling](https://docs.farcaster.xyz/snap/theme) explains why the
  Snap uses a named accent color like `purple` instead of arbitrary CSS.
- [Effects](https://docs.farcaster.xyz/snap/effects) explains render effects like the
  confetti used after a tap.
- [Constraints](https://docs.farcaster.xyz/snap/constraints) is useful when a UI element
  fails validation or renders differently than expected.

### Auth, Identity, And Sharing

- [Snap authentication](https://docs.farcaster.xyz/snap/auth) explains JSON Farcaster
  Signatures, `user.fid`, `audience`, timestamps, and why real POST requests must be
  signed by the client.
- [Farcaster cast intent URLs](https://docs.neynar.com/farcaster/reference/farcaster/intent-urls)
  explains how cast composers can receive `text` and `embeds[]`.
- [Farcaster client embeds](https://docs.neynar.com/farcaster/reference/farcaster/embeds)
  explains normal URL previews, Open Graph fallback behavior, and embed cache resets.
- [Mini app sharing guide](https://docs.neynar.com/miniapps/guides/sharing) explains how
  shareable URLs become rich Farcaster cards through metadata.

### Backend, Database, And Deploy

- [Hono docs](https://www.honojs.com/docs/) explain the web framework used by this app.
- [Hono on Vercel](https://vercel.com/docs/frameworks/backend/hono) explains why the
  project can deploy as a Hono backend on Vercel.
- [Vercel `vercel.json`](https://vercel.com/docs/project-configuration/vercel-json)
  explains the deployment config file used in this repo.
- [Vercel environment variables](https://vercel.com/docs/environment-variables) explains
  where `DATABASE_URL` and `SNAP_PUBLIC_BASE_URL` should be configured in production.
- [Neon serverless driver](https://neon.com/docs/serverless/serverless-driver) explains
  `@neondatabase/serverless`, the `neon()` query function, and why it works well on
  serverless platforms.
- [TypeScript TSConfig reference](https://www.typescriptlang.org/tsconfig) explains the
  compiler settings behind `npm run build`.

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
