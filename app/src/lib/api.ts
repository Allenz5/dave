import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addComment,
  addKeyword,
  deleteKeyword,
  deletePost,
  editComment,
  fetchChannel,
  fetchChannelCards,
  fetchComments,
  fetchKeywords,
  fetchPosts,
  fetchStrategy,
  saveFeedback,
  updateFilterPrompt,
  voteComment,
  votePost,
  type Comment,
  type Keyword,
  type Post,
  type Vote,
} from '@db/queries';
import { useUserId } from './auth';

export type { Channel, ChannelCard, Comment, EmbedProvider, Keyword, Post, Strategy, Vote } from '@db/queries';

export function useChannel(slug: string) {
  return useQuery({ queryKey: ['channel', slug], queryFn: () => fetchChannel(slug) });
}

// Shuffled on every load, so the home page features a different pick each time
export function useChannelCards() {
  return useQuery({
    queryKey: ['channelCards'],
    queryFn: async () => (await fetchChannelCards()).sort(() => Math.random() - 0.5),
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
