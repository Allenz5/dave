import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addChannel,
  addComment,
  addKeyword,
  deleteKeyword,
  deletePost,
  editComment,
  fetchAgentStatus,
  fetchChannel,
  fetchComments,
  fetchFilteredCount,
  fetchHasLabels,
  fetchKeywords,
  fetchMyChannels,
  fetchPosts,
  fetchRefineQueued,
  fetchStrategy,
  fetchTasks,
  initChannel,
  renameChannel,
  runNow,
  saveFeedback,
  setRefine,
  updateSettings,
  updateFilterPrompt,
  voteComment,
  votePost,
  type Comment,
  type Keyword,
  type Post,
  type Strategy,
  type Settings,
  type Vote,
} from '@db/queries';
import { useUserId } from './auth';

export type { AgentStatus, Channel, Comment, EmbedProvider, Keyword, Post, Settings, Strategy, Task, Vote } from '@db/queries';

export function useChannel(publicId: string, enabled: boolean) {
  return useQuery({ queryKey: ['channel', publicId], queryFn: () => fetchChannel(publicId), enabled });
}

export function useMyChannels(userId: string | null) {
  return useQuery({ queryKey: ['myChannels', userId], queryFn: () => fetchMyChannels(userId!), enabled: !!userId });
}

export function useAddChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: addChannel,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['myChannels'] }),
  });
}

export function useRenameChannel(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => renameChannel(id, name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['channel'] });
      qc.invalidateQueries({ queryKey: ['myChannels'] });
    },
  });
}

export function useStrategy(channelId: number) {
  return useQuery({ queryKey: ['strategy', channelId], queryFn: () => fetchStrategy(channelId) });
}

export function useUpdateFilterPrompt(channelId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (prompt: string) => updateFilterPrompt(channelId, prompt),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['strategy', channelId] }),
  });
}

// Optimistic: the control changes at once, and snaps back if the save fails
export function useUpdateSettings(channelId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (settings: Partial<Settings>) => updateSettings(channelId, settings),
    onMutate: (settings) =>
      qc.setQueryData<Strategy | null>(['strategy', channelId], (s) => s && { ...s, ...settings }),
    onError: () => qc.invalidateQueries({ queryKey: ['strategy', channelId] }),
  });
}

// Read once per visit: it only decides whether the first post asks for a label
export function useHasLabels(channelId: number, enabled: boolean) {
  return useQuery({
    queryKey: ['hasLabels', channelId],
    queryFn: () => fetchHasLabels(channelId),
    enabled,
    staleTime: Infinity,
  });
}

export function useFilteredCount(channelId: number, enabled: boolean) {
  return useQuery({
    queryKey: ['filteredCount', channelId],
    queryFn: () => fetchFilteredCount(channelId),
    enabled,
  });
}

// Refetched every minute, so the box clears once the agent takes the refine
export function useRefineQueued(channelId: number) {
  return useQuery({
    queryKey: ['refineQueued', channelId],
    queryFn: () => fetchRefineQueued(channelId),
    refetchInterval: 60_000,
  });
}

// Optimistic, like the settings
export function useSetRefine(channelId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (on: boolean) => setRefine(channelId, on),
    onMutate: (on) => qc.setQueryData(['refineQueued', channelId], on),
    onError: () => qc.invalidateQueries({ queryKey: ['refineQueued', channelId] }),
  });
}

export function useRunNow(channelId: number) {
  return useMutation({ mutationFn: () => runNow(channelId) });
}

// Polled while a task is open, so its status moves on its own; the server's init task finishes in about a minute,
// so it is polled more often
export function useTasks(channelId: number) {
  return useQuery({
    queryKey: ['tasks', channelId],
    queryFn: () => fetchTasks(channelId),
    refetchInterval: (q) => {
      const open = q.state.data?.filter((t) => t.status === 'queued' || t.status === 'running') ?? [];
      return open.some((t) => t.type === 'init') ? 3_000 : open.length ? 30_000 : false;
    },
  });
}

export function useInitChannel(channelId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (description: string) => initChannel(channelId, description),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tasks', channelId] }),
  });
}

