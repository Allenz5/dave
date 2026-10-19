// Setup type definitions for built-in Supabase Runtime APIs
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

import { createClient } from 'npm:@supabase/supabase-js@2'

// A new channel's first collect, done here so the owner sees posts before connecting an agent. From the owner's
// description of what they want to read, it names the channel, writes 5 keywords and a short rubric, searches X for 10
// recent posts per keyword, judges each against the rubric and adds the kept ones to the feed. Posts with video are
// skipped.
// It answers at once with the task it runs as; the work goes on in the background and the site polls the task.

const MODEL = 'gpt-5-mini'
const KEYWORDS = 5
const POSTS_PER_KEYWORD = 10
// A run still going after this has died with the function, and a new one may start
const LEASE_MS = 5 * 60_000

const TEMPLATE = await Deno.readTextFile(new URL('../mcp/template.md', import.meta.url))

const SETUP = `You set up a new channel on dave, a reading feed of X posts. The owner describes what they want to read; you name the channel and write its first search keywords and rubric.

This is the first version. The owner will vote on posts and give feedback, and the keywords and rubric are narrowed from that over time. So start general, at the level the owner described: stay on the topic they named, and add no subtopic, angle or niche they didn't ask for. Exactly ${KEYWORDS} keywords, and a short rubric.

Title: the channel's name, 1 or 2 words, in title case.

Keywords: broad X search queries for recent posts on the topic itself, a few words each, in the words people use for it; quotes, OR and url: are allowed. Don't add language, reply or retweet filters; they are added for you. They vary only in wording, and each one finds posts about the whole topic.

Rubric: as general as the keywords. Keep posts about the topic as the owner described it; Drop only what the owner excluded and what plainly isn't about the topic or isn't worth reading (ads, giveaways, engagement bait). In this format, with 1 to 3 rules under Keep and under Drop, and 1 or 2 under Explore:

${TEMPLATE}
Return only JSON: {"title": "...", "keywords": ["..."], "rubric": "<the rubric in markdown>"}`

const judgePrompt = (rubric: string) => `You judge one X post for a dave channel, a reading feed. The channel's rubric is at the end.

- kept: it meets a Keep rule and no Drop rule applies.
- dropped: a Drop rule applies, it fails Keep, or it doesn't say enough on its own to judge.

reason: one sentence that names the rule the decision rests on.
title, only when kept: Reddit style. One plain sentence saying what happened, with the specifics: who, what, how much. At most 100 characters. No clickbait, emoji, hashtags or quotes around it.

Return only JSON: {"decision": "kept" or "dropped", "reason": "...", "title": "..." or null}

## Rubric

${rubric}`

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

