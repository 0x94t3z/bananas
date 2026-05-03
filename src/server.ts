import "dotenv/config";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import app from "./index.js";

const port = Number(process.env.PORT ?? "3003");

app.use("/images/*", serveStatic({ root: "./public" }));
app.use("/fonts/*", serveStatic({ root: "./assets" }));

serve({ fetch: app.fetch, port });

console.log(`Banana Tap snap listening on http://localhost:${port}`);
