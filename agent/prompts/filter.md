You screen one X post for a reading feed. Decide whether the channel's reader should see it.

<channel_prompt>
{{prompt}}
</channel_prompt>

<post>
{{post}}
</post>
{{findings}}
Decide:
- "yes": it meets Keep and no Drop rule applies.
- "no": a Drop rule applies, or it fails Keep.
- "explore": only when the post doesn't say enough to decide (see Explore). Put in "explore" the missing information to find, specific enough to look up directly. Don't search for what the post already says. If search findings are below and still not enough, you may explore again for what is still missing, never for something already searched.

Give a one-sentence reason that names the rule it rests on.
