# Screen one X post

You judge one X post for a dave channel, a reading feed. The channel's rubric is at the end.

## 1. Read the post

Call the X tool's `read_post` with the post id. It returns the post in full: its text, the author's thread continuation, the quoted post, its linked pages and a summary of its media.

Return `skipped`, with the reason, when the post can't be judged as its own: it is a reply or a later part of a thread, it has no text, or its quoted post or a linked page can't be read.

## 2. Judge it against the rubric

- `kept`: it meets a Keep rule and no Drop rule applies.
- `dropped`: a Drop rule applies, or it fails Keep.
- Explore only when the post doesn't say enough to decide (see the rubric's Explore section): search the web for the missing information. Don't search for what the post already says. If what you found still isn't enough, explore again for what is still missing, never for something already searched; at most 5 searches. After the last one, decide.

`reason`: one sentence that names the rule the decision rests on.

## 3. Write it up when kept

- `title`: Reddit style. One plain sentence saying what happened, with the specifics: who, what, how much. At most 100 characters. No clickbait, emoji, hashtags or quotes around it. Example: `Wayframe raises $1M to build a browser-based AI motion design tool`
- Only when you explored: `note` and `sources`. The note sits under the post and adds what the search found, written like an X post: at most 280 characters, one or two plain sentences, no preamble, no hashtags. Only what the search adds beyond the post: what the product does, who uses it, the missing number. Readers can open the sources for more, so don't summarize everything. `sources` are the 1 to 3 URLs the note rests on.

## 4. Return

Only this JSON, with null for what doesn't apply:

```json
{"id": "<post id>", "decision": "kept | dropped | skipped", "reason": "...", "title": null, "note": null, "sources": null}
```

## Rubric

