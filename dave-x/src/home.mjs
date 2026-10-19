import { mkdirSync, readdirSync, rmSync, statSync } from "fs";
import { homedir } from "os";
import { join } from "path";

// Everything dave-x keeps on this machine: the login browser's profile and the X session, the downloaded tools and model,
// and the media of posts being read, which is cleared after a day
export const HOME = join(homedir(), ".dave-x");
export const PROFILE = join(HOME, "profile");
// The X login, saved from the login browser for the scraping one; it is the account's session, so only the user reads it
export const AUTH = join(HOME, "x-auth.json");
export const BIN = join(HOME, "bin");
export const MODELS = join(HOME, "models");
export const MEDIA = join(HOME, "media");
for (const dir of [HOME, BIN, MODELS, MEDIA]) mkdirSync(dir, { recursive: true });

for (const f of readdirSync(MEDIA)) {
  const file = join(MEDIA, f);
  if (Date.now() - statSync(file).mtimeMs > 86_400_000) rmSync(file, { force: true });
}

// stdout carries the MCP protocol, so everything else goes to stderr
export const log = (...args) => console.error("[dave-x]", ...args);
