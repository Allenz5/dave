import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, TextInput, View } from 'react-native';
import { useInitChannel, useRefreshChannel, useTasks } from '@/lib/api';
import { useColors } from '@/lib/theme';
import { ButtonLabel, RetroButton, Window } from './Retro';

// An empty channel's first step: the owner says what they want to read, and the server picks the first keywords and
// rubric and fills the feed with a first batch of posts
export function Setup({ channelId }: { channelId: number }) {
  const { data: tasks } = useTasks(channelId);
  const init = useInitChannel(channelId);
  const refresh = useRefreshChannel(channelId);
  const [text, setText] = useState('');
  const c = useColors();

  const last = tasks?.find((t) => t.type === 'init');
  // A run past its lease died on the server, so it counts as failed
  const expired = last?.status === 'running' && !!last.lease_until && new Date(last.lease_until) < new Date();
  const running = last?.status === 'running' && !expired;
  const failed = last?.status === 'failed' || expired;
  useEffect(() => {
    if (last?.status === 'done') refresh();
  }, [last?.status, refresh]);

  const description = text.trim();
  const error = init.error?.message ?? (failed ? (last?.error ?? 'Timed out') : null);

  return (
    <Window title="Set up your channel" className="mx-auto w-full max-w-[560px]">
      <View className="gap-3 p-4">
        {running || init.isPending ? (
          <View className="flex-row items-center gap-3 py-2">
            <ActivityIndicator />
            <Text className="min-w-0 flex-1 font-mono text-xs leading-5 text-ink">
              Picking keywords, searching X and reading posts. This takes about a minute.
            </Text>
          </View>
        ) : (
          <>
            <Text className="font-semibold text-lg text-ink">What do you want to read about?</Text>
            <Text className="font-mono text-xs leading-5 text-ink-weak">
              A sentence or two is enough. dave starts with a few keywords and a short rubric, and your votes and
              feedback refine them from there.
            </Text>
            <View className="border border-line bg-surface">
              <TextInput
                value={text}
                onChangeText={setText}
                multiline
                maxLength={1000}
                placeholder="AI startups: launches, funding rounds and the people building them"
                placeholderTextColor={c['ink-weak']}
                className="min-h-24 px-2 py-2 font-mono text-xs leading-5 text-ink"
                style={{ outlineStyle: 'none' } as any}
              />
            </View>
            {error && <Text className="font-mono text-xs text-primary">{error}</Text>}
            <View className="flex-row justify-end">
              <RetroButton tone="primary" onPress={() => init.mutate(description)} disabled={!description}>
                <ButtonLabel light>{failed ? 'Try again' : 'Set up'}</ButtonLabel>
              </RetroButton>
            </View>
          </>
        )}
      </View>
    </Window>
  );
}
