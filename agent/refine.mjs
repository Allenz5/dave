// Rewrites a channel's filter prompt from the reader's labels (the owner's votes and feedback in the feed), in the shared
// template, and revises its search keywords from what each one brought in; both apply directly. Only posts whose label
// isn't learned yet are read (posts.learned): the prompt already holds what the others taught. Each change is logged to
// refine_log.jsonl. Usage: node refine.mjs <channel slug>
import { appendFileSync, readFileSync } from "fs";
import { join } from "path";
import { claude, DIR, formatPost, poolOf, prompt, readJsonl, rest } from "./lib.mjs";

const slug = process.argv[2];
if (!slug) throw new Error("usage: node refine.mjs <channel slug>");

const [channel] = await rest(`channels?select=id,strategy(filter_prompt),search_keywords(id,query)&slug=eq.${slug}`);
const pool = new Map(readJsonl(poolOf(slug)).map((p) => [p.id, p]));
const posts = await rest(
  `posts?select=id,embed_id,filter_decision,filter_reason,score,learned,feedback(body)&channel_id=eq.${channel.id}`
);
const fresh = posts.filter((p) => pool.has(p.embed_id) && (p.score !== 0 || p.feedback) && !p.learned);
const labeled = fresh
  .map((p, i) =>
    [
      `<labeled_post n="${i + 1}">`,
      formatPost(pool.get(p.embed_id)),
      `Found by keyword: ${pool.get(p.embed_id).source.replace(/^search:/, "")}`,
      `Filter: ${p.filter_decision ? `${p.filter_decision} - ${p.filter_reason}` : "not filtered"}`,
      `Reader vote: ${Math.sign(p.score)}`,
      ...(p.feedback ? [`Reader feedback: ${p.feedback.body}`] : []),
      "</labeled_post>",
    ].join("\n")
  );
if (!labeled.length) {
  console.log(`${slug}: no new labels since the last refine`);
  process.exit(0);
}

// What each keyword brought in: posts collected (in all, in the last 3 days, and posted over a day before collection),
// kept by the filter, and voted up or down by the reader
const DAY = 86400_000;
const kept = new Set(readJsonl(join(DIR, "filter_log.jsonl")).filter((d) => d.topic === slug && d.decision === "yes").map((d) => d.id));
const vote = new Map(posts.map((p) => [p.embed_id, Math.sign(p.score)]));
const keywords = channel.search_keywords.map(({ query }) => {
  const found = [...pool.values()].filter((p) => p.source === `search:${query}`);
  const count = (f) => found.filter(f).length;
  const recent = count((p) => Date.now() - new Date(p.collected_at) < 3 * DAY);
  const stale = count((p) => p.posted_at && new Date(p.collected_at) - new Date(p.posted_at) > DAY);
  return `- ${query}: ${found.length} collected (${recent} in the last 3 days, ${stale} posted over a day before collection), ${count((p) => kept.has(p.id))} kept, ${count((p) => vote.get(p.id) === 1)} up, ${count((p) => vote.get(p.id) === -1)} down`;
});

const old = channel.strategy.filter_prompt;
const out = await claude(
  prompt("refine", {
    prompt: old,
    posts: labeled.join("\n\n"),
    template: readFileSync(join(DIR, "prompts/template.md"), "utf8"),
    keywords: keywords.join("\n"),
  }),
  {
    schema: {
      type: "object",
      properties: {
        prompt: { type: "string" },
        changes: { type: "array", items: { type: "string" } },
        keywords: { type: "array", items: { type: "string" }, minItems: 1 },
        keyword_changes: { type: "array", items: { type: "string" } },
      },
      required: ["prompt", "changes", "keywords", "keyword_changes"],
    },
  }
);

await rest(`strategy?channel_id=eq.${channel.id}`, { method: "PATCH", body: JSON.stringify({ filter_prompt: out.prompt }) });
const removed = channel.search_keywords.filter((k) => !out.keywords.includes(k.query));
const added = out.keywords.filter((q) => !channel.search_keywords.some((k) => k.query === q));
if (removed.length) await rest(`search_keywords?id=in.(${removed.map((k) => k.id)})`, { method: "DELETE" });
if (added.length)
  await rest("search_keywords", { method: "POST", body: JSON.stringify(added.map((query) => ({ channel_id: channel.id, query }))) });
await rest(`posts?id=in.(${fresh.map((p) => p.id)})`, { method: "PATCH", body: JSON.stringify({ learned: true }) });
appendFileSync(
  join(DIR, "refine_log.jsonl"),
  JSON.stringify({ channel: slug, at: new Date().toISOString(), labeled: labeled.length, old, old_keywords: channel.search_keywords.map((k) => k.query), ...out }) + "\n"
);
const list = (lines) => lines.map((c) => `- ${c}`).join("\n");
console.log(`${slug}: prompt updated from ${labeled.length} new labels\n${list(out.changes)}\nkeywords:\n${list(out.keyword_changes)}`);
