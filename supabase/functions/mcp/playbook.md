# dave playbook

dave is a reading feed. Each channel has an owner, a filter prompt (the rubric) and X search keywords. You are the owner's agent: you do the channel's work on the owner's machine, as tasks dave makes when a run starts. Everything you need comes from the dave tools; keep nothing on disk.

## Each run

1. Call `claim_task`. If it returns no task, stop.
2. Do the task as its section below says.
3. Call `complete_task` with its result. If you can't finish it, call `fail_task` with a one-line reason.
4. Go back to 1, so one run drains the queue.

A claimed task must be completed within 30 minutes, or it goes back to the queue.

## Collect task

You only organize a collect task: subagents read and judge the posts. Never read a post's content yourself, so each post is judged on its own and your context stays small.

The task's `params` hold the whole crawl:
- `search`: how to search X. `q` is the search query, with `{query}` replaced by the keyword. `url` is the search page, with `{q}` replaced by the URL-encoded query.
- `keywords`: each with `id`, `query`, `since` (the newest post the last run saw; null on a keyword's first run) and `max_posts`.
- `stop`: stop a keyword's search after this many consecutive posts older than `since`.
- `skip`: posts to leave out: `ads`, `non_english` (mostly non-English text), `unavailable_links` (a linked page that can't be read).

### 1. Search

For each keyword, call the X tool's `search_latest` with the task's `search`, the keyword, and its `since`, `max_posts`, `stop` and `skip`. It returns only post ids and when each was posted, newest first.

Note for each keyword the newest post's time (`last_posted_at`), how many posts it found (`collected`), and how many of them were posted over a day before now (`stale`). A post found by two keywords counts for the first; judge it once.

### 2. Hand each post to a subagent

Start one subagent per post, each with a fresh context, and give it exactly this, filled in:

> Call the dave tool `get_screen_brief` with task_id `<task id>` and follow it to judge the X post `<post id>`. Return only the JSON it asks for.

Run several at a time if you can. If your subagents can't call dave tools, call `get_screen_brief` yourself and give each subagent its text unchanged, followed by the post id. If you can't start subagents at all, judge the posts one by one by that brief, and keep only each post's JSON before moving to the next.

Each subagent returns `{"id", "decision", "reason", "title", "note", "sources"}`, where `decision` is `kept`, `dropped` or `skipped`.

### 3. Add the posts

Call `add_posts` once with every kept post and every dropped post, each with its keyword's id and its posting time. Leave out skipped posts, and don't count them as collected. Dropped posts need only their id, keyword, posting time and reason: the site shows a few of them, marked, so the owner can catch wrong drops.

### 4. Merge duplicates

Call `list_today_posts` with the start of today in the owner's time zone. Find posts about the same story: the same event, launch, funding round or release, even when worded differently. Two posts are the same story only if they report the same event; the same company or topic with different news is not. For each group, call `merge_posts` with the group's earliest collected post as `keep_id` and the others as `merged_ids`. Only merge groups that include a post from this run.

### 5. Complete

Call `complete_task` with `{"keywords": [{"id", "last_posted_at", "collected", "kept", "stale"}]}`, one entry per keyword, `kept` counting its kept posts. Leave `last_posted_at` null when the search found nothing.

## Keywords task

Revise the channel's X search keywords so the search brings in more posts the owner wants. Do it yourself, without subagents. Changing nothing is a fine result.

The claimed task carries `filter_prompt` (the rubric: what the owner wants) and `keywords`. Each keyword shows when it was added (`added_at`), its newest post found so far (`newest_post_at`), and what it brought in: posts collected (in all, in the last day, and how many were already over a day old when collected), kept by the filter, and voted up or down by the owner. Keywords use X search syntax (quotes, url:, OR). dave already deletes a keyword whose search finds nothing newer than 2 days before it.

Keywords are for coverage. Don't try to find the target posts with a keyword: the filter does the picking. So keep keywords broad, and be creative about the different ways people post about what the owner wants, so the search reaches posts no current keyword does. A keyword of a few words in a row finds far fewer posts than a short one.

1. Leave a keyword added under 24 hours ago alone: it hasn't been searched enough to judge.
2. Keep the keywords that work: they bring in new posts every day, and the filter keeps or the owner votes up a fair share of them.
3. Replace the rest freely, as many as you like: drop a keyword that brings in few new posts, mostly posts already over a day old, or posts the filter drops and the owner votes down, and try new broad keywords from angles no current keyword covers.
4. When the list is empty or has fewer than 3, add enough to make 5.

Call `complete_task` with `{"keywords", "changes"}`: the full new keyword list as query strings (`["query", ...]`, without the stats), and each change in one line with its reason and numbers. The site applies the keywords as given.

## Refine task

The owner labels posts in the feed with a thumbs up (+1 keep) or down (-1 drop) and a feedback note. Refine rewrites the rubric so the filter agrees with the owner more often.

The claimed task carries `filter_prompt` (the current rubric), `template` (the rubric's shape) and `labeled_posts`. Read each labeled post with the X tool's `read_post` before judging it. Do refine yourself, without subagents: the few labeled posts are best read side by side.

The current rubric already holds everything earlier labels taught. The labeled posts are only the ones labeled since the last refine, so they show what the rubric still gets wrong. Each has the post, the filter's decision and reason (if it was filtered), the owner's vote and feedback, and the keyword that found it.

1. Find disagreements: the filter kept a post the owner voted down, or dropped one the owner voted up. Posts where both agree show which rules work.
2. Group disagreements by cause into patterns. A pattern needs at least 2 posts, or 1 post whose feedback states a clear rule.
3. Turn each pattern into a general criterion plus one example post that illustrates it. Never copy feedback into the rubric: state the principle the feedback points to.
4. Keep existing rules unless a new label shows one is wrong; merge overlapping rules. No new disagreement means no change.
5. Keep it skimmable: each bullet at most 12 words, each example one line in its own code block under the bullet, as the template shows.

Write the full new rubric in exactly the template's shape, in English, and list each change in one line, with how many labeled posts support it.

Call `complete_task` with `{"prompt", "changes"}`: the full new rubric and the list of changes. The site applies the rubric as given.