async function ask(system: string, user: string) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${Deno.env.get('OPENAI_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  })
  if (!res.ok) throw new Error(`OpenAI failed (${res.status}): ${(await res.text()).slice(0, 300)}`)
  return JSON.parse((await res.json()).choices[0].message.content)
}

type Found = { id: string; text: string; quoted: string | null; posted_at: string; keyword: string }

// One keyword's latest English posts that aren't replies or reposts, without the ones that carry video
async function search(keyword: string): Promise<Found[]> {
  const url = new URL('https://api.x.com/2/tweets/search/recent')
  url.search = new URLSearchParams({
    query: `(${keyword}) lang:en -is:reply -is:retweet`,
    max_results: String(POSTS_PER_KEYWORD),
    'tweet.fields': 'created_at,note_tweet,referenced_tweets,attachments',
    expansions: 'attachments.media_keys,referenced_tweets.id',
    'media.fields': 'type',
  }).toString()
  const res = await fetch(url, { headers: { Authorization: `Bearer ${Deno.env.get('X_BEARER_TOKEN')}` } })
  if (!res.ok) throw new Error(`X search for ${keyword} failed (${res.status}): ${(await res.text()).slice(0, 300)}`)
  const { data = [], includes = {} } = await res.json()
  const video = new Set(
    (includes.media ?? []).filter((m: any) => m.type !== 'photo').map((m: any) => m.media_key as string),
  )
  const tweets = new Map((includes.tweets ?? []).map((t: any) => [t.id as string, t.text as string]))
  return data
    .filter((t: any) => !(t.attachments?.media_keys ?? []).some((k: string) => video.has(k)))
    .map((t: any) => {
      const quote = (t.referenced_tweets ?? []).find((r: any) => r.type === 'quoted')
      return {
        id: t.id,
        text: t.note_tweet?.text ?? t.text,
        quoted: (quote && tweets.get(quote.id)) ?? null,
        posted_at: t.created_at,
        keyword,
      }
    })
}

async function run(taskId: number, channelId: number, description: string) {
  const setup = await ask(SETUP, description)
  const keywords: string[] = (setup.keywords ?? []).map((k: unknown) => String(k).trim()).filter(Boolean)
  const rubric = String(setup.rubric ?? '').trim()
  const title = String(setup.title ?? '').trim().slice(0, 80)
  if (keywords.length !== KEYWORDS || !rubric) throw new Error('the model did not return 5 keywords and a rubric')

  // A post found by several keywords is judged once, under the first
  const found = new Map<string, Found>()
  for (const posts of await Promise.all(keywords.map(search))) {
    for (const p of posts) if (!found.has(p.id)) found.set(p.id, p)
  }
  const system = judgePrompt(rubric)
  const judged = await Promise.all(
    [...found.values()].map(async (p) => {
      const d = await ask(system, `Post:\n${p.text}${p.quoted ? `\n\nQuoted post:\n${p.quoted}` : ''}`)
      return { ...p, kept: d.decision === 'kept' && !!d.title, reason: String(d.reason ?? ''), title: String(d.title ?? '').slice(0, 100) }
    }),
  )

  // Written only once everything worked, so a failed run leaves the channel empty to try again
  const must = ({ error }: { error: { message: string } | null }) => {
    if (error) throw new Error(error.message)
  }
  must(await admin.from('strategy').update({ filter_prompt: rubric }).eq('channel_id', channelId))
  // Only a name the owner hasn't changed from the default
  if (title) {
    must(await admin.from('channels').update({ name: title }).eq('id', channelId).in('name', ['My channel', 'New channel']))
  }
  // Each keyword's next search, by the owner's agent, stops at the newest post this one reached
  const newest = (k: string) =>
    [...found.values()].filter((p) => p.keyword === k).map((p) => p.posted_at).sort().at(-1) ?? null
  const { data: rows, error } = await admin
    .from('search_keywords')
    .insert(keywords.map((query) => ({ channel_id: channelId, query, last_posted_at: newest(query) })))
    .select('id, query')
  if (error) throw new Error(error.message)
  const keywordId = new Map(rows.map((r) => [r.query, r.id]))
  const now = new Date().toISOString()
  const kept = judged.filter((p) => p.kept)
  must(
    await admin.from('posts').insert(
      kept.map((p) => ({
        channel_id: channelId,
        embed_provider: 'x',
        embed_id: p.id,
        keyword_id: keywordId.get(p.keyword),
        title: p.title,
        created_at: p.posted_at,
        collected_at: now,
        filter_decision: 'kept',
        filter_reason: p.reason,
      })),
    ),
  )
  must(
    await admin
      .from('tasks')
      .update({ status: 'done', result: { judged: judged.length, kept: kept.length }, finished_at: now })
      .eq('id', taskId),
  )
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const token = req.headers.get('Authorization')?.replace(/^Bearer /, '') ?? ''
  const { data: auth } = await admin.auth.getUser(token)
  if (!auth.user) return reply(401, { error: 'Sign in first' })

  const { channel_id, description } = await req.json()
  const text = typeof description === 'string' ? description.trim() : ''
  if (!text || text.length > 1000) return reply(400, { error: 'Describe what you want to read in at most 1000 characters' })
  const { data: channel } = await admin
    .from('channels')
    .select('id')
    .eq('id', channel_id)
    .eq('owner_id', auth.user.id)
    .maybeSingle()
  if (!channel) return reply(403, { error: 'Not your channel' })
  const { count } = await admin
    .from('search_keywords')
    .select('id', { count: 'exact', head: true })
    .eq('channel_id', channel_id)
  if (count) return reply(409, { error: 'This channel is already set up' })

  const now = new Date()
  await admin
    .from('tasks')
    .update({ status: 'failed', error: 'Timed out', finished_at: now.toISOString() })
    .eq('channel_id', channel_id)
    .eq('type', 'init')
    .eq('status', 'running')
    .lt('lease_until', now.toISOString())
  const { data: task, error } = await admin
    .from('tasks')
    .insert({
      channel_id,
      type: 'init',
      params: { description: text },
      status: 'running',
      claimed_at: now.toISOString(),
      lease_until: new Date(now.getTime() + LEASE_MS).toISOString(),
      attempts: 1,
    })
    .select('id')
    .single()
  if (error) return reply(409, { error: error.code === '23505' ? 'Already setting up' : error.message })

  EdgeRuntime.waitUntil(
    run(task.id, channel_id, text).catch(async (e) => {
      await admin
        .from('tasks')
        .update({ status: 'failed', error: String(e.message ?? e).slice(0, 500), finished_at: new Date().toISOString() })
        .eq('id', task.id)
    }),
  )
  return reply(202, { task_id: task.id })
})
