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

// The first version has a single channel
export async function fetchChannel(): Promise<Channel> {
  const { data, error } = await supabase.from('channels').select('*').limit(1).single();
  if (error) throw error;
  return data;
}

export async function fetchPosts(channelId: number, deviceId: string) {
  const { data, error } = await supabase
    .from('posts')
    .select('*')
    .eq('channel_id', channelId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return withPostVotes(data, deviceId);
}

export async function fetchPost(id: number, deviceId: string) {
  const { data, error } = await supabase.from('posts').select('*').eq('id', id).single();
  if (error) throw error;
  return (await withPostVotes([data], deviceId))[0];
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
