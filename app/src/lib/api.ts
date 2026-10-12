import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addComment,
  addKeyword,
  deleteKeyword,
  editComment,
  fetchChannel,
  fetchComments,
  fetchKeywords,
  fetchPost,
  fetchPosts,
  fetchStrategy,
  updateFilterPrompt,
  voteComment,
  votePost,
  type Comment,
  type Keyword,
  type Post,
  type Vote,
} from '@db/queries';
import { getDeviceId } from './device';

export type { Channel, Comment, EmbedProvider, Keyword, Post, Strategy, Vote } from '@db/queries';

export function useChannel(slug: string) {
  return useQuery({ queryKey: ['channel', slug], queryFn: () => fetchChannel(slug) });
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
  return useQuery({
    queryKey: ['posts', channelId, page],
    queryFn: () => fetchPosts(channelId, page, getDeviceId()),
  });
}

type FeedPage = Awaited<ReturnType<typeof fetchPosts>>;

export function usePost(id: number) {
  return useQuery({ queryKey: ['post', id], queryFn: () => fetchPost(id, getDeviceId()) });
}

export function useComments(postId: number) {
  return useQuery({
    queryKey: ['comments', postId],
    queryFn: () => fetchComments(postId, getDeviceId()),
  });
}

// Optimistic update: change the local score first, refetch from the server on failure
function applyVote<T extends { id: number; score: number; myVote: Vote }>(id: number, value: Vote) {
  return (item: T) =>
    item.id === id ? { ...item, score: item.score - item.myVote + value, myVote: value } : item;
}

export function useVotePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, value }: { id: number; value: Vote }) => votePost(id, value, getDeviceId()),
    onMutate: ({ id, value }) => {
      const update = applyVote<Post>(id, value);
      qc.setQueriesData<FeedPage>(
        { queryKey: ['posts'] },
        (feed) => feed && { ...feed, posts: feed.posts.map(update) },
      );
      qc.setQueryData<Post>(['post', id], (post) => post && update(post));
    },
    onError: (_err, { id }) => {
      qc.invalidateQueries({ queryKey: ['posts'] });
      qc.invalidateQueries({ queryKey: ['post', id] });
    },
  });
}

export function useVoteComment(postId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, value }: { id: number; value: Vote }) =>
      voteComment(id, value, getDeviceId()),
    onMutate: ({ id, value }) => {
      qc.setQueryData<Comment[]>(['comments', postId], (comments) =>
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
      addComment(postId, parentId, body, getDeviceId()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['comments', postId] });
      qc.invalidateQueries({ queryKey: ['post', postId] });
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
