import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link } from 'expo-router';
import { signIn, signOut, useSession } from '@/lib/auth';
import { themeVars, useBreakpoints, useColors, useScheme } from '@/lib/theme';
import { LogoMark, PixelIcon } from './PixelIcon';

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

// Google account in the top bar: sign in, or the signed-in name and sign out
function Account() {
  const session = useSession();
  const name = session?.user.user_metadata.full_name ?? session?.user.email;
  return (
    <View className="ml-auto flex-row items-center gap-2">
      {session && <Text className="font-mono text-xs text-ink">{name}</Text>}
      <Pressable onPress={session ? signOut : signIn} className="h-6 justify-center px-2 hover:bg-black/10">
        <Text className="font-mono-bold text-xs text-ink">{session ? 'Sign out' : 'Sign in with Google'}</Text>
      </Pressable>
    </View>
  );
}

// Frame: top bar + centered page. `drawer` is shown behind the menu button, for panels the page hides on narrow screens.
// The page scrolls back to the top whenever `scrollKey` changes.
export function Shell({
  children,
  drawer,
  scrollKey,
}: {
  children: ReactNode;
  drawer?: ReactNode;
  scrollKey?: string | number;
}) {
  const { wide } = useBreakpoints();
  const scroll = useRef<ScrollView>(null);
  useEffect(() => scroll.current?.scrollTo({ y: 0, animated: false }), [scrollKey]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const c = useColors();
  const scheme = useScheme();

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-canvas">
      <View className="h-7 flex-row items-center gap-2 bg-title px-3">
        {drawer && (
          <Pressable
            onPress={() => setDrawerOpen(true)}
            className="h-6 w-6 items-center justify-center hover:bg-black/10"
            accessibilityLabel="Open strategy"
          >
            <PixelIcon name="menu" size={10} color={c.ink} />
          </Pressable>
        )}
        <Logo />
        <Account />
      </View>

      <ScrollView ref={scroll} className="flex-1" contentContainerClassName="items-center">
        <View className={`w-full max-w-[1400px] ${wide ? 'p-4' : 'p-3'}`}>{children}</View>
      </ScrollView>

      <Modal
        visible={drawerOpen && !!drawer}
        transparent
        animationType="fade"
        onRequestClose={() => setDrawerOpen(false)}
      >
        {/* Modal renders outside the root view, so the color variables must be applied again */}
        <View style={themeVars[scheme]} className="flex-1 flex-row">
          <SafeAreaView className="w-[316px] bg-canvas">
            <ScrollView contentContainerClassName="gap-4 p-4">{drawer}</ScrollView>
          </SafeAreaView>
          <Pressable className="flex-1 bg-black/40" onPress={() => setDrawerOpen(false)} />
        </View>
      </Modal>
    </SafeAreaView>
  );
}
