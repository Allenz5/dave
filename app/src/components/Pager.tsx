import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { useColors } from '@/lib/theme';
import { PixelIcon } from './PixelIcon';
import { ButtonLabel, RetroButton } from './Retro';

// Previous / next, plus a box to jump straight to a page number
export function Pager({
  page,
  pageCount,
  onChange,
}: {
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
}) {
  const [text, setText] = useState('');
  const c = useColors();
  const target = Number(text);
  const valid = Number.isInteger(target) && target >= 1 && target <= pageCount;

  const jump = () => {
    if (!valid) return;
    setText('');
    onChange(target);
  };

  return (
    <View className="flex-row flex-wrap items-center justify-between gap-3 border-t border-line px-3 py-4">
      <View className="flex-row items-center gap-2">
        <RetroButton onPress={() => onChange(page - 1)} disabled={page <= 1} accessibilityLabel="Previous page">
          <PixelIcon name="back" size={10} color={c.ink} />
          <ButtonLabel>Prev</ButtonLabel>
        </RetroButton>
        <Text className="font-mono text-xs text-ink">
          Page {page} of {pageCount}
        </Text>
        <RetroButton onPress={() => onChange(page + 1)} disabled={page >= pageCount} accessibilityLabel="Next page">
          <ButtonLabel>Next</ButtonLabel>
          <View style={{ transform: [{ scaleX: -1 }] }}>
            <PixelIcon name="back" size={10} color={c.ink} />
          </View>
        </RetroButton>
      </View>
      <View className="flex-row items-center gap-2">
        <Text className="font-mono text-xs text-ink-weak">Go to</Text>
        <View className="w-14 border border-line bg-surface">
          <TextInput
            value={text}
            onChangeText={setText}
            onSubmitEditing={jump}
            inputMode="numeric"
            placeholder={String(page)}
            placeholderTextColor={c['ink-weak']}
            className="h-7 px-2 font-mono text-xs text-ink"
            style={{ outlineStyle: 'none' } as any}
          />
        </View>
        <RetroButton onPress={jump} disabled={!valid}>
          <ButtonLabel>Go</ButtonLabel>
        </RetroButton>
      </View>
    </View>
  );
}
