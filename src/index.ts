import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { Hono } from "hono";
import {
  SPEC_VERSION,
  type SnapElementInput,
  type SnapFunction,
  type SnapHandlerResult,
} from "@farcaster/snap";
import { registerSnapHandler } from "@farcaster/snap-hono";

const TAP_INCREMENT = 0.1;
const TAP_COOLDOWN_MS = 1000;
const LEADERBOARD_LIMIT = 5;
const PRICE_MILESTONES = [1, 5, 10, 25, 50, 100];
const FARCASTER_USER_URL = "https://api.farcaster.xyz/v2/user";
const HERO_IMAGE_PATH = "/images/banana-hero.png";
const BANANA_IMAGE_PATH = "/images/bananas.png";
const HERO_IMAGE_VERSION = "compact-4x3";
const SHARED_PLAYER_PARAM = "player";
const BRAND_ACCENT = "purple" as const;
const BRAND_BG = "#5d479a";
const BRAND_TEXT = "#f5feff";
const GAME_DISCLAIMER =
  "Banana price is just a game score. No rewards, payouts, or cash value.";
const SNAP_GAME_DISCLAIMER = "Game score only. No rewards or cash value.";
const databaseUrl = getDatabaseUrl();
const sql = databaseUrl ? neon(databaseUrl) : undefined;
let schemaReady: Promise<void> | undefined;
const memoryScores = new Map<number, PlayerScore>();
const memoryTapTimes = new Map<number, number>();

const snap: SnapFunction = async (ctx) => {
  const base = snapBaseUrlFromRequest(ctx.request);
  const url = new URL(ctx.request.url);
  const requestedAction = url.searchParams.get("action");
  const fid = ctx.action.user?.fid;
  const sharedFid = parseFid(url.searchParams.get(SHARED_PLAYER_PARAM));
  const displayFid = sharedFid ?? fid;
  let didTap = false;

  if (ctx.action.type === "post" && requestedAction === "tap") {
    const username = await getUsername(ctx.action.user.fid);
    const result = await incrementScore(ctx.action.user.fid, username);
    didTap = result.accepted;
    const score = result.score;
    const rank = await getRank(score.fid);
    return playPage({
      base,
      score,
      rank,
      didTap,
      notice: result.accepted
        ? undefined
        : "Easy banana. One tap per second counts.",
    });
  }

  const [score, rank] = await Promise.all([
    displayFid === undefined ? Promise.resolve(undefined) : getScore(displayFid),
    displayFid === undefined ? Promise.resolve(undefined) : getRank(displayFid),
  ]);

  if (requestedAction === "leaderboard") {
    const leaderboard = await getLeaderboard();
    return leaderboardPage({ base, score, leaderboard, rank });
  }

  return playPage({ base, score, rank, didTap });
};

const app = new Hono();
const __dir = dirname(fileURLToPath(import.meta.url));
const fontsDir = join(__dir, "../assets/fonts");

registerSnapHandler(app, snap, {
  fallbackHtml: fallbackHtml(),
  openGraph: {
    title: "Banana Tap",
    description: "Tap to grow your banana price inside a Farcaster Snap.",
  },
  og: {
    fonts: [
      { path: join(fontsDir, "pixelify-sans-400.ttf"), weight: 400 },
      { path: join(fontsDir, "pixelify-sans-600.ttf"), weight: 700 },
    ],
  },
});

export default app;

type PlayerScore = {
  fid: number;
  username: string;
  taps: number;
};

type TapResult = {
  score: PlayerScore;
  accepted: boolean;
};

type PlayPageOptions = {
  base: string;
  score: PlayerScore | undefined;
  rank: number | undefined;
  didTap: boolean;
  notice?: string;
};

type LeaderboardPageOptions = {
  base: string;
  score: PlayerScore | undefined;
  leaderboard: PlayerScore[];
  rank: number | undefined;
};

