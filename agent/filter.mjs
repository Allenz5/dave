// Screens each new post in pool_<topic>.jsonl with the channel's filter prompt, verifying by web search when needed.
// Kept posts go into the channel; a small random share of dropped ones go in too, marked, so the reader can catch
// wrong drops. Every decision is logged to filter_log.jsonl and never redone. Usage: node filter.mjs [limit per channel]
import { appendFileSync } from "fs";
import { join } from "path";
import { claude, DIR, formatPost, poolOf, prompt, readJsonl, rest } from "./lib.mjs";

const DROPPED_SHARE = 0.1;
const LOG = join(DIR, "filter_log.jsonl");
const limit = parseInt(process.argv[2] ?? "Infinity");

const decision = (options) => ({
  type: "object",
  properties: {
    decision: { enum: options },
    reason: { type: "string" },
    ...(options.includes("explore") && { explore: { type: "string", description: "What to search for, when decision is explore" } }),
  },
  required: ["decision", "reason"],
});

// First pass may ask to explore; after web search the second pass must decide.
async function screen(filterPrompt, post) {
  const vars = { prompt: filterPrompt, post: formatPost(post) };
  const first = await claude(prompt("filter", vars), { schema: decision(["yes", "no", "explore"]) });
  if (first.decision !== "explore") return first;
  const findings = await claude(prompt("explore", { ...vars, explore: first.explore }), { tools: ["WebSearch", "WebFetch"] });
  const final = await claude(
    prompt("filter", { ...vars, findings: `\n<search_findings query="${first.explore}">\n${findings}\n</search_findings>\n` }),
    { schema: decision(["yes", "no"]) }
  );
  return { ...final, explore: first.explore, findings };
}

const done = new Set(readJsonl(LOG).map((d) => `${d.topic}:${d.id}`));
const channels = await rest("channels?select=id,slug,strategy(filter_prompt)");
for (const { id: channelId, slug, strategy } of channels) {
  if (!strategy) continue;
  const todo = readJsonl(poolOf(slug)).filter((p) => !done.has(`${slug}:${p.id}`)).slice(0, limit);
  let kept = 0;
  for (const post of todo) {
    let d;
    try {
      d = await screen(strategy.filter_prompt, post);
    } catch (e) {
      console.error(`${slug} ${post.id}: ${e.message}`);
      continue;
    }
    const keep = d.decision === "yes";
    if (keep || Math.random() < DROPPED_SHARE) {
      await rest("posts?on_conflict=channel_id,embed_provider,embed_id", {
        method: "POST",
        headers: { Prefer: "resolution=ignore-duplicates,return=minimal" },
        body: JSON.stringify({
          channel_id: channelId,
          author_name: post.author,
          title: null,
          body: "",
          embed_provider: "x",
          embed_id: post.id,
          created_at: post.posted_at ?? post.collected_at,
          filter_decision: keep ? "kept" : "dropped",
          filter_reason: d.reason,
        }),
      });
    }
    appendFileSync(LOG, JSON.stringify({ topic: slug, id: post.id, ...d, at: new Date().toISOString() }) + "\n");
    kept += keep;
    console.log(`${slug} ${post.id}: ${d.decision}${d.explore ? ` (explored: ${d.explore})` : ""} - ${d.reason}`);
  }
  console.log(`${slug}: ${kept} of ${todo.length} kept`);
}
