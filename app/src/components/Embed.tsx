import { useState } from 'react';
import { Linking, View } from 'react-native';
import { WebView } from 'react-native-webview';
import type { ShouldStartLoadRequest } from 'react-native-webview/lib/WebViewTypes';
import type { EmbedProvider } from '@/lib/api';
import { useScheme } from '@/lib/theme';

const BASE_URL = 'https://dave.local/';

// Keep the embed inside the WebView; any link the user taps opens in the system browser.
function openLinksOutside(req: ShouldStartLoadRequest) {
  if (req.url === BASE_URL || req.url.startsWith('about:') || !req.isTopFrame) return true;
  Linking.openURL(req.url);
  return false;
}

function page(body: string) {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;background:transparent}</style></head><body>${body}</body></html>`;
}

function XEmbed({ id }: { id: string }) {
  const scheme = useScheme();
  const [height, setHeight] = useState(200);
  // Render with X's official widgets.js, then report the content height back to React Native.
  const html = page(`<div id="t"></div>
<script src="https://platform.twitter.com/widgets.js"></script>
<script>
  twttr.widgets.createTweet(${JSON.stringify(id)}, document.getElementById('t'), { theme: '${scheme}', dnt: true })
    .then(function () {
      new ResizeObserver(function () {
        window.ReactNativeWebView.postMessage(String(document.body.scrollHeight));
      }).observe(document.body);
    });
</script>`);

  return (
    <WebView
      source={{ html, baseUrl: BASE_URL }}
      style={{ height, backgroundColor: 'transparent' }}
      scrollEnabled={false}
      onMessage={(e) => setHeight(Number(e.nativeEvent.data) || 200)}
      onShouldStartLoadWithRequest={openLinksOutside}
    />
  );
}

function YouTubeEmbed({ id }: { id: string }) {
  const html = page(
    `<iframe src="https://www.youtube-nocookie.com/embed/${id}" style="width:100%;height:100vh;border:0"
      allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`,
  );
  return (
    <View className="overflow-hidden border border-line bg-black" style={{ aspectRatio: 16 / 9 }}>
      <WebView
        source={{ html, baseUrl: BASE_URL }}
        allowsInlineMediaPlayback
        allowsFullscreenVideo
        scrollEnabled={false}
        onShouldStartLoadWithRequest={openLinksOutside}
      />
    </View>
  );
}

export function Embed({ provider, id }: { provider: EmbedProvider; id: string }) {
  return provider === 'x' ? <XEmbed id={id} /> : <YouTubeEmbed id={id} />;
}