function playPage({
  base,
  score,
  rank,
  didTap,
  notice,
}: PlayPageOptions): SnapHandlerResult {
  const taps = score?.taps ?? 0;
  const price = priceFromTaps(taps);
  const formattedPrice = formatPrice(price);
  const milestone = nextPriceMilestone(price);
  const username = score?.username ? `@${score.username}` : "Guest mode";
  const scoreDescription =
    notice ??
    `${taps} tap${taps === 1 ? "" : "s"} recorded for ${username}.`;
  const shareUrl = shareUrlFor(base, score);
  const shareText = `I just grew my banana to $${formattedPrice} by playing Banana Tap.\n\nSnap by @0x94t3z.eth`;

  return {
    version: SPEC_VERSION,
    theme: { accent: BRAND_ACCENT },
    effects: didTap ? ["confetti"] : undefined,
    ui: {
      root: "page",
      elements: {
        page: {
          type: "stack",
          props: { gap: "sm" },
          children: [
            "hero-image",
            "score",
            "milestone",
            "actions",
          ],
        },
        "hero-image": {
          type: "image",
          props: {
            url: `${base}${HERO_IMAGE_PATH}?v=${HERO_IMAGE_VERSION}`,
            aspect: "4:3",
            alt: "Banana Tap",
          },
        },
        score: {
          type: "item",
          props: {
            title: `Price $${formattedPrice}`,
            description: scoreDescription,
          },
          children: ["score-badge"],
        },
        "score-badge": {
          type: "badge",
          props: {
            label: rank === undefined ? "Unranked" : `Rank #${rank}`,
            color: "purple",
            icon: "zap",
          },
        },
        milestone: {
          type: "progress",
          props: {
            value: price,
            max: milestone,
            label: `Next milestone $${formattedPrice} / $${formatPrice(milestone)}`,
          },
        },
        actions: {
          type: "stack",
          props: { direction: "horizontal", columns: 3 },
          children: ["tap", "leaderboard", "share"],
        },
        tap: {
          type: "button",
          props: { label: "Tap", variant: "primary", icon: "zap" },
          on: {
            press: {
              action: "submit",
              params: { target: `${base}/?action=tap` },
            },
          },
        },
        leaderboard: {
          type: "button",
          props: { label: "Leaders", icon: "trophy" },
          on: {
            press: {
              action: "submit",
              params: { target: `${base}/?action=leaderboard` },
            },
          },
        },
        share: {
          type: "button",
          props: { label: "Share", icon: "share" },
          on: {
            press: {
              action: "compose_cast",
              params: { text: shareText, embeds: [shareUrl] },
            },
          },
        },
      },
    },
  };
}

function leaderboardPage({
  base,
  score,
  leaderboard,
  rank,
}: LeaderboardPageOptions): SnapHandlerResult {
  const elements: Record<string, SnapElementInput> = {
    page: {
      type: "stack",
      props: { gap: "sm" },
      children: ["title", "subtitle", "leaders", "actions", "disclaimer"],
    },
    title: {
      type: "text",
      props: {
        content: `Top ${LEADERBOARD_LIMIT} Bananas`,
        weight: "bold",
        align: "center",
      },
    },
    subtitle: {
      type: "text",
      props: {
        content: leaderboardSubtitle(score, rank),
        size: "sm",
        align: "center",
      },
    },
    leaders: {
      type: "item_group",
      props: { border: true, separator: true },
      children:
        leaderboard.length > 0
          ? leaderboard.map((_, index) => `leader-${index + 1}`)
          : ["empty"],
    },
    actions: {
      type: "stack",
      props: { direction: "horizontal", columns: 2 },
      children: ["back", "tap"],
    },
    back: {
      type: "button",
      props: { label: "Back", icon: "arrow-left" },
      on: {
        press: {
          action: "submit",
          params: { target: `${base}/` },
        },
      },
    },
    tap: {
      type: "button",
      props: { label: "Tap", variant: "primary", icon: "zap" },
      on: {
        press: {
          action: "submit",
          params: { target: `${base}/?action=tap` },
        },
      },
    },
    disclaimer: {
      type: "text",
      props: {
        content: SNAP_GAME_DISCLAIMER,
        size: "sm",
        align: "center",
      },
    },
  };

  if (leaderboard.length === 0) {
    elements.empty = {
      type: "item",
      props: {
        title: "No taps yet",
        description: "Be the first player on the board.",
      },
    };
  } else {
    leaderboard.forEach((player, index) => {
      const rank = index + 1;
      elements[`leader-${rank}`] = {
        type: "item",
        props: {
          title: `${rank}. @${player.username}`,
          description: `${player.taps} tap${player.taps === 1 ? "" : "s"} · $${formatPrice(priceFromTaps(player.taps))}`,
        },
        children: [`leader-${rank}-badge`],
      };
      elements[`leader-${rank}-badge`] = {
        type: "badge",
        props: { label: `FID ${player.fid}`, color: "purple" },
      };
    });
  }

  return {
    version: SPEC_VERSION,
    theme: { accent: BRAND_ACCENT },
    ui: { root: "page", elements },
  };
}

