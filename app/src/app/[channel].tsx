import { ActivityIndicator, Image, Text, View } from 'react-native';
import { Avatar } from '@/components/Avatar';
import { PixelScene } from '@/components/PixelScene';
import { Pager } from '@/components/Pager';
import { PostCard } from '@/components/PostCard';
import { Shell } from '@/components/Shell';
import { FilterCard, SearchCard } from '@/components/Strategy';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { useChannel, usePosts, useStrategy, type Channel as ChannelRow } from '@/lib/api';
import { useUserId } from '@/lib/auth';
import { markOpened } from '@/lib/recent';
import { useBreakpoints } from '@/lib/theme';
import { dayLabel } from '@/lib/time';

// The URL is /<channel slug>?page=<n>
export default function ChannelScreen() {
  const { channel: slug, page } = useLocalSearchParams<{ channel: string; page?: string }>();
  const { data: channel, error } = useChannel(slug);

  if (error) return <Text className="p-4 font-mono text-ink">Failed to load: {error.message}</Text>;
  if (channel === undefined) return <ActivityIndicator className="mt-10" />;
  if (channel === null) return <Text className="p-4 font-mono text-ink">No channel called {slug}</Text>;
  return <Channel channel={channel} page={Math.max(1, parseInt(page ?? '1') || 1)} />;
}

function Channel({ channel, page }: { channel: ChannelRow; page: number }) {
  const { data: feed } = usePosts(channel.id, page);
  // Channels without a strategy show only the feed
  const { data: strategy } = useStrategy(channel.id);
  const { showNav: navFits, showSidebar: sidebarFits, wide } = useBreakpoints();
  const showNav = navFits && !!strategy;
  const showSidebar = sidebarFits && !!strategy;
  const bannerHeight = wide ? 120 : 72;
  const userId = useUserId();
  const isOwner = userId !== null && userId === channel.owner_id;
  useEffect(() => markOpened(channel.slug), [channel.slug]);

  return (
    <Shell
      scrollKey={page}
      drawer={
        !strategy ? undefined : !showSidebar ? (
          <>
            <SearchCard channelId={channel.id} canEdit={isOwner} />
            <FilterCard channelId={channel.id} canEdit={isOwner} />
          </>
        ) : !showNav ? (
          <SearchCard channelId={channel.id} canEdit={isOwner} />
        ) : undefined
      }
    >
      {/* Channel header: banner + icon + name */}
      <View className="mb-2">
        <View className="overflow-hidden rounded-xl">
          {channel.banner_url ? (
            <Image source={{ uri: channel.banner_url }} style={{ height: bannerHeight }} resizeMode="cover" />
          ) : (
            <PixelScene height={bannerHeight} />
          )}
        </View>
        <View className="flex-row items-center gap-3 px-3 py-4">
          <Avatar name={channel.name} size={wide ? 56 : 40} />
          <Text className={`font-bold text-ink ${wide ? 'text-3xl' : 'text-2xl'}`}>
            {channel.name}
          </Text>
        </View>
      </View>

      {/* Search strategy | feed | filter strategy */}
      <View className="flex-row gap-5">
        {showNav && (
          <View className="w-[272px]">
            <SearchCard channelId={channel.id} canEdit={isOwner} />
          </View>
        )}
        <View className="min-w-0 flex-1">
          {feed && page === 1 && <DayHeading day="Today" />}
          {feed?.posts.map((post, i) => {
            const day = post.collected_at && dayLabel(post.collected_at);
            // A page starts under the heading of the previous page's last post; page 1 starts under Today
            const prev = i ? feed.posts[i - 1].collected_at : feed.prevCollectedAt;
            const prevDay = prev ? dayLabel(prev) : page === 1 ? 'Today' : null;
            return (
              <View key={post.id}>
                {day && day !== prevDay && <DayHeading day={day} />}
                <View className="border-t border-line">
                  <PostCard post={post} canLabel={isOwner} />
                </View>
              </View>
            );
          })}
          {feed && (
            <Pager
              page={page}
              pageCount={feed.pageCount}
              onChange={(p) => router.setParams({ page: String(p) })}
            />
          )}
        </View>
        {showSidebar && (
          <View className="w-[316px]">
            <FilterCard channelId={channel.id} canEdit={isOwner} />
          </View>
        )}
      </View>
    </Shell>
  );
}

function DayHeading({ day }: { day: string }) {
  return <Text className="px-3 pb-3 pt-8 font-bold text-3xl text-title">{day}</Text>;
}
