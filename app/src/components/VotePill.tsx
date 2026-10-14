import { Pressable, Text, View } from 'react-native';
import type { Vote } from '@/lib/api';
import { useColors } from '@/lib/theme';
import { PixelIcon } from './PixelIcon';

export function formatCount(n: number) {
  return Math.abs(n) >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

type Props = {
  score: number;
  myVote: Vote;
  onVote: (value: Vote) => void;
  // Shows the score only, for anyone but the channel owner
  disabled?: boolean;
};

export function VotePill({ score, myVote, onVote, disabled }: Props) {
  const c = useColors();
  const up = () => onVote(myVote === 1 ? 0 : 1);
  const down = () => onVote(myVote === -1 ? 0 : -1);
  const scoreColor = myVote === 1 ? c.brand : myVote === -1 ? c.down : c.ink;
  const score_ = (
    <Text className="min-w-6 px-1 text-center font-mono-bold text-xs" style={{ color: scoreColor }}>
      {formatCount(score)}
    </Text>
  );

  return (
    <View className="h-7 flex-row items-center">
      <Pressable onPress={up} disabled={disabled} className="h-7 w-7 items-center justify-center hover:bg-pill" accessibilityLabel="Upvote">
        <PixelIcon name="up" color={myVote === 1 ? c.brand : c['ink-weak']} />
      </Pressable>
      {score_}
      <Pressable onPress={down} disabled={disabled} className="h-7 w-7 items-center justify-center hover:bg-pill" accessibilityLabel="Downvote">
        <PixelIcon name="down" color={myVote === -1 ? c.down : c['ink-weak']} />
      </Pressable>
    </View>
  );
}
