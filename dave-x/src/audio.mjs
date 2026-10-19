import { spawn } from "child_process";
import { chmodSync, existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { createRequire } from "module";
import { delimiter, dirname, join } from "path";
import { pathToFileURL } from "url";
import { gunzipSync } from "zlib";
import { BIN, HOME, log, MEDIA, MODELS } from "./home.mjs";

// Speech in a post's video or in a linked podcast or YouTube video, as text for the agent to read. Everything is
// free and runs on this machine: yt-dlp downloads the audio, ffmpeg decodes it, and Whisper (base, English)
// transcribes it. YouTube's own captions are used when it has them. All of it is large, so none of it comes with
// `npm i -g dave-x`: on start, yt-dlp and ffmpeg download, Whisper's runtime installs into ~/.dave-x/runtime and its
// model downloads, all in the background; until then posts are read without transcripts.

const MAX_SECONDS = 15 * 60;
const MAX_CHARS = 20_000;
const MODEL = "Xenova/whisper-base.en";

const EXE = process.platform === "win32" ? ".exe" : "";
const YT_DLP = join(BIN, `yt-dlp${EXE}`);
const YT_DLP_URL = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${{ darwin: "yt-dlp_macos", linux: "yt-dlp_linux", win32: "yt-dlp.exe" }[process.platform]}`;
const FFMPEG = join(BIN, `ffmpeg${EXE}`);
const FFMPEG_URL = `https://github.com/eugeneware/ffmpeg-static/releases/download/b6.1.1/ffmpeg-${process.platform}-${process.arch}.gz`;
const RUNTIME = join(HOME, "runtime");
const TRANSFORMERS = "@huggingface/transformers@4";

export const AUDIO_SITES =
  /^https?:\/\/([\w-]+\.)*(youtube\.com|youtu\.be|podcasts\.apple\.com|open\.spotify\.com|soundcloud\.com|overcast\.fm|pca\.st)\//;

function run(cmd, args, { binary, env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"], env });
    const out = [];
    let err = "";
    child.stdout.on("data", (d) => out.push(d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", reject);
    child.on("close", (code) => {
      const buf = Buffer.concat(out);
      code === 0 ? resolve(binary ? buf : buf.toString().trim()) : reject(new Error(`${cmd} exited ${code}: ${err.slice(-300)}`));
    });
  });
}

async function download(file, url, gzipped) {
  if (existsSync(file)) return;
  log(`downloading ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download failed (${res.status}): ${url}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  writeFileSync(file, gzipped ? gunzipSync(bytes) : bytes);
  chmodSync(file, 0o755);
}

let ready = null;
let transcriber = null;

// Starts the downloads; transcripts are available once they finish
export function prepare() {
  ready ??= (async () => {
    await Promise.all([download(YT_DLP, YT_DLP_URL), download(FFMPEG, FFMPEG_URL, true)]);
    const require = createRequire(join(RUNTIME, "package.json"));
    const resolveTransformers = () => require.resolve("@huggingface/transformers");
    try {
      resolveTransformers();
    } catch {
      log("installing the Whisper runtime");
      // With the npm that ships with the Node running dave-x, which may be dave-x's own and not on PATH; install
      // scripts call `node`, so that Node goes first on PATH
      const nodeBin = dirname(process.execPath);
      const npm = process.platform === "win32" ? join(nodeBin, "node_modules/npm/bin/npm-cli.js") : join(nodeBin, "../lib/node_modules/npm/bin/npm-cli.js");
      await run(process.execPath, [npm, "install", "--prefix", RUNTIME, "--no-audit", "--no-fund", TRANSFORMERS], {
        env: { ...process.env, PATH: `${nodeBin}${delimiter}${process.env.PATH}` },
      });
    }
    log("loading the Whisper model");
    const { env, pipeline } = await import(pathToFileURL(resolveTransformers()).href);
    env.cacheDir = MODELS;
    transcriber = await pipeline("automatic-speech-recognition", MODEL);
    log("transcription ready");
  })().catch((e) => {
    log(`transcription unavailable: ${e.message}`);
    ready = null;
  });
  return ready;
}

export const transcriptionReady = () => transcriber !== null;

const clip = (text) => (text.length > MAX_CHARS ? `${text.slice(0, MAX_CHARS)} [cut]` : text);

// Captions YouTube already has, as plain text, or null
async function youtubeCaptions(url, name) {
  const out = join(MEDIA, name);
  try {
    await run(YT_DLP, ["-q", "--skip-download", "--write-subs", "--write-auto-subs", "--sub-langs", "en.*", "--sub-format", "vtt", "-o", out, url]);
    const file = readdirSync(MEDIA).find((f) => f.startsWith(`${name}.`) && f.endsWith(".vtt"));
    if (!file) return null;
    const lines = readFileSync(join(MEDIA, file), "utf8")
      .split("\n")
      .filter((l) => l && !l.includes("-->") && !/^(WEBVTT|Kind:|Language:|\d+$)/.test(l))
      .map((l) => l.replace(/<[^>]+>/g, "").trim());
    // Auto captions repeat each line as the next one scrolls in
    return [...new Set(lines)].join(" ") || null;
  } finally {
    for (const f of readdirSync(MEDIA)) if (f.startsWith(`${name}.`)) rmSync(join(MEDIA, f), { force: true });
  }
}

// The first 15 minutes of the audio at url, transcribed. cookies is a cookies.txt for X videos.
// Returns the transcript, "no speech", or a reason it isn't available.
let busy = Promise.resolve();
export function transcribe(url, name, cookies) {
  const job = busy.then(async () => {
    if (!transcriber) return "transcription not ready yet";
    if (/youtube\.com|youtu\.be/.test(url)) {
      const captions = await youtubeCaptions(url, name).catch(() => null);
      if (captions) return clip(captions);
    }
    const audio = join(MEDIA, `${name}.audio`);
    try {
      await run(YT_DLP, ["-q", "--no-playlist", "--ffmpeg-location", FFMPEG, ...(cookies ? ["--cookies", cookies] : []), "-f", "bestaudio/best", "-o", audio, url]);
      const pcm = await run(FFMPEG, ["-v", "error", "-i", audio, "-t", String(MAX_SECONDS), "-ac", "1", "-ar", "16000", "-f", "f32le", "-"], { binary: true });
      if (!pcm.length) return "no speech";
      // A copy, so the samples start on a 4-byte boundary
      const samples = new Float32Array(Uint8Array.from(pcm).buffer);
      const { text } = await transcriber(samples, { chunk_length_s: 30, stride_length_s: 5 });
      return text.trim() ? clip(text.trim()) : "no speech";
    } catch (e) {
      // GIFs and silent clips have no audio stream
      if (/audio|does not contain any stream|Output file is empty/i.test(e.message)) return "no speech";
      return `transcription failed: ${e.message.slice(0, 200)}`;
    } finally {
      rmSync(audio, { force: true });
    }
  });
  busy = job.catch(() => {});
  return job;
}
