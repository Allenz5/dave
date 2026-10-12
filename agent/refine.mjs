// Rewrites a channel's filter prompt from the reader's labels (votes and comments in the feed), in the shared
// template, and applies it directly. Each change is logged to refine_log.jsonl. Usage: node refine.mjs <channel slug>
import { appendFileSync, readFileSync } from "fs";
import { join } from "path";
import { claude, DIR, formatPost, poolOf, prompt, readJsonl, rest } from "./lib.mjs";

const slug = process.argv[2];
if (!slug) throw new Error("usage: node refine.mjs <channel slug>");

const [channel] = await rest(`channels?select=id,strategy(filter_prompt)&slug=eq.${slug}`);
const pool = new Map(readJsonl(poolOf(slug)).map((p) => [p.id, p]));
const posts = await rest(
  `posts?select=embed_id,filter_decision,filter_reason,score,comments(body)&channel_id=eq.${channel.id}&or=(score.neq.0,comment_count.gt.0)`
);
const labeled = posts
  .filter((p) => pool.has(p.embed_id))
  .map((p, i) =>
    [
      `<labeled_post n="${i + 1}">`,
      formatPost(pool.get(p.embed_id)),
      `Filter: ${p.filter_decision ? `${p.filter_decision} - ${p.filter_reason}` : "not filtered"}`,
      `Reader vote: ${Math.sign(p.score)}`,
      ...p.comments.map((c) => `Reader comment: ${c.body}`),
      "</labeled_post>",
    ].join("\n")
  );
if (!labeled.length) throw new Error(`${slug}: no labeled posts`);

const old = channel.strategy.filter_prompt;
const out = await claude(
  prompt("refine", { prompt: old, posts: labeled.join("\n\n"), template: readFileSync(join(DIR, "prompts/template.md"), "utf8") }),
  {
    schema: {
      type: "object",
      properties: { prompt: { type: "string" }, changes: { type: "array", items: { type: "string" } } },
      required: ["prompt", "changes"],
    },
  }
);

await rest(`strategy?channel_id=eq.${channel.id}`, { method: "PATCH", body: JSON.stringify({ filter_prompt: out.prompt }) });
appendFileSync(join(DIR, "refine_log.jsonl"), JSON.stringify({ channel: slug, at: new Date().toISOString(), labeled: labeled.length, old, ...out }) + "\n");
console.log(`${slug}: prompt updated from ${labeled.length} labeled posts\n${out.changes.map((c) => `- ${c}`).join("\n")}`);
