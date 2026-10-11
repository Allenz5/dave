import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addComment,
  fetchChannel,
  fetchComments,
  fetchPost,
  fetchPosts,
  voteComment,
  votePost,
  type Comment,
  type Post,
  type Vote,
} from '@db/queries';
import { getDeviceId } from './device';

export type { Channel, Comment, EmbedProvider, Post, Vote } from '@db/queries';

export function useChannel() {
  return useQuery({ queryKey: ['channel'], queryFn: fetchChannel });
}

export function usePosts(channelId: number | undefined) {
  return useQuery({
    queryKey: ['posts', channelId],
    enabled: channelId !== undefined,
    queryFn: () => fetchPosts(channelId!, getDeviceId()),
  });
}

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
      qc.setQueriesData<Post[]>({ queryKey: ['posts'] }, (posts) => posts?.map(update));
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
