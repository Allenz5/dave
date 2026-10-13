import { Image, Linking, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useComments, useDeletePost, useVotePost, type Post } from '@/lib/api';
import { useColors } from '@/lib/theme';
import { timeAgo } from '@/lib/time';
import { CommentTree, Composer } from './Comments';
import { Embed } from './Embed';
import { PixelIcon } from './PixelIcon';
import { ButtonLabel, RetroButton } from './Retro';
import { VotePill, formatCount } from './VotePill';

// canLabel: the viewer owns the post's channel, so can vote
export function PostActions({ post, canLabel }: { post: Post; canLabel: boolean }) {
  const vote = useVotePost();
  const c = useColors();
  return (
    <View className="mt-3 flex-row items-center gap-3">
      <VotePill
        score={post.score}
        myVote={post.myVote}
        onVote={(value) => vote.mutate({ id: post.id, value })}
        disabled={!canLabel}
      />
      <RetroButton onPress={() => router.push(`/post/${post.id}`)} accessibilityLabel="Comments">
        <PixelIcon name="comment" color={c.ink} />
        <ButtonLabel>{formatCount(post.comment_count)}</ButtonLabel>
      </RetroButton>
    </View>
  );
}

export function PostImage({ uri }: { uri: string }) {
  return (
    <Image
      source={{ uri }}
      className="mt-3 w-full border border-line bg-pill"
      style={{ aspectRatio: 16 / 10 }}
      resizeMode="cover"
    />
  );
}

const host = (url: string) => url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];

// What the agent's web search added to a reposted post, with the sources to read more
export function AgentNote({ post }: { post: Post }) {
  if (!post.embed_provider || !post.body) return null;
  return (
    <View className="mt-3 gap-1 border-l-2 border-line pl-3">
      <Text className="font-mono-bold text-xs text-ink-weak">Agent note</Text>
      <Text className="text-sm leading-5 text-ink">{post.body}</Text>
      <View className="flex-row flex-wrap gap-x-3">
        {post.sources.map((url) => (
          <Text
            key={url}
            onPress={() => Linking.openURL(url)}
            className="font-mono text-xs text-primary hover:underline"
          >
            {host(url)}
          </Text>
        ))}
      </View>
    </View>
  );
}

export function PostEmbed({ post }: { post: Post }) {
  if (!post.embed_provider || !post.embed_id) return null;
  return (
    <View className="mt-3">
      <Embed provider={post.embed_provider} id={post.embed_id} />
    </View>
  );
}

// Posts are reposts by the agent, so the bar shows only when the original was posted
export function PostTitleBar({ time }: { time: string }) {
  return <Text className="font-mono text-xs text-ink-weak">{timeAgo(time)}</Text>;
}

const FEED_COMMENTS = 5;

// The post's top comment threads and a comment box, shown under it in the feed
function FeedComments({ post, canLabel }: { post: Post; canLabel: boolean }) {
  const { data: comments } = useComments(post.id);
  const threads = comments?.filter((c) => c.parent_id === null).length ?? 0;
  return (
    <View className="gap-3 px-3 pb-4">
      {comments && <CommentTree comments={comments} limit={FEED_COMMENTS} canLabel={canLabel} />}
      {threads > FEED_COMMENTS && (
        <Pressable onPress={() => router.push(`/post/${post.id}`)} className="self-start">
          <Text className="font-mono-bold text-xs text-ink-weak hover:text-ink">
            View all {post.comment_count} comments
          </Text>
        </Pressable>
      )}
      {canLabel && <Composer postId={post.id} />}
    </View>
  );
}

// Post card in the feed with its comments below; tapping the post opens it. The owner can delete it with the x.
export function PostCard({ post, canLabel }: { post: Post; canLabel: boolean }) {
  const remove = useDeletePost();
  const c = useColors();
  return (
    <View>
      <Pressable onPress={() => router.push(`/post/${post.id}`)} className="px-3 py-4 hover:bg-surface-hover">
        <View className="flex-row items-center gap-2">
          <PostTitleBar time={post.created_at} />
          {post.filter_decision === 'dropped' && (
            <Text className="border border-line px-1.5 font-mono text-xs text-ink-weak">Filtered out</Text>
          )}
          {canLabel && (
            <Pressable
              onPress={() => remove.mutate(post.id)}
              className="ml-auto h-6 w-6 items-center justify-center hover:bg-pill"
              accessibilityLabel="Delete post"
            >
              <PixelIcon name="close" size={10} color={c['ink-weak']} />
            </Pressable>
          )}
        </View>
        {post.title && (
          <Text className="mt-2 font-semibold text-lg leading-6 text-ink">{post.title}</Text>
        )}
        {!post.image_url && !post.embed_provider && !!post.body && (
          <Text numberOfLines={3} className="mt-1.5 text-sm leading-5 text-ink-weak">
            {post.body}
          </Text>
        )}
        {post.image_url && <PostImage uri={post.image_url} />}
        <PostEmbed post={post} />
        <AgentNote post={post} />
        <PostActions post={post} canLabel={canLabel} />
      </Pressable>
      <FeedComments post={post} canLabel={canLabel} />
    </View>
  );
}
