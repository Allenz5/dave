# Set up dave

dave is a reading feed. Its owner's agent (you) collects X posts for their channels, judges them, and posts the keepers to dave. You'll connect to two MCP servers:

- **dave** (`https://vddheyvcgosaaucaejxs.supabase.co/functions/v1/mcp`): the owner's channels and the task queue. It also hands you the playbook for every run.
- **dave-x**: reads X in a browser on this machine, logged in as the owner.

Do the steps in order, and tell the user what you're doing as you go. Use your own commands for adding MCP servers; Claude Code and Codex are shown as examples.

When a step needs the user to run something or act themselves, give them only that one step, wait until it's done, then give the next. Never hand them the remaining steps as a list.

## 1. Install dave-x

```
curl -fsSL https://dave-pi-nine.vercel.app/install.sh | sh
```

It installs into `~/.dave-x` only, with its own Node, and needs no sudo; running it again updates dave-x. If you aren't allowed to run it, ask the user to run it. On its first start dave-x downloads a browser and a speech-to-text model in the background (about 300 MB); nothing waits for it.

## 2. Add both MCP servers, for all projects

Claude Code:
```
claude mcp add --scope user --transport http dave https://vddheyvcgosaaucaejxs.supabase.co/functions/v1/mcp
claude mcp add --scope user dave-x -- ~/.dave-x/bin/dave-x
```

Codex:
```
codex mcp add dave --url https://vddheyvcgosaaucaejxs.supabase.co/functions/v1/mcp
codex mcp login dave
codex mcp add dave-x -- ~/.dave-x/bin/dave-x
```

dave uses OAuth: the user signs in with the Google account they use on the dave site and allows access. Claude Code asks for it in `/mcp` once the server loads.

## 3. Log the user in to X

```
~/.dave-x/bin/dave-x login
```

It opens a browser window on X's login page. Ask the user to log in there; the window closes on its own once they're in. You never see or type their X password.

## 4. Run every hour, on the hour

Each run, the agent is started with this prompt and nothing else:

```
Call the dave tool get_playbook and follow it.
```

Set this up to run at the start of every hour (minute 0) on this machine: dave shows the owner when the next run is by the clock. If you have a scheduler of your own that runs here (not in the cloud: dave-x needs this machine's browser), use it. Otherwise add a job to the OS scheduler (launchd with `StartCalendarInterval` `Minute` 0 on macOS, cron `0 * * * *` on Linux, an hourly trigger at minute 0 in Task Scheduler on Windows) that runs your headless CLI with that prompt, for example:

- Claude Code: `claude -p "<prompt>" --allowedTools "mcp__dave mcp__dave-x Agent Read"`
- Codex: `codex exec "<prompt>"`, with the dave and dave-x tools allowed without asking

The job runs with nobody watching, so pre-approve the dave and dave-x tools, starting subagents, and reading image files dave-x saves under `~/.dave-x/media`; nothing else. Give the job the PATH it needs to find your CLI, and send its output to `~/.dave-x/run.log`. Runs only happen while this machine is awake.

## 5. Check

New MCP servers usually load only in a new session. Tell the user to start one (and, in Claude Code, to authorize dave in `/mcp`), then ask you to finish the check there:

- dave's `whoami` returns the user's email and their channels.
- dave-x's `status` says `logged_in: true`.

Then tell the user setup is done: their channels' work runs every hour on the hour, and **Run now** on a channel page copies the prompt to give you for a run right away.
