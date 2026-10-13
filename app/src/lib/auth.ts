import { useSyncExternalStore } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@db/client';

// One session for the whole app, kept current by Supabase's auth events
let session: Session | null = null;
const listeners = new Set<() => void>();
supabase.auth.onAuthStateChange((_event, next) => {
  session = next;
  listeners.forEach((l) => l());
});

export function useSession() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => session,
  );
}

export const useUserId = () => useSession()?.user.id ?? null;

// Google is the only sign-in; it comes back to the page the user was on
export const signIn = () =>
  supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.href } });

export const signOut = () => supabase.auth.signOut();
