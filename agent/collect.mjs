// Searches X's latest posts for each topic's keywords into pool_<topic>.jsonl; filter.mjs then screens them into Supabase. Usage: node collect.mjs [posts per keyword]
import { createRequire } from "module";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "fs";
import { spawn } from "child_process";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { rest } from "./lib.mjs";

const X = "/Users/allenzhang/workspace/claude-toolkit/servers/x";
process.env.AUTH_DIR = join(X, ".auth");
const require = createRequire(import.meta.url);
const { getAuthenticatedPage } = require(join(X, "dist/behaviors/login.js"));
const { scrapePosts, waitForTwitterReady, dismissPopups } = require(join(X, "dist/scrapers/index.js"));

// Each channel's search keywords, which refine.mjs keeps up to date
const TOPICS = {};
for (const { query, channel } of await rest("search_keywords?select=query,channel:channels(slug)&order=id")) {
  (TOPICS[channel.slug] ??= []).push(query);
}
const DIR = dirname(fileURLToPath(import.meta.url));
const MEDIA = join(DIR, "media");
mkdirSync(MEDIA, { recursive: true });

const perKeyword = parseInt(process.argv[2] ?? "10");
const jobs = Object.entries(TOPICS).flatMap(([topic, keywords]) =>
  keywords.map((q) => ({ topic, source: `search:${q}`, run: (page) => searchLatest(page, q, perKeyword) }))
);

const poolOf = (topic) => join(DIR, `pool_${topic}.jsonl`);
// Post ids already in each topic's pool
const seen = Object.fromEntries(Object.keys(TOPICS).map((topic) => [topic, new Set(
  existsSync(poolOf(topic)) ? readFileSync(poolOf(topic), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l).id) : []
)]));
// X's Latest tab, English only, no replies.
async function searchLatest(page, query, n) {
  await page.goto(`https://x.com/search?q=${encodeURIComponent(`${query} lang:en -filter:replies`)}&src=typed_query&f=live`);
  await waitForTwitterReady(page);
  await dismissPopups(page);
  await page.waitForSelector('section[role="region"]', { timeout: 10000 }).catch(() => {});
  return scrapePosts(page, { maxPosts: n });
}

// lang:en isn't exact, so also drop posts with mostly non-ASCII letters.
const isEnglish = (text) => {
  const letters = text.match(/\p{L}/gu) ?? [];
  return letters.length === 0 || letters.filter((c) => c < "\u0080").length / letters.length > 0.8;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pace = () => sleep(5000 + Math.random() * 5000);

// Reads every post on the current page. An X Article's body sits inline in its post;
// a quoted post shows as a clickable card holding its own tweetText.
const readPosts = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('article[data-testid="tweet"]')].map((a) => {
      const href = a.querySelector('a[href*="/status/"] time')?.closest("a")?.getAttribute("href") ?? "";
      const texts = [...a.querySelectorAll('[data-testid="tweetText"]')];
      const title = a.querySelector('[data-testid="twitter-article-title"]')?.innerText;
      const body = a.querySelector('[data-testid="twitterArticleRichTextView"]')?.innerText;
      return {
        id: href.match(/status\/(\d+)/)?.[1],
        author: href.split("/")[1],
        text: title ? `${title}\n\n${body ?? ""}` : texts.find((t) => !t.closest('div[role="link"]'))?.innerText ?? "",
        hasQuote: texts.some((t) => t.closest('div[role="link"]')),
        images: [...a.querySelectorAll('[data-testid="tweetPhoto"] img')]
          .filter((i) => !i.closest('div[role="link"], [data-testid="videoPlayer"]'))
          .map((i) => i.src.replace(/name=\w+/, "name=large")),
        hasVideo: [...a.querySelectorAll('[data-testid="videoPlayer"]')].some((v) => !v.closest('div[role="link"]')),
        links: [...a.querySelectorAll('a[href^="https://t.co/"]')].map((l) => l.href),
      };
    })
  );

async function open(page, url) {
  await pace();
  await page.goto(url);
  await waitForTwitterReady(page);
  await page.waitForSelector('article[data-testid="tweet"]', { timeout: 10000 }).catch(() => {});
}

// Opens the quoted post (first level only) by clicking its card, and returns it.
async function readQuote(page) {
  await pace();
  // Click the quote's text: its centre may be an image, which opens the photo viewer instead.
  const from = page.url();
  await page.click('article[data-testid="tweet"] div[role="link"] [data-testid="tweetText"]');
  await page.waitForURL((u) => u.href !== from && /\/status\/\d+/.test(u.href), { timeout: 10000 });
  await page.waitForSelector('article[data-testid="tweet"]', { timeout: 10000 }).catch(() => {});
  const id = page.url().match(/status\/(\d+)/)?.[1];
  const q = (await readPosts(page)).find((a) => a.id === id);
  return q?.text ? q : null;
}

