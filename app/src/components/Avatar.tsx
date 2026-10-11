import { Text, View } from 'react-native';

export function Avatar({ name, size = 22 }: { name: string; size?: number }) {
  return (
    <View
      className="items-center justify-center border border-line bg-surface"
      style={{ width: size, height: size }}
    >
      <Text className="font-bold text-ink" style={{ fontSize: size * 0.5 }}>
        {name.slice(0, 1).toUpperCase()}
      </Text>
    </View>
  );
}
