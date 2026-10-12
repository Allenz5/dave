import { supabase } from './client';

// No login: deviceId is a fixed ID generated locally on each device to identify its votes and comments.

export type Vote = -1 | 0 | 1;

export type EmbedProvider = 'x' | 'youtube';

export type Channel = {
  id: number;
  slug: string;
  name: string;
  description: string;
  banner_url: string | null;
  created_at: string;
};

export type Post = {
  id: number;
  channel_id: number;
  author_name: string;
  title: string | null;
  body: string;
  image_url: string | null;
  embed_provider: EmbedProvider | null;
  embed_id: string | null;
  score: number;
  comment_count: number;
  created_at: string;
  // Set by the agent's filter; a 'dropped' post is a sample shown so wrong drops can be caught
  filter_decision: 'kept' | 'dropped' | null;
  myVote: Vote;
};

export type Comment = {
  id: number;
  post_id: number;
  parent_id: number | null;
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
  deviceId: string,
) {
  if (ids.length === 0) return new Map<number, Vote>();
  const { data, error } = await supabase
    .from(table)
    .select(`${key}, value`)
    .eq('device_id', deviceId)
    .in(key, ids);
  if (error) throw error;
  return new Map((data as any[]).map((row) => [row[key] as number, row.value as Vote]));
}

async function withPostVotes(rows: Omit<Post, 'myVote'>[], deviceId: string): Promise<Post[]> {
  const votes = await myVotes('post_votes', 'post_id', rows.map((r) => r.id), deviceId);
  return rows.map((r) => ({ ...r, myVote: votes.get(r.id) ?? 0 }));
}

// The slug is the channel's id in the URL; null when there is no such channel
export async function fetchChannel(slug: string): Promise<Channel | null> {
  const { data, error } = await supabase.from('channels').select('*').eq('slug', slug).maybeSingle();
  if (error) throw error;
  return data;
}

export const PAGE_SIZE = 10;

// One page of the channel's feed (pages start at 1), plus the total number of pages
export async function fetchPosts(channelId: number, page: number, deviceId: string) {
  const [{ data, error }, { count, error: countError }] = await Promise.all([
    supabase.rpc('feed_page', { p_channel_id: channelId, p_page: page, p_page_size: PAGE_SIZE }),
    supabase.from('posts').select('*', { count: 'exact', head: true }).eq('channel_id', channelId),
  ]);
  if (error) throw error;
  if (countError) throw countError;
  return {
    posts: await withPostVotes(data, deviceId),
    pageCount: Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE)),
  };
}

export async function fetchPost(id: number, deviceId: string) {
  const { data, error } = await supabase
    .from('posts')
    .select('*, channel:channels(slug, name)')
    .eq('id', id)
    .single();
  if (error) throw error;
  const [post] = await withPostVotes([data], deviceId);
  return post as Post & { channel: Pick<Channel, 'slug' | 'name'> };
}

export async function fetchComments(postId: number, deviceId: string): Promise<Comment[]> {
  const { data, error } = await supabase
    .from('comments')
    .select('id, post_id, parent_id, author_name, body, score, created_at')
    .eq('post_id', postId)
    .order('score', { ascending: false })
    .order('created_at');
  if (error) throw error;
  const votes = await myVotes('comment_votes', 'comment_id', data.map((c) => c.id), deviceId);
  return data.map((c) => ({ ...c, myVote: votes.get(c.id) ?? 0 }));
}

// A value of 0 removes the vote
export async function votePost(postId: number, value: Vote, deviceId: string) {
  const { error } = await supabase.rpc('vote_post', {
    p_post_id: postId,
    p_device_id: deviceId,
    p_value: value,
  });
  if (error) throw error;
}

export async function voteComment(commentId: number, value: Vote, deviceId: string) {
  const { error } = await supabase.rpc('vote_comment', {
    p_comment_id: commentId,
    p_device_id: deviceId,
    p_value: value,
  });
  if (error) throw error;
}

export async function addComment(
  postId: number,
  parentId: number | null,
  body: string,
  deviceId: string,
) {
  const { error } = await supabase
    .from('comments')
    .insert({ post_id: postId, parent_id: parentId, body, device_id: deviceId });
  if (error) throw error;
}

export async function editComment(commentId: number, body: string) {
  const { error } = await supabase.from('comments').update({ body }).eq('id', commentId);
  if (error) throw error;
}

export type Strategy = { filter_prompt: string };

export type Keyword = { id: number; query: string };

// null when the channel has no strategy
export async function fetchStrategy(channelId: number): Promise<Strategy | null> {
  const { data, error } = await supabase
    .from('strategy')
    .select('filter_prompt')
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
