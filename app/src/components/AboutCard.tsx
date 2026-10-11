import { Text, View } from 'react-native';
import type { Channel } from '@/lib/api';
import { useColors } from '@/lib/theme';
import { PixelIcon } from './PixelIcon';
import { Window } from './Retro';

export function AboutCard({ channel }: { channel: Channel }) {
  const c = useColors();
  const created = new Date(channel.created_at).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  return (
    <Window title={`About ${channel.name}`}>
      <View className="gap-3 p-3">
        <Text className="font-mono text-sm leading-5 text-ink">{channel.description}</Text>
        <View className="flex-row items-center gap-2">
          <PixelIcon name="calendar" size={12} color={c['ink-weak']} />
          <Text className="font-mono text-xs text-ink-weak">Created {created}</Text>
        </View>
      </View>
    </Window>
  );
}
