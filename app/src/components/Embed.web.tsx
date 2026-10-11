import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import type { EmbedProvider } from '@/lib/api';
import { useScheme } from '@/lib/theme';

type Twttr = {
  widgets: { createTweet(id: string, el: HTMLElement, options: object): Promise<unknown> };
};

let widgets: Promise<Twttr> | undefined;

// Load X's official widgets.js once and reuse it for every embed.
function loadWidgets() {
  widgets ??= new Promise((resolve) => {
    const script = document.createElement('script');
    script.src = 'https://platform.twitter.com/widgets.js';
    script.async = true;
    script.onload = () => resolve((window as any).twttr);
    document.head.appendChild(script);
  });
  return widgets;
}

function XEmbed({ id }: { id: string }) {
  const ref = useRef<View>(null);
  const scheme = useScheme();

  useEffect(() => {
    const el = ref.current as unknown as HTMLElement;
    let cancelled = false;
    loadWidgets().then((twttr) => {
      if (cancelled) return;
      el.innerHTML = '';
      twttr.widgets.createTweet(id, el, { theme: scheme, dnt: true });
    });
    return () => {
      cancelled = true;
    };
  }, [id, scheme]);

  return <View ref={ref} className="min-h-24" />;
}

function YouTubeEmbed({ id }: { id: string }) {
  return (
    <View className="overflow-hidden border border-line bg-black">
      <iframe
        src={`https://www.youtube-nocookie.com/embed/${id}`}
        style={{ width: '100%', aspectRatio: '16 / 9', border: 0 }}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    </View>
  );
}

export function Embed({ provider, id }: { provider: EmbedProvider; id: string }) {
  return provider === 'x' ? <XEmbed id={id} /> : <YouTubeEmbed id={id} />;
}
