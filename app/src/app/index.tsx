import { ActivityIndicator, Text } from 'react-native';
import { Redirect } from 'expo-router';
import { useMyChannels } from '@/lib/api';
import { useSession } from '@/lib/auth';

// Home: signed out goes to the login page, signed in to the user's first channel
export default function Home() {
  const session = useSession();
  const { data: channels, error } = useMyChannels(session?.user.id ?? null);

  if (session === null) return <Redirect href="/login" />;
  if (error) return <Text className="p-4 font-mono text-ink">Failed to load: {error.message}</Text>;
  if (channels?.length) return <Redirect href={`/${channels[0].public_id}`} />;
  return <ActivityIndicator className="mt-10" />;
}
