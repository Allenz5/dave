import { useState } from 'react';
import { Image, Linking, Pressable, Text, TextInput, View } from 'react-native';
import { useComments, useDeletePost, useSaveFeedback, useVotePost, type Post } from '@/lib/api';
import { useUserId } from '@/lib/auth';
import { useColors } from '@/lib/theme';
import { timeAgo } from '@/lib/time';
import { CommentTree, Composer } from './Comments';
import { Embed } from './Embed';
import { PixelIcon } from './PixelIcon';
import { RetroButton } from './Retro';

// The owner's label: one thumb, then a feedback note in the same row; nobody else sees any of it
export function PostActions({ post, canLabel }: { post: Post; canLabel: boolean }) {
  const vote = useVotePost();
  const save = useSaveFeedback();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const c = useColors();
  if (!canLabel) return null;

  const thumb = (value: 1 | -1) => {
    const on = post.myVote === value;
    return (
      <RetroButton
        square
        tone={on ? (value === 1 ? 'up' : 'down') : 'default'}
        onPress={() => vote.mutate({ id: post.id, value: on ? 0 : value })}
        accessibilityLabel={value === 1 ? 'Thumbs up' : 'Thumbs down'}
      >
        <PixelIcon name={value === 1 ? 'thumbUp' : 'thumbDown'} color={on ? '#FFFFFF' : c.ink} />
      </RetroButton>
    );
  };
  const edit = () => {
    setText(post.feedback ?? '');
    setEditing(true);
  };
  const submit = () => {
    save.mutate({ id: post.id, body: text.trim() });
    setEditing(false);
  };

  return (
    <View className="mt-3 flex-row items-center gap-1">
      {thumb(1)}
      {thumb(-1)}
      <RetroButton square onPress={editing ? submit : edit} accessibilityLabel="Feedback">
        <PixelIcon name="comment" color={c.ink} />
      </RetroButton>
      {editing ? (
        <TextInput
          value={text}
          onChangeText={setText}
          onSubmitEditing={submit}
          onKeyPress={(e) => e.nativeEvent.key === 'Escape' && setEditing(false)}
          autoFocus
          placeholder="Feedback for the filter"
          placeholderTextColor={c['ink-weak']}
          className="ml-1 h-8 min-w-0 flex-1 border border-line bg-surface px-2 font-mono text-xs text-ink"
          style={{ outlineStyle: 'none' } as any}
        />
      ) : (
        !!post.feedback && (
          <Text onPress={edit} className="ml-1 min-w-0 flex-1 text-xs leading-4 text-ink-weak">
            {post.feedback}
          </Text>
        )
      )}
    </View>
  );
}

export function PostImage({ uri }: { uri: string }) {
  return (
    <Image
      source={{ uri }}
      className="mt-3 w-full border border-line bg-pill"
      style={{ aspectRatio: 16 / 10 }}
      resizeMode="cover"
    />
  );
}

const host = (url: string) => url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];

// What the agent's web search added to a reposted post, with the sources to read more
export function AgentNote({ post }: { post: Post }) {
  if (!post.embed_provider || !post.body) return null;
  return (
    <View className="mt-3 gap-1 border-l-2 border-line pl-3">
      <Text className="font-mono-bold text-xs text-ink-weak">Agent note</Text>
      <Text className="text-sm leading-5 text-ink">{post.body}</Text>
      <View className="flex-row flex-wrap gap-x-3">
        {post.sources.map((url) => (
          <Text
            key={url}
            onPress={() => Linking.openURL(url)}
            className="font-mono text-xs text-primary hover:underline"
          >
            {host(url)}
          </Text>
        ))}
      </View>
    </View>
  );
}

export function PostEmbed({ post }: { post: Post }) {
  if (!post.embed_provider || !post.embed_id) return null;
  return (
    <View className="mt-3">
      <Embed provider={post.embed_provider} id={post.embed_id} />
    </View>
  );
}

// Posts are reposts by the agent, so the bar shows only when the original was posted
export function PostTitleBar({ time }: { time: string }) {
  return <Text className="font-mono text-xs text-ink-weak">{timeAgo(time)}</Text>;
}

const FEED_COMMENTS = 5;

// The post's top comment threads and a comment box, shown under it in the feed
function FeedComments({ post, canLabel }: { post: Post; canLabel: boolean }) {
  const { data: comments } = useComments(post.id);
  const userId = useUserId();
  const [all, setAll] = useState(false);
  const threads = comments?.filter((c) => c.parent_id === null).length ?? 0;
  return (
    <View className="gap-3 px-3 pb-4">
      {comments && <CommentTree comments={comments} limit={all ? undefined : FEED_COMMENTS} canLabel={canLabel} />}
      {!all && threads > FEED_COMMENTS && (
        <Pressable onPress={() => setAll(true)} className="self-start">
          <Text className="font-mono-bold text-xs text-ink-weak hover:text-ink">
            View all {post.comment_count} comments
          </Text>
        </Pressable>
      )}
      {userId !== null && <Composer postId={post.id} />}
    </View>
  );
}

// Post card in the feed with its comments below. The owner can delete it with the x.
export function PostCard({ post, canLabel }: { post: Post; canLabel: boolean }) {
  const remove = useDeletePost();
  const c = useColors();
  return (
    <View>
      <View className="px-3 pb-3 pt-4">
        <View className="flex-row items-center gap-2">
          <PostTitleBar time={post.created_at} />
          {post.filter_decision === 'dropped' && (
            <Text className="border border-line px-1.5 font-mono text-xs text-ink-weak">Filtered out</Text>
          )}
          {canLabel && (
            <Pressable
              onPress={() => remove.mutate(post.id)}
              className="ml-auto h-6 w-6 items-center justify-center hover:bg-pill"
              accessibilityLabel="Delete post"
            >
              <PixelIcon name="close" size={10} color={c['ink-weak']} />
            </Pressable>
          )}
        </View>
        {post.title && (
          <Text className="mt-2 font-semibold text-lg leading-6 text-ink">{post.title}</Text>
        )}
        {!post.image_url && !post.embed_provider && !!post.body && (
          <Text numberOfLines={3} className="mt-1.5 text-sm leading-5 text-ink-weak">
            {post.body}
          </Text>
        )}
        {post.image_url && <PostImage uri={post.image_url} />}
        <PostEmbed post={post} />
        <AgentNote post={post} />
      </View>
      <View className="px-3 pb-4">
        <PostActions post={post} canLabel={canLabel} />
      </View>
      <FeedComments post={post} canLabel={canLabel} />
    </View>
  );
}