async function getScore(fid: number): Promise<PlayerScore | undefined> {
  if (!sql) return memoryScores.get(fid);
  await ensureSchema();
  const rows = await sql`
    select fid, username, taps
    from banana_scores
    where fid = ${fid}
  `;
  return toPlayerScore(rows[0]);
}

async function incrementScore(
  fid: number,
  username: string,
): Promise<TapResult> {
  if (!sql) {
    const now = Date.now();
    const current = memoryScores.get(fid);
    const lastTapAt = memoryTapTimes.get(fid);
    if (
      current &&
      lastTapAt !== undefined &&
      now - lastTapAt < TAP_COOLDOWN_MS
    ) {
      return { score: current, accepted: false };
    }

    const next = {
      fid,
      username,
      taps: (current?.taps ?? 0) + 1,
    };
    memoryScores.set(fid, next);
    memoryTapTimes.set(fid, now);
    return { score: next, accepted: true };
  }

  await ensureSchema();
  const rows = await sql`
    insert into banana_scores (fid, username, taps)
    values (${fid}, ${username}, 1)
    on conflict (fid)
    do update set
      username = excluded.username,
      taps = banana_scores.taps + 1,
      updated_at = now()
    where banana_scores.updated_at <= now() - (${TAP_COOLDOWN_MS} * interval '1 millisecond')
    returning fid, username, taps
  `;
  const updatedScore = toPlayerScore(rows[0]);
  if (updatedScore) return { score: updatedScore, accepted: true };

  return {
    score: (await getScore(fid)) ?? { fid, username, taps: 0 },
    accepted: false,
  };
}

async function getLeaderboard(): Promise<PlayerScore[]> {
  if (!sql) {
    return [...memoryScores.values()]
      .sort((a, b) => b.taps - a.taps || a.fid - b.fid)
      .slice(0, LEADERBOARD_LIMIT);
  }

  await ensureSchema();
  const rows = await sql`
    select fid, username, taps
    from banana_scores
    order by taps desc, updated_at asc, fid asc
    limit ${LEADERBOARD_LIMIT}
  `;
  return rows.flatMap((row) => {
    const score = toPlayerScore(row);
    return score ? [score] : [];
  });
}

async function getRank(fid: number): Promise<number | undefined> {
  if (!sql) {
    const index = [...memoryScores.values()]
      .sort((a, b) => b.taps - a.taps || a.fid - b.fid)
      .findIndex((player) => player.fid === fid);
    return index === -1 ? undefined : index + 1;
  }

  await ensureSchema();
  const rows = await sql`
    select rank_position
    from (
      select fid, taps, updated_at
      from banana_scores
      where fid = ${fid}
    ) current_player
    cross join lateral (
      select count(*) + 1 as rank_position
      from banana_scores ranked
      where
        ranked.taps > current_player.taps
        or (
          ranked.taps = current_player.taps
          and (
            ranked.updated_at < current_player.updated_at
            or (
              ranked.updated_at = current_player.updated_at
              and ranked.fid < current_player.fid
            )
          )
        )
    ) player_rank
  `;
  const rank = Number(
    (rows[0] as Record<string, unknown> | undefined)?.rank_position,
  );
  return Number.isInteger(rank) && rank > 0 ? rank : undefined;
}

