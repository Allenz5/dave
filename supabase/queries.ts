import { supabase } from './client';

// userId is the signed-in user, or null; it decides which of the user's own votes come back as myVote.

export type Vote = -1 | 0 | 1;

export type EmbedProvider = 'x' | 'youtube';

export type Channel = {
  id: number;
  // The id in the channel's URL
  public_id: string;
  // When the owner's agent last claimed a task
  agent_claimed_at: string | null;
  slug: string;
  name: string;
  // Only the owner labels the channel's posts and edits its strategy
  owner_id: string | null;
  created_at: string;
};

export type Post = {
  id: number;
  channel_id: number;
  title: string | null;
  body: string;
  image_url: string | null;
  embed_provider: EmbedProvider | null;
  embed_id: string | null;
  // URLs behind the agent's note in body, when it checked the post with a web search
  sources: string[];
  score: number;
  comment_count: number;
  created_at: string;
  // When the agent collected it; the feed is ordered and split into days by this
  collected_at: string | null;
  // Set by the agent's filter; a 'dropped' post is a sample shown so wrong drops can be caught
  filter_decision: 'kept' | 'dropped' | null;
  myVote: Vote;
  // The owner's note on why the post should or shouldn't be here; null for anyone else
  feedback: string | null;
};

export type Comment = {
  id: number;
  post_id: number;
  parent_id: number | null;
  user_id: string | null;
  author_name: string;
  body: string;
  score: number;
  created_at: string;
  myVote: Vote;
};

async function myVotes(
  table: 'post_votes' | 'comment_votes',
  key: 'post_id' | 'comment_id',
  ids: number[],
  userId: string | null,
) {
  if (ids.length === 0 || !userId) return new Map<number, Vote>();
  const { data, error } = await supabase
    .from(table)
    .select(`${key}, value`)
    .eq('user_id', userId)
    .in(key, ids);
  if (error) throw error;
  return new Map((data as any[]).map((row) => [row[key] as number, row.value as Vote]));
}

// Only the channel owner gets feedback rows back
async function myFeedback(ids: number[], userId: string | null) {
  if (ids.length === 0 || !userId) return new Map<number, string>();
  const { data, error } = await supabase.from('feedback').select('post_id, body').in('post_id', ids);
  if (error) throw error;
  return new Map(data.map((row) => [row.post_id as number, row.body as string]));
}

async function withPostVotes(rows: Omit<Post, 'myVote' | 'feedback'>[], userId: string | null): Promise<Post[]> {
  const ids = rows.map((r) => r.id);
  const [votes, feedback] = await Promise.all([myVotes('post_votes', 'post_id', ids, userId), myFeedback(ids, userId)]);
  return rows.map((r) => ({ ...r, myVote: votes.get(r.id) ?? 0, feedback: feedback.get(r.id) ?? null }));
}

// null when there is no such channel
export async function fetchChannel(publicId: string): Promise<Channel | null> {
  const { data, error } = await supabase.from('channels').select('*').eq('public_id', publicId).maybeSingle();
  if (error) throw error;
  return data;
}

// The user's own channels, oldest first
export async function fetchMyChannels(userId: string): Promise<Channel[]> {
  const { data, error } = await supabase.from('channels').select('*').eq('owner_id', userId).order('id');
  if (error) throw error;
  return data;
}

// A new empty channel for the signed-in user; returns its public id
export async function addChannel(): Promise<string> {
  const { data, error } = await supabase.rpc('add_channel');
  if (error) throw error;
  return data;
}

export async function renameChannel(id: number, name: string) {
  const { error } = await supabase.from('channels').update({ name }).eq('id', id);
  if (error) throw error;
}

export const PAGE_SIZE = 10;

// One page of the channel's feed (pages start at 1), the total number of pages, and when the previous page's
// last post was collected, so the page knows whether it continues that post's day
export async function fetchPosts(channelId: number, page: number, userId: string | null) {
  const [{ data, error }, { count, error: countError }, prev] = await Promise.all([
    supabase.rpc('feed_page', { p_channel_id: channelId, p_page: page, p_page_size: PAGE_SIZE }),
    supabase.from('posts').select('*', { count: 'exact', head: true }).eq('channel_id', channelId),
    page > 1
      ? supabase.rpc('feed_page', { p_channel_id: channelId, p_page: (page - 1) * PAGE_SIZE, p_page_size: 1 })
      : null,
  ]);
  if (error) throw error;
  if (countError) throw countError;
  if (prev?.error) throw prev.error;
  return {
    posts: await withPostVotes(data, userId),
    pageCount: Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE)),
    prevCollectedAt: (prev?.data?.[0]?.collected_at as string | null | undefined) ?? null,
  };
}

export async function fetchComments(postId: number, userId: string | null): Promise<Comment[]> {
  const { data, error } = await supabase
    .from('comments')
    .select('id, post_id, parent_id, user_id, author_name, body, score, created_at')
    .eq('post_id', postId)
    .order('score', { ascending: false })
    .order('created_at');
  if (error) throw error;
  const votes = await myVotes('comment_votes', 'comment_id', data.map((c) => c.id), userId);
  return data.map((c) => ({ ...c, myVote: votes.get(c.id) ?? 0 }));
}

// A value of 0 removes the vote
export async function deletePost(postId: number) {
  const { error } = await supabase.from('posts').delete().eq('id', postId);
  if (error) throw error;
}

export async function votePost(postId: number, value: Vote) {
  const { error } = await supabase.rpc('vote_post', { p_post_id: postId, p_value: value });
  if (error) throw error;
}

export async function voteComment(commentId: number, value: Vote) {
  const { error } = await supabase.rpc('vote_comment', { p_comment_id: commentId, p_value: value });
  if (error) throw error;
}

