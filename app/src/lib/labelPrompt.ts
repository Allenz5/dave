import { useEffect, useRef, useState } from 'react';
import { useHasLabels, useStrategy, type Post } from './api';

// After this many iterations the channel no longer asks
const ASKING_ITERATIONS = 5;

// In a channel's first iterations the agent asks the owner to label posts, one post at a time: in a channel not yet
// labeled, the feed's first post at once; else an unlabeled post the first time the mouse goes over it, by a chance
// that falls with each iteration. Each post is decided once per visit.
// Voted on or given feedback: the agent has its answer
const labeled = (post: Post) => post.myVote !== 0 || !!post.feedback;

export function useLabelPrompt(channelId: number, enabled: boolean, firstPost: Post | undefined) {
  const { data: strategy } = useStrategy(channelId);
  const iterations = strategy?.iterations ?? ASKING_ITERATIONS;
  const asking = enabled && iterations < ASKING_ITERATIONS;
  const { data: hasLabels } = useHasLabels(channelId, asking && iterations === 0);
  const [open, setOpen] = useState<number | null>(null);
  const decided = useRef(new Set<number>());

  useEffect(() => {
    if (hasLabels !== false || !firstPost || labeled(firstPost) || decided.current.has(firstPost.id)) return;
    decided.current.add(firstPost.id);
    setOpen(firstPost.id);
  }, [hasLabels, firstPost]);

  const hover = (post: Post) => {
    if (!asking || decided.current.has(post.id) || labeled(post)) return;
    decided.current.add(post.id);
    if (Math.random() < 0.5 * (1 - iterations / ASKING_ITERATIONS)) setOpen(post.id);
  };
  return { open, hover, close: () => setOpen(null) };
}
