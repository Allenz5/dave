import { Image, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useVotePost, type Post } from '@/lib/api';
import { useColors } from '@/lib/theme';
import { timeAgo } from '@/lib/time';
import { Avatar } from './Avatar';
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

// Post card in the feed; tapping opens the post
export function PostCard({ post }: { post: Post }) {
  return (
    <Pressable onPress={() => router.push(`/post/${post.id}`)} className="px-3 py-4 hover:bg-surface-hover">
      <View className="flex-row items-center gap-2">
        <PostTitleBar name={post.author_name} time={post.created_at} />
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
  );
}
