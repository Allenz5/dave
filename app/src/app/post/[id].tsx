import { ActivityIndicator, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { AboutCard } from '@/components/AboutCard';
import { CommentTree, Composer } from '@/components/Comments';
import { PixelIcon } from '@/components/PixelIcon';
import { PostActions, PostEmbed, PostImage, PostTitleBar } from '@/components/PostCard';
import { ButtonLabel, RetroButton } from '@/components/Retro';
import { Shell } from '@/components/Shell';
import { useChannel, useComments, usePost } from '@/lib/api';
import { useColors } from '@/lib/theme';

export default function PostScreen() {
  const id = Number(useLocalSearchParams<{ id: string }>().id);
  const { data: channel } = useChannel();
  const { data: post, error } = usePost(id);
  const { data: comments } = useComments(id);
  const c = useColors();

  if (error) return <Text className="p-4 font-mono text-ink">Failed to load: {error.message}</Text>;

  return (
    <Shell sidebar={channel && <AboutCard channel={channel} />}>
      {!post || !channel ? (
        <ActivityIndicator className="mt-10" />
      ) : (
        <View className="gap-5">
          <View className="flex-row">
            <RetroButton
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
              accessibilityLabel="Back"
            >
              <PixelIcon name="back" size={12} color={c.ink} />
              <ButtonLabel>{channel.name}</ButtonLabel>
            </RetroButton>
          </View>

          <View className="px-3">
            <View className="flex-row items-center gap-2">
              <PostTitleBar name={post.author_name} time={post.created_at} />
            </View>
            {post.title && (
              <Text className="mt-2 font-semibold text-2xl leading-8 text-ink">{post.title}</Text>
            )}
            {!!post.body && (
              <Text className="mt-2 text-base leading-6 text-ink">{post.body}</Text>
            )}
            {post.image_url && <PostImage uri={post.image_url} />}
            <PostEmbed post={post} />
            <PostActions post={post} />
          </View>

          <View className="gap-4 border-t border-line px-3 pt-5">
            <Composer postId={post.id} />
            <CommentTree comments={comments ?? []} />
          </View>
        </View>
      )}
    </Shell>
  );
}