// Everything a finished init task changed: the name, the rubric, the keywords and the feed
export function useRefreshChannel(channelId: number) {
  const qc = useQueryClient();
  return useCallback(() => {
    qc.invalidateQueries({ queryKey: ['channel'] });
    qc.invalidateQueries({ queryKey: ['myChannels'] });
    qc.invalidateQueries({ queryKey: ['strategy', channelId] });
    qc.invalidateQueries({ queryKey: ['keywords', channelId] });
    qc.invalidateQueries({ queryKey: ['posts', channelId] });
  }, [qc, channelId]);
}

// Refetched every minute, so a stalled agent shows without a reload
export function useAgentStatus(userId: string | null) {
  return useQuery({
    queryKey: ['agentStatus', userId],
    queryFn: () => fetchAgentStatus(userId!),
    enabled: !!userId,
    refetchInterval: 60_000,
  });
}

export function useKeywords(channelId: number) {
  return useQuery({ queryKey: ['keywords', channelId], queryFn: () => fetchKeywords(channelId) });
}

export function useAddKeyword(channelId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (query: string) => addKeyword(channelId, query),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['keywords', channelId] }),
  });
}

// Optimistic: the chip disappears at once, and comes back if the delete fails
export function useDeleteKeyword(channelId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteKeyword,
    onMutate: (id) =>
      qc.setQueryData<Keyword[]>(['keywords', channelId], (keywords) =>
        keywords?.filter((k) => k.id !== id),
      ),
    onError: () => qc.invalidateQueries({ queryKey: ['keywords', channelId] }),
  });
}

export function usePosts(channelId: number, page: number) {
  const userId = useUserId();
  return useQuery({
    queryKey: ['posts', channelId, page, userId],
    queryFn: () => fetchPosts(channelId, page, userId),
  });
}

type FeedPage = Awaited<ReturnType<typeof fetchPosts>>;

export function useComments(postId: number) {
  const userId = useUserId();
  return useQuery({
    queryKey: ['comments', postId, userId],
    queryFn: () => fetchComments(postId, userId),
  });
}

// Optimistic update: change the local score first, refetch from the server on failure
function applyVote<T extends { id: number; score: number; myVote: Vote }>(id: number, value: Vote) {
  return (item: T) =>
    item.id === id ? { ...item, score: item.score - item.myVote + value, myVote: value } : item;
}

// Optimistic: the post leaves the feed at once, and the page refetches either way
export function useDeletePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deletePost,
    onMutate: (id) =>
      qc.setQueriesData<FeedPage>(
        { queryKey: ['posts'] },
        (feed) => feed && { ...feed, posts: feed.posts.filter((p) => p.id !== id) },
      ),
    onSettled: () => qc.invalidateQueries({ queryKey: ['posts'] }),
  });
}

export function useVotePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, value }: { id: number; value: Vote }) => votePost(id, value),
    onMutate: ({ id, value }) => {
      const update = applyVote<Post>(id, value);
      qc.setQueriesData<FeedPage>(
        { queryKey: ['posts'] },
        (feed) => feed && { ...feed, posts: feed.posts.map(update) },
      );
    },
    onError: () => qc.invalidateQueries({ queryKey: ['posts'] }),
  });
}

// Optimistic, like votes
export function useSaveFeedback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: string }) => saveFeedback(id, body),
    onMutate: ({ id, body }) => {
      const update = (post: Post) => (post.id === id ? { ...post, feedback: body || null } : post);
      qc.setQueriesData<FeedPage>({ queryKey: ['posts'] }, (feed) => feed && { ...feed, posts: feed.posts.map(update) });
    },
    onError: () => qc.invalidateQueries({ queryKey: ['posts'] }),
  });
}

export function useVoteComment(postId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, value }: { id: number; value: Vote }) =>
      voteComment(id, value),
    onMutate: ({ id, value }) => {
      qc.setQueriesData<Comment[]>({ queryKey: ['comments', postId] }, (comments) =>
        comments?.map(applyVote<Comment>(id, value)),
      );
    },
    onError: () => qc.invalidateQueries({ queryKey: ['comments', postId] }),
  });
}

export function useAddComment(postId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ body, parentId }: { body: string; parentId: number | null }) =>
      addComment(postId, parentId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['comments', postId] });
      qc.invalidateQueries({ queryKey: ['posts'] });
    },
  });
}

export function useEditComment(postId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: string }) => editComment(id, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['comments', postId] }),
  });
}
