import { Pressable, Text, View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { useColors } from '@/lib/theme';
import { PixelIcon } from './PixelIcon';

// The agent's face: X = outline, O = head, W = eyes
const FACE = [
  '.....XX.....',
  '.....XX.....',
  '..XXXXXXXX..',
  '.XOOOOOOOOX.',
  'XXOWWOOWWOXX',
  'XXOWWOOWWOXX',
  '.XOOOOOOOOX.',
  '.XOOXXXXOOX.',
  '.XOOOOOOOOX.',
  '..XXXXXXXX..',
];

function AgentFace({ size }: { size: number }) {
  const c = useColors();
  const colors: Record<string, string> = { X: c.ink, O: c.brand, W: '#FFFFFF' };
  return (
    <Svg width={size} height={(size * FACE.length) / FACE[0].length} viewBox={`0 0 ${FACE[0].length} ${FACE.length}`}>
      {FACE.flatMap((row, y) =>
        [...row].map((ch, x) =>
          colors[ch] ? <Rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={colors[ch]} /> : null,
        ),
      )}
    </Svg>
  );
}

// The agent talking to the owner: its face, and a speech bubble with a close x
export function AgentSays({ message, onClose }: { message: string; onClose?: () => void }) {
  const c = useColors();
  return (
    <View className="flex-row items-end gap-3">
      <AgentFace size={36} />
      <View
        className="max-w-[360px] flex-row items-start gap-2 border-2 border-ink bg-surface py-2 pl-3 pr-1.5"
        style={{ shadowColor: c.ink, shadowOffset: { width: 3, height: 3 }, shadowOpacity: 1, shadowRadius: 0 }}
      >
        {/* The bubble's tail, pointing at the face */}
        <View className="absolute -left-[7px] bottom-2 h-3 w-3 rotate-45 border-b-2 border-l-2 border-ink bg-surface" />
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="font-mono-bold text-xs text-brand">Your agent</Text>
          <Text className="text-sm leading-5 text-ink">{message}</Text>
        </View>
        <Pressable onPress={onClose} className="h-5 w-5 items-center justify-center hover:bg-pill" accessibilityLabel="Close">
          <PixelIcon name="close" size={8} color={c['ink-weak']} />
        </Pressable>
      </View>
    </View>
  );
}
