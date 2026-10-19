import { Pressable, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useAddChannel, useMyChannels } from '@/lib/api';
import { useColors } from '@/lib/theme';
import { PixelIcon } from './PixelIcon';

// Placeholder: exploring channels isn't built yet
function Soon({ label }: { label: string }) {
  return (
    <View className="h-8 flex-row items-center bg-pill px-3 opacity-50">
      <Text className="font-mono-bold text-xs text-ink">{label}</Text>
    </View>
  );
}

// Adds an empty channel and opens it, where the owner sets it up
function AddChannel() {
  const add = useAddChannel();
  const c = useColors();
  return (
    <Pressable
      onPress={() => add.mutate(undefined, { onSuccess: (publicId) => router.push(`/${publicId}`) })}
      disabled={add.isPending}
      className={`h-8 flex-row items-center gap-1.5 bg-pill px-3 hover:bg-pill-hover ${add.isPending ? 'opacity-50' : ''}`}
    >
      <PixelIcon name="plus" size={10} color={c.ink} />
      <Text className="font-mono-bold text-xs text-ink">{add.error ? 'Try again' : 'Add channel'}</Text>
    </Pressable>
  );
}

// The user's own channels as tabs, the open one highlighted; adding and exploring channels on the right
export function ChannelTabs({ userId, currentId }: { userId: string; currentId: number }) {
  const { data: channels } = useMyChannels(userId);
  return (
    <View className="flex-row items-center gap-3 border-b border-line">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-1" contentContainerClassName="gap-1">
        {channels?.map((ch) => (
          <Pressable
            key={ch.id}
            onPress={() => router.push(`/${ch.public_id}`)}
            className={`h-8 justify-center border-b-2 px-3 ${ch.id === currentId ? 'border-title' : 'border-transparent hover:bg-pill'}`}
          >
            <Text numberOfLines={1} className={`text-xs text-ink ${ch.id === currentId ? 'font-mono-bold' : 'font-mono'}`}>
              {ch.name}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      <View className="flex-row gap-1.5 pb-1">
        <AddChannel />
        <Soon label="Explore channels" />
      </View>
    </View>
  );
}
