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
const PROGRESS_MAX = 10;
const LEADERBOARD_LIMIT = 5;
const FARCASTER_USER_URL = "https://api.farcaster.xyz/v2/user";
const BANANA_IMAGE_PATH = "/images/bananas.png";
const databaseUrl = getDatabaseUrl();
const sql = databaseUrl ? neon(databaseUrl) : undefined;
let schemaReady: Promise<void> | undefined;
const memoryScores = new Map<number, PlayerScore>();

const snap: SnapFunction = async (ctx) => {
  const base = snapBaseUrlFromRequest(ctx.request);
  const url = new URL(ctx.request.url);
  const requestedAction = url.searchParams.get("action");
  const fid = ctx.action.user?.fid;
  let didTap = false;

  if (ctx.action.type === "post" && requestedAction === "tap") {
    didTap = true;
    const username = await getUsername(ctx.action.user.fid);
    const score = await incrementScore(ctx.action.user.fid, username);
    const leaderboard = await getLeaderboard();
    return playPage({ base, score, leaderboard, didTap });
  }

  const score = fid === undefined ? undefined : await getScore(fid);
  const leaderboard = await getLeaderboard();

  if (requestedAction === "leaderboard") {
    return leaderboardPage({ base, score, leaderboard });
  }

  return playPage({ base, score, leaderboard, didTap });
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

type PlayPageOptions = {
  base: string;
  score: PlayerScore | undefined;
  leaderboard: PlayerScore[];
  didTap: boolean;
};

type LeaderboardPageOptions = {
  base: string;
  score: PlayerScore | undefined;
  leaderboard: PlayerScore[];
};

function playPage({
  base,
  score,
  leaderboard,
  didTap,
}: PlayPageOptions): SnapHandlerResult {
  const taps = score?.taps ?? 0;
  const price = priceFromTaps(taps);
  const formattedPrice = formatPrice(price);
  const progress = Math.min(price, PROGRESS_MAX);
  const username = score?.username ? `@${score.username}` : "Guest mode";
  const rank = rankFor(score, leaderboard);
  const subtitle =
    score === undefined
      ? "Tap once to join the leaderboard."
      : didTap
        ? "Nice tap. The leaderboard noticed."
        : "Tap to grow your banana price.";
  const shareText = `I just grew my banana to $${formattedPrice} by playing Banana Tap.`;

  return {
    version: SPEC_VERSION,
    theme: { accent: "amber" },
    effects: didTap ? ["confetti"] : undefined,
    ui: {
      root: "page",
      elements: {
        page: {
          type: "stack",
          props: { gap: "md" },
          children: [
            "title",
            "banana-image",
            "subtitle",
            "score",
            "growth",
            "actions",
            "leaderboard-preview",
          ],
        },
        title: {
          type: "text",
          props: { content: "Banana Tap", weight: "bold", align: "center" },
        },
        "banana-image": {
          type: "image",
          props: {
            url: `${base}${BANANA_IMAGE_PATH}`,
            aspect: "1:1",
            alt: "Banana Tap banana",
          },
        },
        subtitle: {
          type: "text",
          props: { content: subtitle, size: "sm", align: "center" },
        },
        score: {
          type: "item",
          props: {
            title: `Price $${formattedPrice}`,
            description: `${taps} tap${taps === 1 ? "" : "s"} recorded for ${username}.`,
          },
          children: ["score-badge"],
        },
        "score-badge": {
          type: "badge",
          props: {
            label: rank === undefined ? "Unranked" : `Rank #${rank}`,
            color: "amber",
            icon: "zap",
          },
        },
        growth: {
          type: "progress",
          props: {
            value: progress,
            max: PROGRESS_MAX,
            label: `Growth ${formatPrice(progress)} / ${PROGRESS_MAX}`,
          },
        },
        actions: {
          type: "stack",
          props: { direction: "horizontal" },
          children: ["tap", "leaderboard", "share"],
        },
        tap: {
          type: "button",
          props: { label: "Tap", variant: "primary", icon: "plus" },
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
              params: { text: shareText, embeds: [base] },
            },
          },
        },
        "leaderboard-preview": {
          type: "text",
          props: {
            content: leaderboardSummary(leaderboard),
            size: "sm",
            align: "center",
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
}: LeaderboardPageOptions): SnapHandlerResult {
  const elements: Record<string, SnapElementInput> = {
    page: {
      type: "stack",
      props: { gap: "md" },
      children: ["title", "subtitle", "leaders", "actions"],
    },
    title: {
      type: "text",
      props: { content: "Top Bananas", weight: "bold", align: "center" },
    },
    subtitle: {
      type: "text",
      props: {
        content:
          score === undefined
            ? "Tap once to add your username."
            : `Your score: ${score.taps} tap${score.taps === 1 ? "" : "s"}.`,
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
      props: { direction: "horizontal" },
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
      props: { label: "Tap", variant: "primary", icon: "plus" },
      on: {
        press: {
          action: "submit",
          params: { target: `${base}/?action=tap` },
        },
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
        props: { label: `FID ${player.fid}`, color: "amber" },
      };
    });
  }

  return {
    version: SPEC_VERSION,
    theme: { accent: "amber" },
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
): Promise<PlayerScore> {
  if (!sql) {
    const current = memoryScores.get(fid);
    const next = {
      fid,
      username,
      taps: (current?.taps ?? 0) + 1,
    };
    memoryScores.set(fid, next);
    return next;
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
    returning fid, username, taps
  `;
  return toPlayerScore(rows[0]) ?? { fid, username, taps: 1 };
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

function rankFor(
  score: PlayerScore | undefined,
  leaderboard: PlayerScore[],
): number | undefined {
  if (!score) return undefined;

  const index = leaderboard.findIndex((player) => player.fid === score.fid);
  return index === -1 ? undefined : index + 1;
}

function leaderboardSummary(leaderboard: PlayerScore[]): string {
  if (leaderboard.length === 0) return "Leaderboard is empty. First tap wins.";

  return leaderboard
    .slice(0, 3)
    .map((player, index) => `${index + 1}. @${player.username} ${player.taps}`)
    .join("   ");
}

function priceFromTaps(taps: number): number {
  return taps * TAP_INCREMENT;
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
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Banana Tap</title>
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
      background: rgb(93, 71, 154);
      color: rgb(245, 254, 255);
      font-family: "Pixelify Sans", system-ui, sans-serif;
      text-align: center;
      padding: 32px;
    }
    main { display: grid; gap: 18px; justify-items: center; }
    h1 { margin: 0; font-size: 56px; font-weight: 600; line-height: .9; }
    p { margin: 0; font-size: 24px; max-width: 420px; }
    img { width: min(256px, 70vw); height: auto; }
  </style>
</head>
<body>
  <main>
    <h1>BANANA<br>TAP</h1>
    <img src="/images/bananas.png" alt="Banana Tap banana">
    <p>Open this URL in a Farcaster client to play the Snap.</p>
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
