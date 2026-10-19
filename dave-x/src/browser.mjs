import { spawn } from "child_process";
import { chmodSync, existsSync, readFileSync } from "fs";
import { createRequire } from "module";
import { dirname, join } from "path";
import { chromium as core, devices } from "playwright-core";
import { addExtra } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { AUTH, log, PROFILE } from "./home.mjs";

// The user logs in to X in a stock browser already on this machine (Chrome, else Edge): X's login flow checks for
// automation, and a stock browser with the automation flag hidden passes. The session is saved to AUTH, and scraping runs headless in Playwright's
// Chromium with the stealth plugin, loading that session. Chromium doesn't come with `npm i -g dave-x`: it downloads
// in the background on start, so logging in never waits for it. With neither Chrome nor Edge, login falls back to
// Chromium once it has downloaded.

const chromium = addExtra(core);
chromium.use(StealthPlugin());

let chromiumInstall = null;
export function installChromium() {
  if (existsSync(core.executablePath())) return Promise.resolve();
  chromiumInstall ??= new Promise((resolve, reject) => {
    log("downloading Chromium");
    const cli = join(dirname(createRequire(import.meta.url).resolve("playwright-core/package.json")), "cli.js");
    const child = spawn(process.execPath, [cli, "install", "chromium"], { stdio: ["ignore", "ignore", "pipe"] });
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`Chromium download failed (${code})`))));
  }).catch((e) => {
    chromiumInstall = null;
    throw e;
  });
  return chromiumInstall;
}

const hasSession = (cookies) => cookies.some((c) => c.name === "auth_token" && c.value);

export function loggedIn() {
  try {
    return hasSession(JSON.parse(readFileSync(AUTH, "utf8")).cookies);
  } catch {
    return false;
  }
}

// The login window: Chrome, else Edge, else the downloaded Chromium
async function loginBrowser() {
  // Without the flag a controlled browser reports navigator.webdriver = true, and X's login won't go past the email step
  const opts = {
    headless: false,
    viewport: null,
    locale: "en-US",
    ignoreDefaultArgs: ["--enable-automation"],
    args: ["--disable-blink-features=AutomationControlled"],
    timeout: 60_000,
  };
  for (const channel of ["chrome", "msedge"]) {
    try {
      return await core.launchPersistentContext(PROFILE, { ...opts, channel });
    } catch (e) {
      if (!/executable|distribution|not found/i.test(e.message)) throw e;
    }
  }
  log("Neither Chrome nor Edge found; logging in with Chromium");
  await installChromium();
  return chromium.launchPersistentContext(PROFILE, opts);
}

// Opens a visible window on X's login page; resolves true once the user has logged in and the session is saved,
// or false after 5 minutes
export async function login() {
  const context = await loginBrowser();
  try {
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto("https://x.com/i/flow/login");
    const deadline = Date.now() + 300_000;
    while (Date.now() < deadline) {
      if (hasSession(await context.cookies("https://x.com"))) {
        await context.storageState({ path: AUTH });
        chmodSync(AUTH, 0o600);
        return true;
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
    return false;
  } finally {
    await context.close().catch(() => {});
  }
}

let browser = null;
let context = null;

async function scraper() {
  if (context) return context;
  if (!existsSync(core.executablePath())) {
    installChromium().catch((e) => log(e.message));
    throw new Error("Chromium is still downloading. Try again in a few minutes.");
  }
  browser = await chromium.launch({ headless: true, timeout: 60_000 });
  browser.on("disconnected", () => (browser = context = null));
  context = await browser.newContext({ ...devices["Desktop Chrome"], locale: "en-US", storageState: AUTH });
  await context.addInitScript("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})");
  return context;
}

export async function close() {
  const b = browser;
  browser = context = null;
  await b?.close().catch(() => {});
}

// Browser work runs one job at a time, with 5-10 s between jobs so the account doesn't read like a bot
let queue = Promise.resolve();
let last = 0;
export function withPage(job) {
  const run = queue.then(async () => {
    if (!loggedIn()) throw new Error("Not logged in to X. Call the login tool, or run `dave-x login`.");
    const gap = 5000 + Math.random() * 5000 - (Date.now() - last);
    if (gap > 0) await new Promise((r) => setTimeout(r, gap));
    const page = await (await scraper()).newPage();
    try {
      return await job(page);
    } finally {
      last = Date.now();
      await page.close().catch(() => {});
    }
  });
  queue = run.catch(() => {});
  return run;
}
