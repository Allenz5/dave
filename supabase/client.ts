import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  // Google sign-in returns to the page with a code, which the client exchanges for a session
  { auth: { flowType: 'pkce' } },
);
