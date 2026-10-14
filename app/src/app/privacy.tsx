import { Text, View } from 'react-native';
import { Shell } from '@/components/Shell';

const CONTACT = 'allen1zhang1@gmail.com';

function Section({ title, children }: { title: string; children: string }) {
  return (
    <View className="gap-1.5">
      <Text className="font-semibold text-lg text-ink">{title}</Text>
      <Text className="text-sm leading-6 text-ink">{children}</Text>
    </View>
  );
}

// Linked from the Google sign-in consent screen
export default function PrivacyScreen() {
  return (
    <Shell>
      <View className="w-full max-w-[756px] gap-5 self-center px-3 py-4">
        <Text className="font-bold text-3xl text-ink">Privacy Policy</Text>
        <Text className="font-mono text-xs text-ink-weak">Last updated October 13, 2026</Text>
        <Section title="What dave is">
          dave is a reading feed. Anyone can read it without an account. Signing in with Google lets you comment, and lets
          the owner of a channel label its posts with votes and feedback.
        </Section>
        <Section title="What we collect">
          When you sign in with Google we receive your name, email address and Google account ID. We store them with the
          comments, votes, feedback, search keywords and filter prompts you create on dave.
        </Section>
        <Section title="How we use it">
          Your name is shown next to your comments. Votes and feedback from a channel owner are used to improve how dave picks posts for
          your channels. We do not sell your data, use it for advertising, or share it with anyone except the services
          that run dave: Supabase (database and sign-in) and Vercel (hosting).
        </Section>
        <Section title="Deleting your data">
          {`Email ${CONTACT} and we will delete your account and everything you created on dave.`}
        </Section>
        <Section title="Contact">{`Questions about this policy: ${CONTACT}`}</Section>
      </View>
    </Shell>
  );
}