// An empty body removes the feedback
export async function saveFeedback(postId: number, body: string) {
  const { error } = body
    ? await supabase.from('feedback').upsert({ post_id: postId, body, updated_at: new Date().toISOString() })
    : await supabase.from('feedback').delete().eq('post_id', postId);
  if (error) throw error;
}

// The database signs the comment with the signed-in user
export async function addComment(postId: number, parentId: number | null, body: string) {
  const { error } = await supabase.from('comments').insert({ post_id: postId, parent_id: parentId, body });
  if (error) throw error;
}

export async function editComment(commentId: number, body: string) {
  const { error } = await supabase.from('comments').update({ body }).eq('id', commentId);
  if (error) throw error;
}

// The owner's settings: posts each keyword takes per run, and whether the hourly runs skip the channel
export type Settings = { posts_per_keyword: number; paused: boolean };

// iterations: how many times refine has rewritten the rubric from the owner's labels
export type Strategy = { filter_prompt: string; iterations: number } & Settings;

export type Keyword = { id: number; query: string };

// null when the channel has no strategy
export async function fetchStrategy(channelId: number): Promise<Strategy | null> {
  const { data, error } = await supabase
    .from('strategy')
    .select('filter_prompt, iterations, posts_per_keyword, paused')
    .eq('channel_id', channelId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateFilterPrompt(channelId: number, prompt: string) {
  const { error } = await supabase
    .from('strategy')
    .update({ filter_prompt: prompt })
    .eq('channel_id', channelId);
  if (error) throw error;
}

export async function updateSettings(channelId: number, settings: Partial<Settings>) {
  const { error } = await supabase.from('strategy').update(settings).eq('channel_id', channelId);
  if (error) throw error;
}

export async function fetchKeywords(channelId: number): Promise<Keyword[]> {
  const { data, error } = await supabase
    .from('search_keywords')
    .select('id, query')
    .eq('channel_id', channelId)
    .order('id');
  if (error) throw error;
  return data;
}

export async function addKeyword(channelId: number, query: string) {
  const { error } = await supabase.from('search_keywords').insert({ channel_id: channelId, query });
  if (error) throw error;
}

export async function deleteKeyword(id: number) {
  const { error } = await supabase.from('search_keywords').delete().eq('id', id);
  if (error) throw error;
}

// Work queued for the owner's agent; only the owner can see a channel's tasks
export type Task = {
  id: number;
  // init: a new channel's first collect, which the server runs itself
  type: 'collect' | 'keywords' | 'refine' | 'init';
  status: 'queued' | 'running' | 'done' | 'failed' | 'skipped';
  error: string | null;
  created_at: string;
  lease_until: string | null;
  finished_at: string | null;
};

// The channel's latest tasks, newest first
export async function fetchTasks(channelId: number): Promise<Task[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('id, type, status, error, created_at, lease_until, finished_at')
    .eq('channel_id', channelId)
    .order('created_at', { ascending: false })
    .limit(10);
  if (error) throw error;
  return data;
}

// Whether the owner has voted on any of the channel's posts
export async function fetchHasLabels(channelId: number) {
  const { count, error } = await supabase
    .from('posts')
    .select('id', { count: 'exact', head: true })
    .eq('channel_id', channelId)
    .neq('score', 0);
  if (error) throw error;
  return !!count;
}

// How many collected posts the filter dropped in the channel; only its owner can read it
export async function fetchFilteredCount(channelId: number) {
  const { data, error } = await supabase.rpc('filtered_count', { p_channel_id: channelId });
  if (error) throw error;
  return data as number;
}

// Whether the agent's next claim refines the channel
export async function fetchRefineQueued(channelId: number) {
  const { count, error } = await supabase
    .from('tasks')
    .select('id', { count: 'exact', head: true })
    .eq('channel_id', channelId)
    .eq('type', 'refine')
    .eq('status', 'queued');
  if (error) throw error;
  return !!count;
}

// Asks the agent's next claim to refine the channel, or takes the ask back before it does
export async function setRefine(channelId: number, on: boolean) {
  const { error } = await supabase.rpc('set_refine', { p_channel_id: channelId, p_on: on });
  if (error) throw error;
}

// Queues a collect for the agent's next claim, outside the hourly slots
export async function runNow(channelId: number) {
  const { error } = await supabase.rpc('run_now', { p_channel_id: channelId });
  if (error) throw error;
}

// Sets up an empty channel from what the owner wants to read: the server writes its first keywords and rubric and
// fills the feed with a first batch of posts, in the background as an init task
export async function initChannel(channelId: number, description: string) {
  const { error } = await supabase.functions.invoke('init-channel', { body: { channel_id: channelId, description } });
  if (error) {
    const body = await error.context?.json?.().catch(() => null);
    throw new Error(body?.error ?? error.message);
  }
}

export type AgentStatus = 'none' | 'connected' | 'stalled';

// Whether the user has granted an agent access, and whether it still runs: it claims every hour, so an hour without
// a claim means it stopped. An agent that hasn't claimed yet gets an hour from when it was granted.
export async function fetchAgentStatus(userId: string): Promise<AgentStatus> {
  const { data: grants, error } = await supabase.auth.oauth.listGrants();
  if (error) throw error;
  if (!grants.length) return 'none';
  const { data: claimed, error: e } = await supabase
    .from('channels')
    .select('agent_claimed_at')
    .eq('owner_id', userId)
    .not('agent_claimed_at', 'is', null)
    .order('agent_claimed_at', { ascending: false })
    .limit(1);
  if (e) throw e;
  const last = claimed[0]?.agent_claimed_at ?? grants.map((g) => g.granted_at).sort().at(-1)!;
  return Date.now() - new Date(last).getTime() > 3_600_000 ? 'stalled' : 'connected';
}
