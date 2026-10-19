import { useState } from 'react';

// What the user gives their agent: to set dave up, to find why it stopped running, and to run once now
export const SETUP = 'Set up dave for me by following https://dave-pi-nine.vercel.app/agent.md';
export const RECONNECT =
  'dave says you stopped running. Find out why and fix it by following https://dave-pi-nine.vercel.app/reconnect.md';
export const RUN = 'Call the dave tool get_playbook and follow it.';

// Copies text for the user to give their agent; `copied` stays true for two seconds after
export function useCopy(text: string) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return { copied, copy };
}
