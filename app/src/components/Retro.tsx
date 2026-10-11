import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { PixelIcon } from './PixelIcon';

// A window: gray title bar and a thin outline.
export function Window({
  title,
  children,
  className = '',
}: {
  title: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <View className={`border border-line bg-surface ${className}`}>
      <View className="h-8 flex-row items-center gap-2 border-b border-line bg-pill pl-2.5 pr-1.5">
        <View className="min-w-0 flex-1 flex-row items-center gap-2">
          {typeof title === 'string' ? (
            <Text numberOfLines={1} className="font-mono-bold text-xs text-ink">
              {title}
            </Text>
          ) : (
            title
          )}
        </View>
        <View className="h-5 w-5 items-center justify-center border border-line bg-surface">
          <PixelIcon name="close" size={8} color="#1C1B22" />
        </View>
      </View>
      {children}
    </View>
  );
}

type Tone = 'default' | 'primary' | 'up' | 'down';

const TONE_BG: Record<Tone, string> = {
  default: 'bg-pill hover:bg-pill-hover',
  primary: 'bg-primary',
  up: 'bg-brand',
  down: 'bg-down',
};

// Flat square button.
export function RetroButton({
  onPress,
  children,
  tone = 'default',
  disabled,
  accessibilityLabel,
  square,
}: {
  onPress?: () => void;
  children: ReactNode;
  tone?: Tone;
  disabled?: boolean;
  accessibilityLabel?: string;
  square?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={accessibilityLabel}
      className={`${TONE_BG[tone]} ${disabled ? 'opacity-50' : ''}`}
    >
      <View className={`h-7 flex-row items-center justify-center gap-1.5 ${square ? 'w-7' : 'px-2.5'}`}>
        {children}
      </View>
    </Pressable>
  );
}

export function ButtonLabel({ children, light }: { children: ReactNode; light?: boolean }) {
  return (
    <Text className={`font-mono-bold text-xs ${light ? 'text-white' : 'text-ink'}`}>{children}</Text>
  );
}
