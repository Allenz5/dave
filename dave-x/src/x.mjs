import { rmSync, writeFileSync } from "fs";
import { join } from "path";
import { AUDIO_SITES, transcribe } from "./audio.mjs";
import { withPage } from "./browser.mjs";
import { MEDIA } from "./home.mjs";
import { readWebPage, resolve } from "./web.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ready(page, selector = 'article[data-testid="tweet"]') {
  await page.waitForLoadState("load");
  await page.waitForSelector(selector, { timeout: 10_000 }).catch(() => {});
  await sleep(1000);
}

// lang:en isn't exact, so posts with mostly non-ASCII letters are left out too
const isEnglish = (text) => {
  const letters = text.match(/\p{L}/gu) ?? [];
  return letters.length === 0 || letters.filter((c) => c < "\u0080").length / letters.length > 0.8;
};

// The posts in view on a search page: id, time, and what decides whether to skip one
const readResults = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('article[data-testid="tweet"]')].map((a) => {
      const link = a.querySelector('a[href*="/status/"]:has(time)');
      const label = [...a.querySelectorAll("span")].some((s) => s.textContent === "Ad" || s.textContent === "Promoted");
      return {
        id: link?.getAttribute("href").match(/status\/(\d+)/)?.[1],
        posted_at: a.querySelector("time")?.getAttribute("datetime"),
        ad: !!a.querySelector('[data-testid="placementTracking"]') || label,
        repost: !!a.querySelector('[data-testid="socialContext"]'),
        text: a.querySelector('[data-testid="tweetText"]')?.innerText ?? "",
      };
    })
  );

// Scrolls a timeline in view and hands each new post to take, which returns "stop" to end, "keep" to keep it, or
// anything else to pass it over. Stops at max_posts or at the end of the timeline.
async function scrollPosts(page, max_posts, take) {
  const posts = [];
  const seen = new Set();
  let stalls = 0;
  const started = Date.now();
  while (posts.length < max_posts && stalls < 8 && Date.now() - started < 180_000) {
    const before = seen.size;
    for (const p of await readResults(page)) {
      if (!p.id || !p.posted_at || seen.has(p.id)) continue;
      seen.add(p.id);
      const verdict = take(p);
      if (verdict === "stop") return posts;
      if (verdict !== "keep") continue;
      posts.push({ id: p.id, posted_at: p.posted_at });
      if (posts.length >= max_posts) break;
    }
    stalls = seen.size === before ? stalls + 1 : 0;
    // Scroll less than a screen: the timeline unmounts posts that scroll out of view
    await page.evaluate(() => window.scrollBy(0, Math.round(window.innerHeight * 0.8)));
    await sleep(2000);
  }
  return posts;
}

// X's latest posts for a keyword, newest first: only ids and posting times. Stops at max_posts, after
// max_consecutive_old_posts posts in a row no newer than since, or at the end of the results.
export function searchLatest({ search, query, since, max_posts, max_consecutive_old_posts = 1, skip = [] }) {
  return withPage(async (page) => {
    const q = search.q.replaceAll("{query}", query);
    await page.goto(search.url.replace("{q}", encodeURIComponent(q)));
    await ready(page);
    const sinceMs = since ? new Date(since).getTime() : -Infinity;
    let old = 0;
    return scrollPosts(page, max_posts, (p) => {
      if (skip.includes("ads") && p.ad) return;
      // A repost carries the original post's time, so it says nothing about how far back the search is
      if (!p.repost && new Date(p.posted_at).getTime() <= sinceMs) return ++old >= max_consecutive_old_posts ? "stop" : undefined;
      old = 0;
      if (skip.includes("non_english") && !isEnglish(p.text)) return;
      return "keep";
    });
  });
}

// The posts X recommends to the logged-in account, from the For you tab of its home timeline, in the order shown:
// only ids and posting times
export function forYou({ max_posts, skip = [] }) {
  return withPage(async (page) => {
    await page.goto("https://x.com/home");
    await ready(page);
    // Home opens on whichever tab the account used last
    const tab = page.getByRole("tab", { name: "For you" });
    if ((await tab.getAttribute("aria-selected")) !== "true") {
      await tab.click();
      await ready(page);
    }
    return scrollPosts(page, max_posts, (p) => {
      if (skip.includes("ads") && p.ad) return;
      if (skip.includes("non_english") && !isEnglish(p.text)) return;
      return "keep";
    });
  });
}