async function ensureSchema(): Promise<void> {
  if (!sql) return;

  schemaReady ??= createSchema(sql);
  await schemaReady;
}

async function createSchema(db: NeonQueryFunction<false, false>): Promise<void> {
  await db`
    create table if not exists banana_scores (
      fid bigint primary key,
      username text not null,
      taps integer not null default 0,
      updated_at timestamptz not null default now()
    )
  `;
  await db`
    create index if not exists banana_scores_rank_idx
    on banana_scores (taps desc, updated_at asc, fid asc)
  `;
}

function toPlayerScore(row: unknown): PlayerScore | undefined {
  if (!row || typeof row !== "object") return undefined;

  const value = row as Record<string, unknown>;
  const fid = Number(value.fid);
  const taps = Number(value.taps);
  const username = sanitizeUsername(value.username);

  if (!Number.isInteger(fid) || fid < 0 || !Number.isInteger(taps) || taps < 0) {
    return undefined;
  }

  return { fid, username, taps };
}

async function getUsername(fid: number): Promise<string> {
  try {
    const url = new URL(FARCASTER_USER_URL);
    url.searchParams.set("fid", String(fid));
    const response = await fetch(url, { headers: { accept: "application/json" } });
    if (!response.ok) return fallbackUsername(fid);

    const body = (await response.json()) as FarcasterUserResponse;
    return sanitizeUsername(body.result?.user?.username);
  } catch (error) {
    console.warn("Farcaster username lookup failed", error);
    return fallbackUsername(fid);
  }
}

type FarcasterUserResponse = {
  result?: {
    user?: {
      username?: unknown;
    };
  };
};

function sanitizeUsername(value: unknown): string {
  if (typeof value !== "string") return "unknown";

  const username = value.trim().replace(/^@/, "");
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,29}$/.test(username)
    ? username
    : "unknown";
}

function fallbackUsername(fid: number): string {
  return `fid-${fid}`;
}

function parseFid(value: string | null): number | undefined {
  if (!value || !/^\d{1,16}$/.test(value)) return undefined;

  const fid = Number(value);
  return Number.isSafeInteger(fid) && fid > 0 ? fid : undefined;
}

function shareUrlFor(base: string, score: PlayerScore | undefined): string {
  if (!score) return base;

  const url = new URL(base);
  url.searchParams.set(SHARED_PLAYER_PARAM, String(score.fid));
  return url.toString();
}

function leaderboardSubtitle(
  score: PlayerScore | undefined,
  rank: number | undefined,
): string {
  if (!score) return "Tap once to add your username.";

  const taps = `${score.taps} tap${score.taps === 1 ? "" : "s"}`;
  return rank === undefined ? `Your score: ${taps}.` : `Your rank: #${rank} · ${taps}.`;
}

function priceFromTaps(taps: number): number {
  return taps * TAP_INCREMENT;
}

function nextPriceMilestone(price: number): number {
  const nextPreset = PRICE_MILESTONES.find((milestone) => price < milestone);
  if (nextPreset !== undefined) return nextPreset;

  let milestone = PRICE_MILESTONES[PRICE_MILESTONES.length - 1] ?? 100;
  while (price >= milestone) {
    milestone *= 2;
  }
  return milestone;
}

function formatPrice(value: number): string {
  return value.toFixed(2);
}

function getDatabaseUrl(): string | undefined {
  return (
    process.env.NEON_DATABASE_URL?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    undefined
  );
}

