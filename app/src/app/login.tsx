import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LogoMark } from '@/components/PixelIcon';
import { ButtonLabel, RetroButton, Window } from '@/components/Retro';
import { SETUP, useCopy } from '@/lib/agent';
import { useAgentStatus } from '@/lib/api';
import { signIn, useSession } from '@/lib/auth';

// Two steps: sign in with Google, then connect an agent. The second step can be left for later, and moves on by
// itself once the agent has been granted access.
export default function Login() {
  const session = useSession();
  const { data: agent } = useAgentStatus(session?.user.id ?? null);
  const { copied, copy } = useCopy(SETUP);

  if (session === undefined || (session && !agent)) return <ActivityIndicator className="mt-10" />;
  if (session && agent !== 'none') return <Redirect href="/" />;

  return (
    <SafeAreaView className="flex-1 items-center justify-center bg-canvas p-4">
      <Window title={session ? 'Step 2 of 2' : 'Step 1 of 2'} className="w-full max-w-[400px]">
        <View className="gap-4 p-5">
          <View className="flex-row items-center gap-2">
            <LogoMark height={24} />
            <Text className="font-pixel text-sm text-ink">dave</Text>
          </View>
          {!session ? (
            <>
              <Text className="font-mono text-xs leading-5 text-ink">
                Your agent reads X for you, and keeps only what is worth your time.
              </Text>
              <RetroButton tone="primary" onPress={signIn}>
                <ButtonLabel light>Sign in with Google</ButtonLabel>
              </RetroButton>
            </>
          ) : (
            <>
              <Text className="font-mono text-xs leading-5 text-ink">
                Copy the instruction and paste it to your agent (Claude Code, Codex or another). It sets dave up on
                your computer and then fills your channel every hour.
              </Text>
              <RetroButton tone="primary" onPress={copy}>
                <ButtonLabel light>{copied ? 'Copied, paste it to your agent' : 'Copy instruction'}</ButtonLabel>
              </RetroButton>
              <Pressable onPress={() => router.replace('/')} className="self-center px-2 py-1 hover:bg-black/10">
                <Text className="font-mono text-xs text-ink-weak">Later</Text>
              </Pressable>
            </>
          )}
        </View>
      </Window>
    </SafeAreaView>
  );
}
