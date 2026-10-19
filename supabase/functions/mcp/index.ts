// Setup type definitions for built-in Supabase Runtime APIs
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'

import { createMcpHandler, McpServer } from 'npm:@modelcontextprotocol/server@^2.0.0'
import { pipeline } from 'npm:@supabase/middleware@1'
import { withOAuthProtectedResource, withSupabase } from 'npm:@supabase/server@1'
import { z } from 'npm:zod@^4.3.6'

// The MCP server a user's agent connects to. The agent signs in through Supabase Auth's OAuth server,
// and every tool queries as that user, so RLS limits it to the user's own channels.
// The agent's whole job is in playbook.md: it claims tasks the site queued, does them, and completes them.

const PLAYBOOK = await Deno.readTextFile(new URL('./playbook.md', import.meta.url))
const TEMPLATE = await Deno.readTextFile(new URL('./template.md', import.meta.url))
// What a subagent follows to judge one post of a collect task
const SCREEN = await Deno.readTextFile(new URL('./screen.md', import.meta.url))

// A few dropped posts go into the feed, marked, so the owner can catch wrong drops
const DROPPED_PER_KEPT = 0.05

const json = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value) }] })
const xUrl = (id: string) => `https://x.com/i/status/${id}`

Deno.serve(
  pipeline(
    [withOAuthProtectedResource(), withSupabase({ auth: 'user' })],
    async (req, { supabase, userClaims }) => {
      // A query's data, or its error thrown; lists and single rows are never null without an error
      const must = <T,>({ data, error }: { data: T; error: { message: string } | null }) => {
        if (error) throw new Error(error.message)
        return data as NonNullable<T>
      }

      // A task this agent is working on, which also names the channel its writes may touch
      const running = async (id: number) => {
        const { data: task, error } = await supabase
          .from('tasks')
          .select('id, channel_id, type, params')
          .eq('id', id)
          .eq('status', 'running')
          .maybeSingle()
        if (error) throw new Error(error.message)
        if (!task) throw new Error(`no running task ${id}`)
        return task
      }

      // Per keyword: when it was added and its newest post, posts collected in all and in the last day, how many were
      // over a day old, kept, and the owner's votes
      const keywordStats = async (channelId: number) => must(await supabase.rpc('keyword_stats', { p_channel_id: channelId }))

      const handler = createMcpHandler(
        () => {
          const server = new McpServer({ name: 'dave', version: '0.2.0' })

          server.registerTool(
            'get_playbook',
            { description: 'How to do dave tasks. Read it first on every run.', annotations: { readOnlyHint: true } },
            () => ({ content: [{ type: 'text', text: PLAYBOOK }] }),
          )

          server.registerTool(
            'whoami',
            { description: 'The signed-in dave user and the channels they own', annotations: { readOnlyHint: true } },
            async () => {
              const channels = must(await supabase.from('channels').select('id, slug, name').eq('owner_id', userClaims!.id))
              return json({ id: userClaims!.id, email: userClaims!.email, channels })
            },
          )

          server.registerTool(
            'claim_task',
            {
              description:
                'Claim the next queued task of your channels, with everything needed to do it. Returns null when the queue is empty.',
            },
            async () => {
              const task = must(await supabase.rpc('claim_task'))
              if (!task?.id) return json(null)
              const { filter_prompt } = must(
                await supabase.from('strategy').select('filter_prompt').eq('channel_id', task.channel_id).single(),
              )
              const claimed = { id: task.id, type: task.type, channel_id: task.channel_id, params: task.params, filter_prompt }
              if (task.type === 'collect') return json(claimed)
              if (task.type === 'keywords') return json({ ...claimed, keywords: await keywordStats(task.channel_id) })

              const posts = must(
                await supabase
                  .from('posts')
                  .select('id, embed_id, title, body, filter_decision, filter_reason, score, keyword:search_keywords(query), feedback(body)')
                  .in('id', task.params.post_ids),
              )
              const labeled_posts = posts.map((p: any) => ({
                url: p.embed_id && xUrl(p.embed_id),
                title: p.title,
                agent_note: p.body || null,
                filter: p.filter_decision ? `${p.filter_decision} - ${p.filter_reason}` : 'not filtered',
                vote: Math.sign(p.score),
                feedback: p.feedback?.body ?? null,
                keyword: p.keyword?.query ?? null,
              }))
              return json({ ...claimed, template: TEMPLATE, labeled_posts })
            },
          )

          server.registerTool(
            'get_screen_brief',
            {
              description: "How to judge one post of a collect task, with the channel's rubric. For the subagent judging the post.",
              inputSchema: z.object({ task_id: z.number().int() }),
              annotations: { readOnlyHint: true },
            },
            async ({ task_id }) => {
              const task = await running(task_id)
              const { filter_prompt } = must(
                await supabase.from('strategy').select('filter_prompt').eq('channel_id', task.channel_id).single(),
              )
              return { content: [{ type: 'text', text: SCREEN + filter_prompt }] }
            },
          )

          const post = {
            id: z.string().describe('The X post id'),
            keyword_id: z.number().int().describe('The keyword whose search found it'),
            posted_at: z.string().describe('When it was posted, ISO 8601'),
            reason: z.string().describe('One sentence naming the rule the decision rests on'),
          }
          server.registerTool(
            'add_posts',
            {
              description: "Add a collect task's screened posts: every kept one, and every dropped one (the site shows a few, marked).",
              inputSchema: z.object({
                task_id: z.number().int(),
                kept: z.array(
                  z
                    .object({
                      ...post,
                      title: z.string().min(1).max(100),
                      note: z.string().max(280).nullish().describe('Only when the subagent explored'),
                      sources: z.array(z.string().url()).max(3).nullish(),
                    })
                    .refine((p) => !p.note || p.sources?.length, 'a note needs its sources'),
                ),
                dropped: z.array(z.object(post)),
              }),
            },
            async ({ task_id, kept, dropped }) => {
              const task = await running(task_id)
              const share = kept.length * DROPPED_PER_KEPT
              // The fraction is rounded up or down at random, so small runs still sample on average
              const sample = Math.floor(share) + (Math.random() < share % 1 ? 1 : 0)
              const shown = [...dropped].sort(() => Math.random() - 0.5).slice(0, sample)
              const now = new Date().toISOString()
              const row = (p: z.infer<z.ZodObject<typeof post>>, decision: 'kept' | 'dropped') => ({
                channel_id: task.channel_id,
                embed_provider: 'x',
                embed_id: p.id,
                keyword_id: p.keyword_id,
                created_at: p.posted_at,
                collected_at: now,
                filter_decision: decision,
                filter_reason: p.reason,
              })
              const rows = [
                ...kept.map((p) => ({ ...row(p, 'kept'), title: p.title, body: p.note ?? '', sources: p.sources ?? [] })),
                ...shown.map((p) => row(p, 'dropped')),
              ]
              const added = must(
                await supabase
                  .from('posts')
                  .upsert(rows, { onConflict: 'channel_id,embed_provider,embed_id', ignoreDuplicates: true, defaultToNull: false })
                  .select('id, embed_id, title, filter_decision'),
              )
              return json({ added })
            },
          )

          server.registerTool(
            'list_today_posts',
            {
              description: "The channel's kept posts collected today, oldest first, to find duplicates among",
              inputSchema: z.object({
                task_id: z.number().int(),
                since: z.string().describe("The start of today in the owner's time zone, ISO 8601 with offset"),
              }),
              annotations: { readOnlyHint: true },
            },
            async ({ task_id, since }) => {
              const task = await running(task_id)
              const posts = must(
                await supabase
                  .from('posts')
                  .select('id, title, collected_at')
                  .eq('channel_id', task.channel_id)
                  .eq('filter_decision', 'kept')
                  .not('title', 'is', null)
                  .gte('collected_at', since)
                  .order('collected_at')
                  .order('id'),
              )
              return json(posts)
            },
          )

          server.registerTool(
            'merge_posts',
            {
              description: "Merge posts telling the same story into one: the merged posts' X links join its sources, and they are deleted",
              inputSchema: z.object({
                task_id: z.number().int(),
                keep_id: z.number().int().describe("The group's earliest collected post"),
                merged_ids: z.array(z.number().int()).min(1),
              }),
            },
            async ({ task_id, keep_id, merged_ids }) => {
              const task = await running(task_id)
              const posts = must(
                await supabase
                  .from('posts')
                  .select('id, embed_id, sources')
                  .eq('channel_id', task.channel_id)
                  .in('id', [keep_id, ...merged_ids]),
              )
              const keep = posts.find((p) => p.id === keep_id)
              const merged = posts.filter((p) => p.id !== keep_id)
              if (!keep || merged.length !== merged_ids.length) throw new Error('posts not found in this channel')
              const sources = [...keep.sources, ...merged.map((p) => xUrl(p.embed_id!))]
              must(await supabase.from('posts').update({ sources }).eq('id', keep_id))
              must(await supabase.from('posts').delete().in('id', merged_ids))
              return json({ id: keep_id, sources })
            },
          )

          server.registerTool(
            'complete_task',
            {
              description: 'Finish a task with its result, in the shape the playbook gives for its type',
              inputSchema: z.object({ task_id: z.number().int(), result: z.record(z.string(), z.unknown()) }),
            },
            async ({ task_id, result }) => {
              const task = must(await supabase.rpc('complete_task', { p_task_id: task_id, p_result: result }))
              return json({ id: task.id, status: task.status })
            },
          )

          server.registerTool(
            'fail_task',
            {
              description: "Give up a task you can't finish",
              inputSchema: z.object({ task_id: z.number().int(), error: z.string().describe('One line: what went wrong') }),
            },
            async ({ task_id, error }) => {
              const task = must(await supabase.rpc('fail_task', { p_task_id: task_id, p_error: error }))
              return json({ id: task.id, status: task.status })
            },
          )

          return server
        },
        { onerror: (error) => console.error('MCP request failed', error) },
      )
      return handler.fetch(req)
    },
  ),
)
