import { useMemo, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Avatar } from '@/components/Avatar';
import { PixelIcon } from '@/components/PixelIcon';
import { Shell } from '@/components/Shell';
import { useChannelCards, type ChannelCard } from '@/lib/api';
import { recentChannels } from '@/lib/recent';
import { useColors } from '@/lib/theme';
import { timeAgo } from '@/lib/time';

const CARD = 'h-[172px] w-[212px] justify-between p-4';
const FEATURED = 8;

const meta = (ch: ChannelCard) =>
  [`${ch.post_count} posts`, ch.last_post_at && `updated ${timeAgo(ch.last_post_at)}`].filter(Boolean).join(' · ');

// Big brand-colored card for a featured channel
function FeaturedCard({ channel }: { channel: ChannelCard }) {
  return (
    <Pressable onPress={() => router.push(`/${channel.slug}`)} className={`${CARD} bg-title hover:opacity-90`}>
      <Text className="font-pixel text-[10px] text-white">dave</Text>
      <View className="gap-1.5">
        <Text numberOfLines={2} className="font-bold text-xl leading-6 text-white">
          {channel.name}
        </Text>
        <Text numberOfLines={2} className="text-xs leading-4 text-white/80">
          {channel.description}
        </Text>
        <Text className="font-mono text-[11px] text-white/80">{meta(channel)}</Text>
      </View>
    </Pressable>
  );
}

// Plain card for a channel in the recent list
function RecentCard({ channel }: { channel: ChannelCard }) {
  return (
    <Pressable
      onPress={() => router.push(`/${channel.slug}`)}
      className={`${CARD} border border-line bg-surface hover:bg-surface-hover`}
    >
      <Avatar name={channel.name} size={32} />
      <View className="gap-1">
        <Text numberOfLines={1} className="font-semibold text-lg text-ink">
          {channel.name}
        </Text>
        <Text className="font-mono text-[11px] text-ink-weak">{meta(channel)}</Text>
      </View>
    </Pressable>
  );
}

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <View className="gap-3">
      <View className="h-8 flex-row items-center justify-between">
        <Text className="font-semibold text-xl text-ink">{title}</Text>
        {action}
      </View>
      {children}
    </View>
  );
}

// Home: a random pick of channels in one row on top, then the channels this viewer opened, latest first
export default function Home() {
  const { data: channels, error } = useChannelCards();
  const c = useColors();
  const featured = (channels ?? []).slice(0, FEATURED);
  const recent = useMemo(() => {
    const bySlug = new Map((channels ?? []).map((ch) => [ch.slug, ch]));
    return recentChannels().flatMap((slug) => bySlug.get(slug) ?? []);
  }, [channels]);

  return (
    <Shell>
      {error ? (
        <Text className="font-mono text-ink">Failed to load: {error.message}</Text>
      ) : !channels ? (
        <ActivityIndicator className="mt-10" />
      ) : (
        <View className="gap-8 py-2">
          <Section title="Featured channels">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-3">
              {featured.map((ch) => (
                <FeaturedCard key={ch.id} channel={ch} />
              ))}
            </ScrollView>
          </Section>
          <Section
            title="Recent channels"
            action={
              // Creating channels isn't built yet
              <View className="h-8 flex-row items-center gap-1.5 bg-pill px-3 opacity-50">
                <PixelIcon name="plus" size={10} color={c.ink} />
                <Text className="font-mono-bold text-xs text-ink">New channel</Text>
              </View>
            }
          >
            {recent.length ? (
              <View className="flex-row flex-wrap gap-3">
                {recent.map((ch) => (
                  <RecentCard key={ch.id} channel={ch} />
                ))}
              </View>
            ) : (
              <Text className="font-mono text-xs text-ink-weak">Channels you open show up here.</Text>
            )}
          </Section>
        </View>
      )}
    </Shell>
  );
}
