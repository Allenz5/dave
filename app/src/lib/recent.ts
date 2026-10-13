// Channels this browser opened, newest first. Kept in localStorage, so it is per viewer and may be empty.
const KEY = 'recentChannels';
const MAX = 20;

export function recentChannels(): string[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]');
  } catch {
    return [];
  }
}

export function markOpened(slug: string) {
  try {
    localStorage.setItem(KEY, JSON.stringify([slug, ...recentChannels().filter((s) => s !== slug)].slice(0, MAX)));
  } catch {}
}