function fallbackHtml(): string {
  const title = "Banana Tap";
  const description = "Open this URL in a Farcaster client to play the Snap.";
  const publicBase = process.env.SNAP_PUBLIC_BASE_URL?.trim().replace(/\/$/, "");
  const bananaMetaImage = publicBase
    ? `${publicBase}${BANANA_IMAGE_PATH}`
    : BANANA_IMAGE_PATH;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <meta name="description" content="${description}">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:type" content="website">
  <meta property="og:image" content="${bananaMetaImage}">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${bananaMetaImage}">
  <link rel="preload" href="/fonts/pixelify-sans-400.ttf" as="font" type="font/ttf" crossorigin>
  <link rel="preload" href="/fonts/pixelify-sans-600.ttf" as="font" type="font/ttf" crossorigin>
  <link rel="icon" type="image/png" href="${BANANA_IMAGE_PATH}">
  <link rel="shortcut icon" type="image/png" href="${BANANA_IMAGE_PATH}">
  <link rel="apple-touch-icon" href="${BANANA_IMAGE_PATH}">
  <style>
    @font-face {
      font-family: "Pixelify Sans";
      src: url("/fonts/pixelify-sans-400.ttf") format("truetype");
      font-weight: 400;
    }
    @font-face {
      font-family: "Pixelify Sans";
      src: url("/fonts/pixelify-sans-600.ttf") format("truetype");
      font-weight: 600;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      background: ${BRAND_BG};
      color: ${BRAND_TEXT};
      font-family: "Pixelify Sans", system-ui, sans-serif;
      text-align: center;
      padding: 32px;
    }
    main {
      display: grid;
      gap: clamp(10px, 1.6vw, 20px);
      justify-items: center;
      transform: translateY(-2vh);
    }
    h1,
    p {
      margin: 0;
      text-wrap: balance;
    }
    h1 {
      font-size: clamp(32px, 4.2vw, 58px);
      font-weight: 600;
      letter-spacing: 0;
      line-height: 1;
    }
    .banana {
      width: min(400px, 62vw);
      height: auto;
      image-rendering: pixelated;
    }
    .tap {
      display: flex;
      align-items: center;
      gap: clamp(16px, 2.4vw, 34px);
      font-size: clamp(32px, 4.2vw, 58px);
      font-weight: 600;
      line-height: 1;
    }
    .arrow {
      transform: translateY(-0.04em);
    }
    .credit {
      font-size: clamp(14px, 1.6vw, 22px);
      font-weight: 600;
    }
    .hint {
      margin-top: clamp(28px, 5vw, 58px);
      max-width: 460px;
      font-size: clamp(16px, 1.8vw, 24px);
      font-weight: 600;
      line-height: 1.2;
    }
    .disclaimer {
      max-width: 460px;
      color: rgba(245, 254, 255, 0.58);
      font-size: clamp(10px, 1vw, 14px);
      font-weight: 400;
      line-height: 1.35;
    }
  </style>
</head>
<body>
  <main>
    <h1>BANANA</h1>
    <img class="banana" src="${BANANA_IMAGE_PATH}" alt="Pixel banana">
    <p class="tap"><span>TAP</span><span class="arrow">↑</span></p>
    <p class="credit">Snap by @0x94t3z.eth</p>
    <p class="hint">${description}</p>
    <p class="disclaimer">${GAME_DISCLAIMER}</p>
  </main>
</body>
</html>`;
}

function snapBaseUrlFromRequest(request: Request): string {
  const fromEnv = process.env.SNAP_PUBLIC_BASE_URL?.trim();
  if (fromEnv) return fromEnv.replace(/\/$/, "");

  const forwardedHost = request.headers.get("x-forwarded-host");
  const hostHeader = request.headers.get("host");
  const host = (forwardedHost ?? hostHeader)?.split(",")[0]?.trim();
  const isLoopback =
    host !== undefined &&
    /^(localhost|127\.0\.0\.1|\[::1\]|::1)(:\d+)?$/.test(host);
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const proto = forwardedProto
    ? forwardedProto.split(",")[0]?.trim().toLowerCase()
    : isLoopback
      ? "http"
      : "https";

  if (host && proto) {
    return `${proto}://${host}`.replace(/\/$/, "");
  }

  return `http://localhost:${process.env.PORT ?? "3003"}`;
}
