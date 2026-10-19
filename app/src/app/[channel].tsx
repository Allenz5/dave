import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';
import { ChannelTabs } from '@/components/ChannelTabs';
import { Pager } from '@/components/Pager';
import { PostCard } from '@/components/PostCard';
import { Shell } from '@/components/Shell';
import { Setup } from '@/components/Setup';
import { ConfigCard, FilterCard, SearchCard } from '@/components/Strategy';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useChannel, useFilteredCount, useKeywords, usePosts, useRenameChannel, useStrategy, type Channel as ChannelRow } from '@/lib/api';
import { useUserId } from '@/lib/auth';
import { useLabelPrompt } from '@/lib/labelPrompt';
import { useBreakpoints } from '@/lib/theme';
import { dayLabel } from '@/lib/time';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The URL is /<channel public_id>?page=<n>
export default function ChannelScreen() {
  const { channel: param, page } = useLocalSearchParams<{ channel: string; page?: string }>();
  const valid = UUID.test(param);
  const { data: channel, error } = useChannel(param, valid);

  if (error) return <Text className="p-4 font-mono text-ink">Failed to load: {error.message}</Text>;
  if (channel === null || !valid) return <Text className="p-4 font-mono text-ink">No channel {param}</Text>;
  if (channel === undefined) return <ActivityIndicator className="mt-10" />;
  return <Channel channel={channel} page={Math.max(1, parseInt(page ?? '1') || 1)} />;
}

function Channel({ channel, page }: { channel: ChannelRow; page: number }) {
  const { data: feed } = usePosts(channel.id, page);
  // Channels without a strategy show only the feed
  const { data: strategy } = useStrategy(channel.id);
  const { showNav: navFits, showSidebar: sidebarFits } = useBreakpoints();
  const showNav = navFits && !!strategy;
  const showSidebar = sidebarFits && !!strategy;
  const userId = useUserId();
  const isOwner = userId !== null && userId === channel.owner_id;
  const { data: keywords } = useKeywords(channel.id);
  // A channel its owner hasn't set up yet: no keywords and no rubric
  const empty = isOwner && strategy?.filter_prompt === '' && keywords?.length === 0;
  const ask = useLabelPrompt(channel.id, isOwner, page === 1 ? feed?.posts[0] : undefined);

  return (
    <Shell
      scrollKey={page}
      drawer={
        !strategy || empty ? undefined : !showSidebar ? (
          <>
            <SearchCard channelId={channel.id} canEdit={isOwner} />
            {isOwner && <ConfigCard channelId={channel.id} />}
            <FilterCard channelId={channel.id} canEdit={isOwner} />
          </>
        ) : !showNav ? (
          <>
            <SearchCard channelId={channel.id} canEdit={isOwner} />
            {isOwner && <ConfigCard channelId={channel.id} />}
          </>
        ) : undefined
      }
    >
      {userId && <ChannelTabs userId={userId} currentId={channel.id} />}
      <View className="flex-row items-center gap-5">
        <View className="min-w-0 flex-1">
          <ChannelTitle channel={channel} canEdit={isOwner} />
        </View>
        {isOwner && !empty && (
          <View className={showSidebar ? 'w-[316px]' : ''}>
            <AttentionSaved channelId={channel.id} />
          </View>
        )}
      </View>

      {empty ? (
        <Setup channelId={channel.id} />
      ) : (
        /* Keywords | feed | rubric */
        <View className="flex-row gap-5">
          {showNav && (
            <View className="w-[272px] gap-4">
              <SearchCard channelId={channel.id} canEdit={isOwner} />
              {isOwner && <ConfigCard channelId={channel.id} />}
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
                    <PostCard
                      post={post}
                      canLabel={isOwner}
                      asked={ask.open === post.id}
                      onCloseAsk={ask.close}
                      onHover={() => ask.hover(post)}
                    />
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
      )}
    </Shell>
  );
}

// The channel's name; the owner clicks it to rename, and Enter or leaving the box saves
function ChannelTitle({ channel, canEdit }: { channel: ChannelRow; canEdit: boolean }) {
  const { wide } = useBreakpoints();
  const rename = useRenameChannel(channel.id);
  const [draft, setDraft] = useState<string | null>(null);
  const size = wide ? 'text-3xl' : 'text-2xl';

  const save = () => {
    const name = draft?.trim();
    if (name && name !== channel.name) rename.mutate(name, { onSuccess: () => setDraft(null) });
    else setDraft(null);
  };

  return (
    <View className="px-3 py-4">
      {draft === null ? (
        <Pressable onPress={() => setDraft(channel.name)} disabled={!canEdit} className="self-start">
          <Text className={`font-bold text-ink ${size} ${canEdit ? 'hover:opacity-70' : ''}`}>{channel.name}</Text>
        </Pressable>
      ) : (
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={save}
          onBlur={save}
          autoFocus
          maxLength={80}
          className={`border-b border-line font-bold text-ink ${size}`}
          style={{ outlineStyle: 'none' } as any}
        />
      )}
      {rename.error && <Text className="font-mono text-xs text-primary">{rename.error.message}</Text>}
    </View>
  );
}

// Roughly how long a person looks at a post in a feed: 2.5 s on desktop, 1.7 s on mobile (Facebook, 2016)
const SECONDS_PER_POST = 2.5;

// The attention the filter saved the owner: each post it dropped is one they didn't have to look at
function AttentionSaved({ channelId }: { channelId: number }) {
  const { data: filtered } = useFilteredCount(channelId, true);
  if (!filtered) return null;
  const minutes = Math.round((filtered * SECONDS_PER_POST) / 60);
  const hours = Math.floor(minutes / 60);
  return (
    <View className="gap-1.5 self-start border-l-4 border-brand py-1 pl-3">
      <Text className="font-mono-bold text-[10px] uppercase tracking-widest text-ink-weak">Attention saved</Text>
      <Text className="font-pixel text-lg text-brand">
        {hours > 0 && `${hours.toLocaleString('en-US')}h `}
        {minutes % 60}m
      </Text>
      <Text className="font-mono text-xs text-ink-weak">
        {filtered.toLocaleString('en-US')} posts screened out for you
      </Text>
    </View>
  );
}

function DayHeading({ day }: { day: string }) {
  return <Text className="px-3 pb-3 pt-8 font-bold text-3xl text-title">{day}</Text>;
}
