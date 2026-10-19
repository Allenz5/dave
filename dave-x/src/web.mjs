// Linked pages, read without the browser

// Where a t.co short link points
export const resolve = async (tco) =>
  (await fetch(tco, { redirect: "manual", signal: AbortSignal.timeout(15_000) })).headers.get("location") ?? tco;

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const decode = (t) =>
  t?.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) =>
    e[0] === "#" ? String.fromCodePoint(parseInt(e.slice(e[1] === "x" ? 2 : 1), e[1] === "x" ? 16 : 10)) : ENTITIES[e.toLowerCase()] ?? m
  );

// The page's title, description and opening text, or null when it can't be read
export async function readWebPage(url) {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(15_000) });
    if (!res.headers.get("content-type")?.includes("text/html")) return null;
    const html = await res.text();
    const pick = (re) => decode(html.match(re)?.[1]?.trim());
    const main = pick(/<article[^>]*>([\s\S]*?)<\/article>/i) ?? pick(/<main[^>]*>([\s\S]*?)<\/main>/i) ?? pick(/<body[^>]*>([\s\S]*)<\/body>/i) ?? "";
    const body = decode(main.replace(/<(script|style|noscript|nav|header|footer)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " "))
      .replace(/\s+/g, " ")
      .trim();
    const content = [
      pick(/<title[^>]*>([^<]*)/i),
      pick(/<meta[^>]+(?:name|property)=["'](?:og:)?description["'][^>]+content=["']([^"']*)/i),
      body.slice(0, 4000),
    ]
      .filter(Boolean)
      .join("\n");
    const blocked = /attention required|just a moment|enable (js|javascript|cookies)|access denied|are you a robot/i.test(content);
    return blocked ? null : content || null;
  } catch {
    return null;
  }
}
