import { Pressable, Text, View } from 'react-native';
import type { Vote } from '@/lib/api';
import { useColors } from '@/lib/theme';
import { PixelIcon } from './PixelIcon';
import { RetroButton } from './Retro';

export function formatCount(n: number) {
  return Math.abs(n) >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

type Props = {
  score: number;
  myVote: Vote;
  onVote: (value: Vote) => void;
  // Raised buttons on posts; flat icon buttons on comments
  plain?: boolean;
};

export function VotePill({ score, myVote, onVote, plain }: Props) {
  const c = useColors();
  const up = () => onVote(myVote === 1 ? 0 : 1);
  const down = () => onVote(myVote === -1 ? 0 : -1);
  const scoreColor = myVote === 1 ? c.brand : myVote === -1 ? c.down : c.ink;
  const score_ = (
    <Text className="min-w-6 px-1 text-center font-mono-bold text-xs" style={{ color: scoreColor }}>
      {formatCount(score)}
    </Text>
  );

  if (plain) {
    return (
      <View className="h-7 flex-row items-center">
        <Pressable onPress={up} className="h-7 w-7 items-center justify-center hover:bg-pill" accessibilityLabel="Upvote">
          <PixelIcon name="up" color={myVote === 1 ? c.brand : c['ink-weak']} />
        </Pressable>
        {score_}
        <Pressable onPress={down} className="h-7 w-7 items-center justify-center hover:bg-pill" accessibilityLabel="Downvote">
          <PixelIcon name="down" color={myVote === -1 ? c.down : c['ink-weak']} />
        </Pressable>
      </View>
    );
  }

  return (
    <View className="flex-row items-center gap-1">
      <RetroButton square tone={myVote === 1 ? 'up' : 'default'} onPress={up} accessibilityLabel="Upvote">
        <PixelIcon name="up" color={myVote === 1 ? '#FFFFFF' : c.ink} />
      </RetroButton>
      {score_}
      <RetroButton square tone={myVote === -1 ? 'down' : 'default'} onPress={down} accessibilityLabel="Downvote">
        <PixelIcon name="down" color={myVote === -1 ? '#FFFFFF' : c.ink} />
      </RetroButton>
    </View>
  );
}
