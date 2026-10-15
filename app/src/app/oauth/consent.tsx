import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import type { OAuthAuthorizationDetails } from '@supabase/supabase-js';
import { supabase } from '@db/client';
import { ButtonLabel, RetroButton } from '@/components/Retro';
import { Shell } from '@/components/Shell';
import { signIn, useSession } from '@/lib/auth';

// Supabase Auth sends an agent's OAuth request here; the signed-in user approves or denies it,
// and Supabase sends the agent back with a code or an error
export default function ConsentScreen() {
  const { authorization_id: id } = useLocalSearchParams<{ authorization_id?: string }>();
  const session = useSession();
  const [details, setDetails] = useState<OAuthAuthorizationDetails | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session || !id) return;
    supabase.auth.oauth.getAuthorizationDetails(id).then(({ data, error }) => {
      if (error) setError(error.message);
      // Already approved before: Supabase hands back the redirect at once
      else if ('redirect_url' in data) window.location.href = data.redirect_url;
      else setDetails(data);
    });
  }, [session, id]);

  const decide = async (approve: boolean) => {
    const { error } = approve
      ? await supabase.auth.oauth.approveAuthorization(id!)
      : await supabase.auth.oauth.denyAuthorization(id!);
    if (error) setError(error.message);
  };

  return (
    <Shell>
      <View className="w-full max-w-[480px] gap-4 self-center px-3 py-10">
        {!id ? (
          <Text className="font-mono text-ink">Missing authorization request.</Text>
        ) : error ? (
          <Text className="font-mono text-ink">Failed: {error}</Text>
        ) : !session ? (
          <>
            <Text className="font-bold text-2xl text-ink">Connect an agent</Text>
            <Text className="text-sm leading-6 text-ink">Sign in to let your agent work on your channels.</Text>
            <View className="flex-row">
              <RetroButton tone="primary" onPress={signIn}>
                <ButtonLabel light>Sign in with Google</ButtonLabel>
              </RetroButton>
            </View>
          </>
        ) : !details ? (
          <ActivityIndicator />
        ) : (
          <>
            <Text className="font-bold text-2xl text-ink">Connect {details.client.name || 'an agent'}?</Text>
            <Text className="text-sm leading-6 text-ink">
              It will act as {details.user.email}: read your channels, add and remove their posts, and change their filter
              prompts and search keywords.
            </Text>
            <View className="flex-row gap-2">
              <RetroButton tone="primary" onPress={() => decide(true)}>
                <ButtonLabel light>Allow</ButtonLabel>
              </RetroButton>
              <RetroButton onPress={() => decide(false)}>
                <ButtonLabel>Deny</ButtonLabel>
              </RetroButton>
            </View>
          </>
        )}
      </View>
    </Shell>
  );
}
