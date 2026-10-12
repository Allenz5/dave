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
- "explore": only when the post's own content is not enough to decide, or a claim it rests on needs checking (see Verify). Put in "explore" exactly what to search for, specific enough to look up directly.

Give a one-sentence reason that names the rule it rests on.
