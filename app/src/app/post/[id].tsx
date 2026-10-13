import { ActivityIndicator, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { CommentTree, Composer } from '@/components/Comments';
import { PixelIcon } from '@/components/PixelIcon';
import { AgentNote, PostActions, PostEmbed, PostImage, PostTitleBar } from '@/components/PostCard';
import { ButtonLabel, RetroButton } from '@/components/Retro';
import { Shell } from '@/components/Shell';
import { useComments, usePost } from '@/lib/api';
import { useUserId } from '@/lib/auth';
import { useColors } from '@/lib/theme';

export default function PostScreen() {
  const id = Number(useLocalSearchParams<{ id: string }>().id);
  const { data: post, error } = usePost(id);
  const { data: comments } = useComments(id);
  const c = useColors();
  const userId = useUserId();

  if (error) return <Text className="p-4 font-mono text-ink">Failed to load: {error.message}</Text>;
  const isOwner = !!post && userId !== null && userId === post.channel.owner_id;

  return (
    <Shell>
      {!post ? (
        <ActivityIndicator className="mt-10" />
      ) : (
        <View className="w-full max-w-[756px] gap-5 self-center">
          <View className="flex-row">
            <RetroButton
              onPress={() => (router.canGoBack() ? router.back() : router.replace(`/${post.channel.slug}`))}
              accessibilityLabel="Back"
            >
              <PixelIcon name="back" size={12} color={c.ink} />
              <ButtonLabel>{post.channel.name}</ButtonLabel>
            </RetroButton>
          </View>

          <View className="px-3">
            <View className="flex-row items-center gap-2">
              <PostTitleBar time={post.created_at} />
            </View>
            {post.title && (
              <Text className="mt-2 font-semibold text-2xl leading-8 text-ink">{post.title}</Text>
            )}
            {!post.embed_provider && !!post.body && (
              <Text className="mt-2 text-base leading-6 text-ink">{post.body}</Text>
            )}
            {post.image_url && <PostImage uri={post.image_url} />}
            <PostEmbed post={post} />
            <AgentNote post={post} />
            <PostActions post={post} canLabel={isOwner} />
          </View>

          <View className="gap-4 border-t border-line px-3 pt-5">
            {isOwner && <Composer postId={post.id} />}
            <CommentTree comments={comments ?? []} canLabel={isOwner} />
          </View>
        </View>
      )}
    </Shell>
  );
}