// Every post on a post's page: an X Article's body sits inline in its post, and a quoted post shows as a card
// holding its own tweetText
const readArticles = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('article[data-testid="tweet"]')].map((a) => {
      const href =
        (a.querySelector('a[href*="/status/"]:has(time)') ?? a.querySelector('a[href*="/status/"][href$="/analytics"]'))?.getAttribute("href") ?? "";
      const texts = [...a.querySelectorAll('[data-testid="tweetText"]')];
      const title = a.querySelector('[data-testid="twitter-article-title"]')?.innerText;
      const body = a.querySelector('[data-testid="twitterArticleRichTextView"]')?.innerText;
      return {
        id: href.match(/status\/(\d+)/)?.[1],
        author: href.split("/")[1],
        posted_at: a.querySelector("time")?.getAttribute("datetime"),
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

// Opens the quoted post (first level only) by clicking its card's text: the card's centre may be an image,
// which opens the photo viewer instead
async function readQuote(page) {
  await sleep(3000 + Math.random() * 3000);
  const from = page.url();
  await page.click('article[data-testid="tweet"] div[role="link"] [data-testid="tweetText"]');
  await page.waitForURL((u) => u.href !== from && /\/status\/\d+/.test(u.href), { timeout: 10_000 });
  await ready(page);
  const id = page.url().match(/status\/(\d+)/)?.[1];
  const q = (await readArticles(page)).find((a) => a.id === id);
  return q?.text ? q : null;
}

// A cookies.txt of the logged-in session, for yt-dlp to read X videos; removed once used
async function writeCookies(page, file) {
  const cookies = await page.context().cookies("https://x.com");
  writeFileSync(
    file,
    "# Netscape HTTP Cookie File\n" +
      cookies
        .map((c) => [c.domain, c.domain.startsWith(".") ? "TRUE" : "FALSE", c.path, c.secure ? "TRUE" : "FALSE", Math.max(0, Math.round(c.expires)), c.name, c.value].join("\t"))
        .join("\n") +
      "\n",
    { mode: 0o600 }
  );
}

async function saveImages(id, urls) {
  const files = [];
  for (const [i, url] of urls.entries()) {
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`image ${res.status}`);
    const file = join(MEDIA, `${id}_${i}.jpg`);
    writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    files.push(file);
  }
  return files;
}

// One post in full: its text, the author's thread continuation (up to 5 posts), the quoted post, up to 2 linked
// pages, its images as local files for the agent to look at, and the speech in its video or linked audio.
// Returns { skipped: reason } when it can't be judged on its own.
export async function readPost(id) {
  const cookies = join(MEDIA, `${id}_cookies.txt`);
  const seen = await withPage(async (page) => {
    await page.goto(`https://x.com/i/status/${id}`);
    await ready(page);
    const arts = await readArticles(page);
    if (arts[0]?.id !== id) return { skipped: "a reply or a later part of a thread, or not found" };
    if (!arts[0].text) return { skipped: "no text" };
    const thread = [];
    for (const a of arts.slice(1)) {
      if (a.author !== arts[0].author || thread.length >= 5) break;
      thread.push(a);
    }
    const quote = arts[0].hasQuote ? await readQuote(page).catch(() => null) : null;
    if (arts[0].hasQuote && !quote) return { skipped: "its quoted post can't be read" };
    const own = [arts[0], ...thread];
    if (own.some((a) => a.hasVideo)) await writeCookies(page, cookies);
    return { post: arts[0], thread, quote, own };
  });
  if (seen.skipped) return seen;
  const { post, thread, quote, own } = seen;

  try {
    const links = [];
    const audio = [];
    for (const tco of [...new Set(own.flatMap((a) => a.links))].slice(0, 2)) {
      const url = await resolve(tco).catch(() => tco);
      if (/^https?:\/\/(www\.)?(x|twitter)\.com\//.test(url)) continue;
      if (AUDIO_SITES.test(url)) {
        audio.push({ source: url, transcript: await transcribe(url, `${id}_link${links.length}`) });
        continue;
      }
      const content = await readWebPage(url);
      if (!content) return { skipped: `a linked page can't be read: ${url}` };
      links.push({ url, content });
    }
    for (const a of own.filter((a) => a.hasVideo)) {
      audio.push({ source: `video in https://x.com/i/status/${a.id}`, transcript: await transcribe(`https://x.com/i/status/${a.id}`, `${id}_${a.id}`, cookies) });
    }
    return {
      id,
      url: `https://x.com/${post.author}/status/${id}`,
      author: post.author,
      posted_at: post.posted_at,
      text: post.text,
      thread: thread.map((a) => a.text),
      quote: quote && { author: quote.author, text: quote.text, images: await saveImages(`${id}_quote`, quote.images) },
      links,
      images: await saveImages(id, own.flatMap((a) => a.images)),
      audio,
    };
  } finally {
    rmSync(cookies, { force: true });
  }
}
