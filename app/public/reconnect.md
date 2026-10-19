# Reconnect dave

dave shows the user's agent (you) offline: no run has claimed a task in over an hour. Find the cause, fix it, and tell the user in one line what it was. The setup these checks refer to is https://dave-pi-nine.vercel.app/agent.md.

When a fix needs the user to run something or act themselves, give them only that one step, wait until it's done, then give the next.

Check in this order, and stop at the first problem:

1. The hourly job: it still exists and is loaded in your scheduler or the OS one, at minute 0, with the run prompt. If it's gone or broken, set it up again as setup step 4 says.
2. `~/.dave-x/run.log`: the last runs' errors, such as the CLI not found on the job's PATH or a tool not allowed.
3. dave's `whoami` answers. If its sign-in expired, ask the user to authorize dave again (in Claude Code, `/mcp`).
4. dave-x's `status` says `logged_in: true`. If not, log the user in to X again as setup step 3 says.

The machine may only have been asleep or off; then nothing needs fixing. Either way, end with one run now (call the dave tool `get_playbook` and follow it), so dave sees the agent again.
