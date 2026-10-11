import '../global.css';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PressStart2P_400Regular, useFonts } from '@expo-google-fonts/press-start-2p';
import {
  IBMPlexMono_400Regular,
  IBMPlexMono_500Medium,
  IBMPlexMono_600SemiBold,
} from '@expo-google-fonts/ibm-plex-mono';
import { themeVars, useScheme } from '@/lib/theme';

const queryClient = new QueryClient();

export default function RootLayout() {
  const scheme = useScheme();
  const [fontsLoaded] = useFonts({
    PressStart2P_400Regular,
    IBMPlexMono_400Regular,
    IBMPlexMono_500Medium,
    IBMPlexMono_600SemiBold,
  });
  if (!fontsLoaded) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <View style={themeVars[scheme]} className="flex-1 bg-canvas">
        <Stack screenOptions={{ headerShown: false }} />
      </View>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
    </QueryClientProvider>
  );
}
