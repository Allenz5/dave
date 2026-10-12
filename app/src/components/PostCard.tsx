import { Image, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useComments, useVotePost, type Post } from '@/lib/api';
import { useColors } from '@/lib/theme';
import { timeAgo } from '@/lib/time';
import { Avatar } from './Avatar';
import { CommentTree, Composer } from './Comments';
import { Embed } from './Embed';
import { PixelIcon } from './PixelIcon';
import { ButtonLabel, RetroButton } from './Retro';
import { VotePill, formatCount } from './VotePill';

export function PostActions({ post }: { post: Post }) {
  const vote = useVotePost();
  const c = useColors();
  return (
    <View className="mt-3 flex-row items-center gap-3">
      <VotePill
        score={post.score}
        myVote={post.myVote}
        onVote={(value) => vote.mutate({ id: post.id, value })}
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

export function PostEmbed({ post }: { post: Post }) {
  if (!post.embed_provider || !post.embed_id) return null;
  return (
    <View className="mt-3">
      <Embed provider={post.embed_provider} id={post.embed_id} />
    </View>
  );
}

export function PostTitleBar({ name, time }: { name: string; time: string }) {
  return (
    <>
      <Avatar name={name} size={18} />
      <Text numberOfLines={1} className="text-xs font-semibold text-ink">
        {name}
      </Text>
      <Text className="font-mono text-xs text-ink-weak">{timeAgo(time)}</Text>
    </>
  );
}

const FEED_COMMENTS = 5;

// The post's top comment threads and a comment box, shown under it in the feed
function FeedComments({ post }: { post: Post }) {
  const { data: comments } = useComments(post.id);
  const threads = comments?.filter((c) => c.parent_id === null).length ?? 0;
  return (
    <View className="gap-3 px-3 pb-4">
      {comments && <CommentTree comments={comments} limit={FEED_COMMENTS} />}
      {threads > FEED_COMMENTS && (
        <Pressable onPress={() => router.push(`/post/${post.id}`)} className="self-start">
          <Text className="font-mono-bold text-xs text-ink-weak hover:text-ink">
            View all {post.comment_count} comments
          </Text>
        </Pressable>
      )}
      <Composer postId={post.id} />
    </View>
  );
}

// Post card in the feed with its comments below; tapping the post opens it
export function PostCard({ post }: { post: Post }) {
  return (
    <View>
      <Pressable onPress={() => router.push(`/post/${post.id}`)} className="px-3 py-4 hover:bg-surface-hover">
        <View className="flex-row items-center gap-2">
          <PostTitleBar name={post.author_name} time={post.created_at} />
          {post.filter_decision === 'dropped' && (
            <Text className="border border-line px-1.5 font-mono text-xs text-ink-weak">Filtered out</Text>
          )}
        </View>
        {post.title && (
          <Text className="mt-2 font-semibold text-lg leading-6 text-ink">{post.title}</Text>
        )}
        {!post.image_url && !!post.body && (
          <Text numberOfLines={3} className="mt-1.5 text-sm leading-5 text-ink-weak">
            {post.body}
          </Text>
        )}
        {post.image_url && <PostImage uri={post.image_url} />}
        <PostEmbed post={post} />
        <PostActions post={post} />
      </Pressable>
      <FeedComments post={post} />
    </View>
  );
}
