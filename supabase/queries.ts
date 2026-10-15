import { supabase } from './client';

// userId is the signed-in user, or null; it decides which of the user's own votes come back as myVote.

export type Vote = -1 | 0 | 1;

export type EmbedProvider = 'x' | 'youtube';

export type Channel = {
  id: number;
  slug: string;
  name: string;
  description: string;
  banner_url: string | null;
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

// The slug is the channel's id in the URL; null when there is no such channel
export async function fetchChannel(slug: string): Promise<Channel | null> {
  const { data, error } = await supabase.from('channels').select('*').eq('slug', slug).maybeSingle();
  if (error) throw error;
  return data;
}

// A channel as the home page shows it: with its post count and when its latest post was made
export type ChannelCard = Pick<Channel, 'id' | 'slug' | 'name' | 'description' | 'banner_url'> & {
  post_count: number;
  last_post_at: string | null;
};

// Every channel, in no particular order
export async function fetchChannelCards(): Promise<ChannelCard[]> {
  const { data, error } = await supabase.rpc('channel_cards');
  if (error) throw error;
  return data;
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

// crawl_intensity: 1-5, how many posts the agent's search takes per keyword each run
export type Strategy = { filter_prompt: string; crawl_intensity: number };

export type Keyword = { id: number; query: string };

// null when the channel has no strategy
export async function fetchStrategy(channelId: number): Promise<Strategy | null> {
  const { data, error } = await supabase
    .from('strategy')
    .select('filter_prompt, crawl_intensity')
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

export async function updateCrawlIntensity(channelId: number, level: number) {
  const { error } = await supabase.from('strategy').update({ crawl_intensity: level }).eq('channel_id', channelId);
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

export type TaskType = 'collect' | 'refine';

// Work queued for the owner's agent; only the owner can see a channel's tasks
export type Task = {
  id: number;
  type: TaskType;
  status: 'queued' | 'running' | 'done' | 'failed';
  error: string | null;
  created_at: string;
  finished_at: string | null;
};

// The channel's latest tasks, newest first
export async function fetchTasks(channelId: number): Promise<Task[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select('id, type, status, error, created_at, finished_at')
    .eq('channel_id', channelId)
    .order('created_at', { ascending: false })
    .limit(10);
  if (error) throw error;
  return data;
}

// Returns the task already open when there is one
export async function enqueueTask(channelId: number, type: TaskType) {
  const { error } = await supabase.rpc('enqueue_task', { p_channel_id: channelId, p_type: type });
  if (error) throw error;
}
