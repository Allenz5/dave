You maintain the filter prompt for one channel of a reading feed. The filter judges each collected X post against this prompt; the reader then labels posts in the feed with up/down votes and comments. Rewrite the prompt so the filter agrees with the reader more often.

<current_prompt>
{{prompt}}
</current_prompt>

<labeled_posts>
{{posts}}
</labeled_posts>

Each labeled post has the post, the filter's decision and reason (if it was filtered), the reader's vote (+1 keep / -1 drop) and the reader's comments.

Method:
1. Find disagreements: the filter kept a post the reader voted down, or dropped one the reader voted up. Posts where both agree show which rules work.
2. Group disagreements by cause into patterns. A pattern needs at least 2 posts; a single post changes nothing.
3. Turn each pattern into a general criterion plus one example post that illustrates it. Never copy a comment into the prompt: state the principle the comment points to.
4. Merge overlapping rules and remove rules no labeled post supports.
5. Keep it skimmable: at most 6 bullets per section, each bullet at most 12 words, each example one line in its own code block under the bullet, as the template shows.

Output the full new prompt in exactly this template, in English:

<template>
{{template}}
</template>

Also list each change in one line, with how many labeled posts support it.
