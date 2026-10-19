#!/usr/bin/env node
// dave-x: reads X for a dave agent, in the user's own logged-in browser on this machine.
//   dave-x          runs the MCP server on stdio
//   dave-x login    opens a window to log in to X once
import { readFileSync } from "fs";
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";
import { prepare, transcriptionReady } from "./audio.mjs";
import { close, installChromium, loggedIn, login } from "./browser.mjs";
import { log } from "./home.mjs";
import { forYou, readPost, searchLatest } from "./x.mjs";

const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

if (process.argv[2] === "login") {
  console.log("Log in to X in the window that opens. It closes on its own once you're in.");
  const ok = await login();
  console.log(ok ? "Logged in." : "Not logged in after 5 minutes. Run `dave-x login` again.");
  process.exit(ok ? 0 : 1);
}

const json = (value) => ({ content: [{ type: "text", text: JSON.stringify(value) }] });

// Chromium, the Whisper model and yt-dlp download in the background, so the server answers at once
installChromium().catch((e) => log(e.message));
prepare();

serveStdio(() => {
  const server = new McpServer({ name: "dave-x", version });

  server.registerTool(
    "status",
    {
      description: "dave-x's version, whether it is logged in to X, and whether audio transcription is ready",
      annotations: { readOnlyHint: true },
    },
    async () => json({ version, logged_in: loggedIn(), transcription_ready: transcriptionReady() })
  );

  let loggingIn = null;
  server.registerTool(
    "login",
    { description: "Open a window on this machine for the user to log in to X. Returns at once; check status afterwards." },
    async () => {
      loggingIn ??= login()
        .catch((e) => log(`login failed: ${e.message}`))
        .finally(() => (loggingIn = null));
      return json({ opened: true, note: "Ask the user to log in to X in the window that opened; it closes itself once they are in." });
    }
  );

  server.registerTool(
    "search_latest",
    {
      description:
        "Search X's latest posts for one keyword of a dave collect task. Returns only post ids and posting times, newest first.",
      inputSchema: z.object({
        search: z.object({ url: z.string(), q: z.string() }).describe("The collect task's params.search"),
        query: z.string().describe("The keyword's query"),
        since: z.string().nullable().describe("The keyword's since: stop at posts no newer than this"),
        max_posts: z.number().int().min(1).max(100),
        max_consecutive_old_posts: z.number().int().min(1).default(1).describe("The task's params.stop.max_consecutive_old_posts"),
        skip: z.array(z.string()).default([]).describe("The task's params.skip"),
      }),
      annotations: { readOnlyHint: true },
    },
    async (args) => json(await searchLatest(args))
  );

  server.registerTool(
    "for_you",
    {
      description:
        "The posts X recommends to the logged-in account, from the For you tab of its home timeline, in the order shown. Returns only post ids and posting times.",
      inputSchema: z.object({
        max_posts: z.number().int().min(1).max(100),
        skip: z.array(z.string()).default([]).describe("Posts to leave out: ads, non_english"),
      }),
      annotations: { readOnlyHint: true },
    },
    async (args) => json(await forYou(args))
  );

  server.registerTool(
    "read_post",
    {
      description:
        "Read one X post in full: text, the author's thread continuation, the quoted post, linked pages, images (local files to look at) and transcripts of its audio. Returns {skipped: reason} when the post can't be judged on its own.",
      inputSchema: z.object({ id: z.string().regex(/^\d+$/).describe("The X post id") }),
      annotations: { readOnlyHint: true },
    },
    async ({ id }) => json(await readPost(id))
  );

  return server;
}, { onerror: (e) => log(e.message) });

// The agent ends the server by closing stdin or signalling; the browser goes with it
const exit = () => close().finally(() => process.exit(0));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, exit);
process.stdin.on("end", exit);