// Opens the post's own page, which has the full text, quoted post, links and the author's
// thread continuation. Returns null when the post is a reply or a later part of a thread
// (something else sits above it on the page), or when part of its content can't be read.
async function expand(page, p) {
  await open(page, p.url);
  const arts = await readPosts(page);
  if (arts[0]?.id !== p.postId) return console.log(`drop ${p.postId}: reply or thread fragment`), null;
  if (!arts[0].text) return console.log(`drop ${p.postId}: no text`), null;
  const thread = [];
  for (const a of arts.slice(1)) {
    if (a.author !== arts[0].author || thread.length >= 5) break;
    thread.push(a);
  }
  const own = [arts[0], ...thread];
  const tcos = [...new Set(own.flatMap((a) => a.links))].slice(0, 2);
  const links = [];
  for (const tco of tcos) {
    const url = await resolve(tco);
    if (/^https?:\/\/(www\.)?(x|twitter)\.com\//.test(url)) continue;
    links.push({ url, content: AUDIO_SITES.test(url) ? AUDIO_SITES : await readWebPage(url) });
    if (!links.at(-1).content) return console.log(`drop ${p.postId}: link content unavailable`), null;
  }
  const quote = arts[0].hasQuote ? await readQuote(page).catch(() => null) : null;
  if (arts[0].hasQuote && !quote) return console.log(`drop ${p.postId}: quoted post unavailable`), null;
  let media_summary;
  try {
    await writeCookies(page);
    for (const [i, l] of links.entries()) if (l.content === AUDIO_SITES) l.content = `[音视频] ${await summarizeAudio(l.url, `${p.postId}_link${i}`)}`;
    media_summary = await summarizeMedia(own, p.postId, "");
    if (quote) media_summary = [media_summary, await summarizeMedia([quote], `${p.postId}_quote`, "引用")].filter(Boolean).join("\n\n");
  } catch (e) {
    return console.log(`drop ${p.postId}: media summary failed: ${e}`), null;
  }
  return {
    text: arts[0].text,
    thread: thread.map((a) => a.text),
    context: quote ? `@${quote.author}: ${quote.text}` : null,
    links,
    media_summary: media_summary || null,
  };
}

// Videos first: they are the likelier to fail, and images cost an Opus call each time.
async function summarizeMedia(posts, name, prefix) {
  const out = [];
  for (const a of posts.filter((a) => a.hasVideo)) out.push(`[${prefix}视频] ${await summarizeAudio(`https://x.com/i/status/${a.id}`, `${name}_${a.id}`)}`);
  const images = posts.flatMap((a) => a.images);
  if (images.length) out.unshift(`[${prefix}图片] ${await describeImages(name, images)}`);
  return out.join("\n\n");
}

// Links whose content is speech: transcribed and summarized instead of read as a web page.
const AUDIO_SITES = /^https?:\/\/([\w-]+\.)*(youtube\.com|youtu\.be|podcasts\.apple\.com|open\.spotify\.com|soundcloud\.com|overcast\.fm|pca\.st)\//;
const MODEL = "claude-opus-5-5";

function run(cmd, args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"] });
    let out = "", err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("close", (code) => (code === 0 ? resolve(out.trim()) : reject(new Error(`${cmd} exited ${code}: ${err.slice(-300)}`))));
    child.stdin.end(input ?? "");
  });
}

const claude = (prompt) => run("claude", ["-p", "--model", MODEL, "--allowedTools", "Read"], prompt);

// yt-dlp reads X videos with the scraper's live logged-in session (which carries the csrf cookie),
// exported as a cookies.txt that is removed when the run ends.
const COOKIES = join(MEDIA, "cookies.txt");
process.on("exit", () => rmSync(COOKIES, { force: true }));
process.on("SIGINT", () => process.exit(130));
process.on("SIGTERM", () => process.exit(143));
async function writeCookies(page) {
  const cookies = await page.context().cookies("https://x.com");
  writeFileSync(COOKIES, "# Netscape HTTP Cookie File\n" + cookies
    .map((c) => [c.domain, c.domain.startsWith(".") ? "TRUE" : "FALSE", c.path, c.secure ? "TRUE" : "FALSE", Math.max(0, Math.round(c.expires)), c.name, c.value].join("\t"))
    .join("\n") + "\n", { mode: 0o600 });
}

