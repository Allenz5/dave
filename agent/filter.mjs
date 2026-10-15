// Screens each new post in pool_<topic>.jsonl with the channel's filter prompt, looking up what the post leaves out by web search when it's too thin to judge;
// a kept post that needed a search gets a short note of what the search found, with its sources. Every kept post gets a title.
// After each channel's batch, its posts are checked against the channel's kept posts collected today; posts telling
// the same story are merged into the first collected one: the others are deleted and their X links join its sources.
// Kept posts go into the channel; a few random dropped ones go in too (5% of the kept count), marked, so the reader
// can catch wrong drops. Every decision is logged to filter_log.jsonl and never redone. Usage: node filter.mjs [limit per channel]
import { appendFileSync } from "fs";
import { join } from "path";
import { claude, DIR, formatPost, poolOf, prompt, readJsonl, rest } from "./lib.mjs";

const DROPPED_PER_KEPT = 0.05;
const MAX_EXPLORE = 5;
const LOG = join(DIR, "filter_log.jsonl");
const limit = Number(process.argv[2] ?? Infinity);

const decision = (options) => ({
  type: "object",
  properties: {
    decision: { enum: options },
    reason: { type: "string" },
    ...(options.includes("explore") && { explore: { type: "string", description: "What to search for, when decision is explore" } }),
  },
  required: ["decision", "reason"],
});

const NOTE = {
  type: "object",
  properties: {
    note: { type: "string", maxLength: 280 },
    sources: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 3 },
  },
  required: ["note", "sources"],
};

const TITLE = { type: "object", properties: { title: { type: "string", maxLength: 100 } }, required: ["title"] };

const GROUPS = {
  type: "object",
  properties: { groups: { type: "array", items: { type: "array", items: { type: "integer" }, minItems: 2 } } },
  required: ["groups"],
};

// Each pass may ask to explore again, up to MAX_EXPLORE searches; after the last one it must decide.
async function screen(filterPrompt, post) {
  const vars = { prompt: filterPrompt, post: formatPost(post) };
  const explore = [];
  const findings = [];
  for (;;) {
    const canExplore = explore.length < MAX_EXPLORE;
    const d = await claude(
      prompt("filter", {
        ...vars,
        findings: findings.map((f, i) => `\n<search_findings query="${explore[i]}">\n${f}\n</search_findings>\n`).join(""),
      }),
      { schema: decision(canExplore ? ["yes", "no", "explore"] : ["yes", "no"]) }
    );
    if (d.decision === "explore") {
      explore.push(d.explore);
      findings.push(await claude(prompt("explore", { ...vars, explore: d.explore }), { tools: ["WebSearch", "WebFetch"] }));
      continue;
    }
    if (!explore.length) return { decision: d.decision, reason: d.reason };
    const searched = { ...d, explore, findings };
    if (d.decision !== "yes") return searched;
    // A kept post that needed searching gets a short note with what the search found, and its sources
    const { note, sources } = await claude(prompt("note", { post: vars.post, findings: findings.join("\n\n") }), { schema: NOTE });
    return { ...searched, note, sources };
  }
}

// Merges the batch's posts into today's kept posts that tell the same story. The agent only says which ones; the first collected stays.
async function dedup(channelId, batch) {
  if (!batch.length) return;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const titled = await rest(
    `posts?select=id,title,sources,embed_id&channel_id=eq.${channelId}&filter_decision=eq.kept&title=not.is.null&collected_at=gte.${today.toISOString()}&order=collected_at,id`,
  );
  if (titled.length < 2) return;
  const fresh = new Set(batch.map((p) => p.id));
  const titles = titled.map((p, i) => `${i + 1}. ${p.title}`).join("\n");
  const { groups } = await claude(prompt("dedup", { titles }), { schema: GROUPS });
  for (const group of groups) {
    const [keep, ...merged] = [...new Set(group)].sort((a, b) => a - b).map((n) => titled[n - 1]).filter(Boolean);
    // Earlier posts among themselves were compared by earlier runs
    if (!keep || !merged.length || ![keep, ...merged].some((p) => fresh.has(p.id))) continue;
    const sources = [...keep.sources, ...merged.map((p) => `https://x.com/i/status/${p.embed_id}`)];
    await rest(`posts?id=eq.${keep.id}`, { method: "PATCH", body: JSON.stringify({ sources }) });
    await rest(`posts?id=in.(${merged.map((p) => p.id)})`, { method: "DELETE" });
    keep.sources = sources;
    console.log(`merged ${merged.map((p) => p.title).join(" | ")} into ${keep.title}`);
  }
}

const done = new Set(readJsonl(LOG).map((d) => `${d.topic}:${d.id}`));
const channels = await rest("channels?select=id,slug,strategy(filter_prompt)");
for (const { id: channelId, slug, strategy } of channels) {
  if (!strategy) continue;
  // Posts already in the channel were screened there or went in before filtering existed
  const stored = new Set((await rest(`posts?select=embed_id&channel_id=eq.${channelId}&embed_provider=eq.x`)).map((p) => p.embed_id));
  const todo = readJsonl(poolOf(slug)).filter((p) => !done.has(`${slug}:${p.id}`) && !stored.has(p.id)).slice(0, limit);
  const insert = (post, d) =>
    rest("posts?on_conflict=channel_id,embed_provider,embed_id&select=id,title,sources,embed_id", {
      method: "POST",
      headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
      body: JSON.stringify({
        channel_id: channelId,
        title: d.title ?? null,
        body: d.note ?? "",
        sources: d.sources ?? [],
        embed_provider: "x",
        embed_id: post.id,
        created_at: post.posted_at ?? post.collected_at,
        collected_at: post.collected_at,
        filter_decision: d.decision === "yes" ? "kept" : "dropped",
        filter_reason: d.reason,
      }),
    });
  const batch = [];
  const dropped = [];
  for (const post of todo) {
    let d;
    try {
      d = await screen(strategy.filter_prompt, post);
    } catch (e) {
      console.error(`${slug} ${post.id}: ${e.message}`);
      continue;
    }
    if (d.decision === "yes") {
      try {
        d.title = (await claude(prompt("title", { post: formatPost(post) }), { schema: TITLE })).title;
      } catch (e) {
        console.error(`${slug} ${post.id} title: ${e.message}`);
      }
      batch.push(...(await insert(post, d)));
    } else dropped.push([post, d]);
    appendFileSync(LOG, JSON.stringify({ topic: slug, id: post.id, ...d, at: new Date().toISOString() }) + "\n");
    console.log(`${slug} ${post.id}: ${d.decision}${d.explore ? ` (explored: ${d.explore.join(" | ")})` : ""} - ${d.reason}`);
  }
  const kept = batch.length;
  await dedup(channelId, batch);
  // 5% of the kept count, the fraction rounded up or down at random so small runs still sample on average
  const share = kept * DROPPED_PER_KEPT;
  const sample = Math.floor(share) + (Math.random() < share % 1);
  for (const [post, d] of dropped.sort(() => Math.random() - 0.5).slice(0, sample)) await insert(post, d);
  console.log(`${slug}: ${kept} of ${todo.length} kept, ${Math.min(sample, dropped.length)} dropped sampled in`);
}
