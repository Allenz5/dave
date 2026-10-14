You maintain the filter prompt and the search keywords for one channel of a reading feed. Posts are collected by searching X's latest posts for each keyword. The filter judges each collected X post against this prompt; the reader then labels posts in the feed with thumbs up/down and a feedback note. Rewrite the prompt so the filter agrees with the reader more often, and revise the keywords so the search brings in more posts the reader wants.

<current_prompt>
{{prompt}}
</current_prompt>

<labeled_posts>
{{posts}}
</labeled_posts>

The current prompt already holds everything earlier labels taught. The labeled posts below are only the ones labeled since the last refine, so they show what the prompt still gets wrong.

Each labeled post has the post, the filter's decision and reason (if it was filtered), the reader's vote (+1 keep / -1 drop) and the reader's feedback.

Method:
1. Find disagreements: the filter kept a post the reader voted down, or dropped one the reader voted up. Posts where both agree show which rules work.
2. Group disagreements by cause into patterns. A pattern needs at least 2 posts, or 1 post whose feedback states a clear rule.
3. Turn each pattern into a general criterion plus one example post that illustrates it. Never copy feedback into the prompt: state the principle the feedback points to.
4. Keep existing rules unless a new label shows one is wrong; merge overlapping rules. No new disagreement means no change.
5. Keep it skimmable: at most 6 bullets per section, each bullet at most 12 words, each example one line in its own code block under the bullet, as the template shows.

Output the full new prompt in exactly this template, in English:

<template>
{{template}}
</template>

Also list each change in one line, with how many labeled posts support it.

<search_keywords>
{{keywords}}
</search_keywords>

Each keyword shows what it brought in: posts collected, kept by the filter, and voted up or down by the reader. Keywords use X search syntax (quotes, url:, OR).

A down vote counts against a keyword only when the post itself is off-target. When the feedback says the agent didn't find enough about the post (needs more info, should have looked up the company), the post may be fine and the miss belongs to the filter's Verify rules. Each labeled post names the keyword that found it; read its feedback before blaming the keyword.

Revise the keywords:
1. Drop a keyword that collected at least 10 posts and got almost none kept or voted up, and whose down votes are about the posts themselves.
2. Add a keyword when posts the reader voted up share a phrase, site or kind of announcement no keyword targets.
3. Rewrite a keyword whose kept posts point to a narrower phrasing.
4. Leave a keyword with too little data alone. At most 8 keywords; change at most 3 per run.

Output the full new keyword list, and list each keyword change in one line with its reason and numbers.
