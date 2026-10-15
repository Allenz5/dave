// Shared by filter.mjs and refine.mjs: Supabase REST with the service key, Claude calls, prompt files.
import { spawn } from "child_process";
import { existsSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

export const DIR = dirname(fileURLToPath(import.meta.url));
const ENV = Object.fromEntries(
  readFileSync(join(DIR, "../.env"), "utf8").split("\n").filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()])
);
const KEY = ENV.SUPABASE_SERVICE_ROLE_KEY;
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

export async function rest(path, init) {
  const res = await fetch(`${ENV.SUPABASE_URL}/rest/v1/${path}`, { ...init, headers: { ...headers, ...init?.headers } });
  if (!res.ok) throw new Error(`${path}: ${res.status} ${await res.text()}`);
  const body = await res.text();
  return body ? JSON.parse(body) : null;
}

export const MODEL = "claude-opus-5-5";

// One `claude -p` run. With a schema it returns the parsed structured output, otherwise the text.
export function claude(prompt, { schema, tools = [] } = {}) {
  const args = ["-p", "--model", MODEL, "--output-format", "json", "--allowedTools", ...(tools.length ? tools : ["Read"])];
  if (schema) args.push("--json-schema", JSON.stringify(schema));
  return new Promise((resolve, reject) => {
    const child = spawn("claude", args, { stdio: ["pipe", "pipe", "pipe"] });
    let out = "", err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(`claude exited ${code}: ${err.slice(-300)}`));
      const res = JSON.parse(out);
      if (res.is_error) return reject(new Error(`claude: ${res.result}`));
      resolve(schema ? res.structured_output : res.result.trim());
    });
    child.stdin.end(prompt);
  });
}

// Fills {{name}} slots in prompts/<file>.md
export const prompt = (file, vars) =>
  readFileSync(join(DIR, "prompts", `${file}.md`), "utf8").replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? "");

export const readJsonl = (file) =>
  existsSync(file) ? readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];

export const poolOf = (topic) => join(DIR, `pool_${topic}.jsonl`);

// A collected post as the agents read it: text, thread, quote, links and media summaries.
export function formatPost(p) {
  const parts = [`@${p.author} · ${p.posted_at ?? p.collected_at} · ${p.url}`, p.text];
  if (p.thread?.length) parts.push(`Thread continues:\n${p.thread.join("\n\n")}`);
  if (p.context) parts.push(`Quoted post: ${p.context}`);
  for (const l of p.links ?? []) parts.push(`Link ${l.url}:\n${String(l.content).slice(0, 4000)}`);
  if (p.media_summary) parts.push(`Media: ${p.media_summary}`);
  return parts.join("\n\n");
}