async function describeImages(id, urls) {
  const files = [];
  for (const [i, url] of urls.entries()) {
    const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw new Error(`image ${res.status}`);
    const file = join(MEDIA, `${id}_${i}.jpg`);
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    files.push(file);
  }
  return claude(
    `Read these image files from an X post:\n${files.join("\n")}\n\n` +
    "Summarize what they convey in at most 3 sentences in total: the point a reader would take away, " +
    "such as a chart's key finding with its main numbers, or what a screenshot shows. Don't describe how they look. " +
    "Output only the summary."
  );
}

// Downloads the full audio, transcribes it locally, and summarizes the transcript.
async function summarizeAudio(url, name) {
  const audio = join(MEDIA, `${name}.m4a`);
  try {
    await run("yt-dlp", ["-q", "--no-playlist", "--cookies", COOKIES, "-x", "--audio-format", "m4a", "-o", join(MEDIA, `${name}.%(ext)s`), url]);
    await run("mlx_whisper", [audio, "--model", "mlx-community/whisper-large-v3-turbo", "--output-format", "txt", "--output-dir", MEDIA]);
  } catch (e) {
    if (/audio codec/.test(e.message)) return "无语音"; // GIFs and silent clips
    throw e;
  } finally {
    for (const f of readdirSync(MEDIA)) if (f.startsWith(`${name}.`) && !f.endsWith(".txt")) rmSync(join(MEDIA, f), { force: true });
  }
  const transcript = readFileSync(join(MEDIA, `${name}.txt`), "utf8").trim();
  if (!transcript) return "无语音";
  return claude(
    `Below is the full transcript of the audio of ${url}.\n\n${transcript}\n\n` +
    "Summarize what is said in at most 5 sentences: the main points and key claims, with any notable specifics. " +
    "Output only the summary."
  );
}

const resolve = async (tco) =>
  (await fetch(tco, { redirect: "manual", signal: AbortSignal.timeout(15000) })).headers.get("location") ?? tco;

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const decode = (t) =>
  t?.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) =>
    e[0] === "#" ? String.fromCodePoint(parseInt(e.slice(e[1] === "x" ? 2 : 1), e[1] === "x" ? 16 : 10)) : ENTITIES[e.toLowerCase()] ?? m);

// Returns the page's title, description and opening text, or null when it can't be read.
async function readWebPage(url) {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(15000) });
    if (!res.headers.get("content-type")?.includes("text/html")) return null;
    const html = await res.text();
    const pick = (re) => decode(html.match(re)?.[1]?.trim());
    const main = pick(/<article[^>]*>([\s\S]*?)<\/article>/i) ?? pick(/<main[^>]*>([\s\S]*?)<\/main>/i) ?? pick(/<body[^>]*>([\s\S]*)<\/body>/i) ?? "";
    const body = decode(main.replace(/<(script|style|noscript|nav|header|footer)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    const content = [
      pick(/<title[^>]*>([^<]*)/i),
      pick(/<meta[^>]+(?:name|property)=["'](?:og:)?description["'][^>]+content=["']([^"']*)/i),
      body.slice(0, 1500),
    ].filter(Boolean).join("\n");
    const blocked = /attention required|just a moment|enable (js|javascript|cookies)|access denied|are you a robot/i.test(content);
    return blocked ? null : content || null;
  } catch {
    return null;
  }
}

const { page, close } = await getAuthenticatedPage();
let added = 0;
for (const job of jobs) {
  try {
    const posts = await job.run(page);
    for (const p of posts) {
      if (seen[job.topic].has(p.postId) || !isEnglish(p.content)) continue;
      seen[job.topic].add(p.postId);
      const full = await expand(page, p).catch((e) => console.log(`drop ${p.postId}: ${e}`));
      if (!full) continue;
      appendFileSync(poolOf(job.topic), JSON.stringify({
        id: p.postId,
        url: p.url,
        topic: job.topic,
        source: job.source,
        author: p.author.username,
        ...full,
        media: p.media.map((m) => m.type),
        posted_at: p.timestamp,
        metrics: p.metrics,
        collected_at: new Date().toISOString(),
      }) + "\n");
      added++;
    }
    console.log(`${job.topic} ${job.source}: ${posts.length} scraped`);
  } catch (e) {
    console.error(`${job.topic} ${job.source}: ${e}`);
  }
  await pace();
}
console.log(`added ${added} new posts`);
await close();
process.exit(0);
