import { useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link } from 'expo-router';
import { useChannel } from '@/lib/api';
import { themeVars, useBreakpoints, useColors, useScheme } from '@/lib/theme';
import { Avatar } from './Avatar';
import { LogoMark, PixelIcon } from './PixelIcon';
import { Window } from './Retro';

function Logo() {
  return (
    <Link href="/" asChild>
      <Pressable className="flex-row items-center gap-1.5">
        <LogoMark height={18} />
        <Text className="font-pixel text-[10px] text-ink">dave</Text>
      </Pressable>
    </Link>
  );
}

function LeftNav({ onNavigate }: { onNavigate?: () => void }) {
  const { data: channel } = useChannel();
  return (
    <Window title="Channels">
      <View className="p-2">
        {channel && (
          <Link href="/" asChild>
            <Pressable
              onPress={onNavigate}
              className="h-9 flex-row items-center gap-2 bg-pill px-2"
            >
              <Avatar name={channel.name} size={20} />
              <Text className="text-sm font-medium text-ink">{channel.name}</Text>
            </Pressable>
          </Link>
        )}
      </View>
    </Window>
  );
}

// Reddit-style frame: top bar + left nav + main content + right sidebar. On narrow screens the nav moves into a drawer and the sidebar is hidden.
export function Shell({ children, sidebar }: { children: ReactNode; sidebar?: ReactNode }) {
  const { showNav, showSidebar, wide } = useBreakpoints();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const c = useColors();
  const scheme = useScheme();

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-canvas">
      <View className="h-7 flex-row items-center gap-2 bg-title px-3">
        {!showNav && (
          <Pressable
            onPress={() => setDrawerOpen(true)}
            className="h-6 w-6 items-center justify-center hover:bg-black/10"
            accessibilityLabel="Open navigation"
          >
            <PixelIcon name="menu" size={10} color={c.ink} />
          </Pressable>
        )}
        <Logo />
      </View>

      <View className="flex-1 flex-row">
        {showNav && (
          <View className="w-[272px] p-4">
            <LeftNav />
          </View>
        )}
        <ScrollView className="flex-1" contentContainerClassName="items-center">
          <View className={`w-full max-w-[1120px] flex-row gap-5 ${wide ? 'p-4' : 'p-3'}`}>
            <View className="min-w-0 max-w-[756px] flex-1">{children}</View>
            {showSidebar && sidebar && <View className="w-[316px]">{sidebar}</View>}
          </View>
        </ScrollView>
      </View>

      <Modal
        visible={drawerOpen && !showNav}
        transparent
        animationType="fade"
        onRequestClose={() => setDrawerOpen(false)}
      >
        {/* Modal renders outside the root view, so the color variables must be applied again */}
        <View style={themeVars[scheme]} className="flex-1 flex-row">
          <SafeAreaView className="w-[272px] bg-canvas p-4">
            <LeftNav onNavigate={() => setDrawerOpen(false)} />
          </SafeAreaView>
          <Pressable className="flex-1 bg-black/40" onPress={() => setDrawerOpen(false)} />
        </View>
      </Modal>
    </SafeAreaView>
  );
}
