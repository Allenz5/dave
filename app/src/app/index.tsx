import { ActivityIndicator, Image, Text, View } from 'react-native';
import { AboutCard } from '@/components/AboutCard';
import { Avatar } from '@/components/Avatar';
import { PixelScene } from '@/components/PixelScene';
import { PostCard } from '@/components/PostCard';
import { Shell } from '@/components/Shell';
import { useChannel, usePosts } from '@/lib/api';
import { useBreakpoints } from '@/lib/theme';

export default function ChannelScreen() {
  const { data: channel, error } = useChannel();
  const { data: posts } = usePosts(channel?.id);
  const { wide } = useBreakpoints();
  const bannerHeight = wide ? 120 : 72;

  if (error) return <Text className="p-4 font-mono text-ink">Failed to load: {error.message}</Text>;
  if (!channel) return <ActivityIndicator className="mt-10" />;

  return (
    <Shell sidebar={<AboutCard channel={channel} />}>
      {/* Channel header: banner + icon + name */}
      <View className="mb-2">
        {channel.banner_url ? (
          <Image source={{ uri: channel.banner_url }} style={{ height: bannerHeight }} resizeMode="cover" />
        ) : (
          <PixelScene height={bannerHeight} />
        )}
        <View className="flex-row items-center gap-3 px-3 py-4">
          <Avatar name={channel.name} size={wide ? 56 : 40} />
          <Text className={`font-bold text-ink ${wide ? 'text-3xl' : 'text-2xl'}`}>
            {channel.name}
          </Text>
        </View>
      </View>

      {posts?.map((post) => (
        <View key={post.id} className="border-t border-line">
          <PostCard post={post} />
        </View>
      ))}
    </Shell>
  );
}
