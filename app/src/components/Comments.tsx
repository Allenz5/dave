import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useAddComment, useEditComment, useVoteComment, type Comment } from '@/lib/api';
import { useUserId } from '@/lib/auth';
import { useColors } from '@/lib/theme';
import { timeAgo } from '@/lib/time';
import { Avatar } from './Avatar';
import { PixelIcon } from './PixelIcon';
import { ButtonLabel, RetroButton } from './Retro';
import { VotePill } from './VotePill';

// Comment box: a sunken text field that shows its buttons once focused
export function Composer({
  postId,
  parentId = null,
  autoFocus,
  onDone,
}: {
  postId: number;
  parentId?: number | null;
  autoFocus?: boolean;
  onDone?: () => void;
}) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(!!autoFocus);
  const add = useAddComment(postId);
  const c = useColors();

  const close = () => {
    setText('');
    setOpen(false);
    onDone?.();
  };
  const submit = () => add.mutate({ body: text.trim(), parentId }, { onSuccess: close });

  return (
    <View className="gap-2">
      <View className="border border-line bg-surface">
        <TextInput
          value={text}
          onChangeText={setText}
          onFocus={() => setOpen(true)}
          autoFocus={autoFocus}
          multiline
          placeholder={parentId ? 'Write a reply' : 'Join the conversation'}
          placeholderTextColor={c['ink-weak']}
          className="min-h-10 px-3 py-2 font-mono text-sm text-ink"
          style={{ outlineStyle: 'none' } as any}
        />
      </View>
      {open && (
        <View className="flex-row justify-end gap-2">
          <RetroButton onPress={close}>
            <ButtonLabel>Cancel</ButtonLabel>
          </RetroButton>
          <RetroButton tone="primary" onPress={submit} disabled={!text.trim() || add.isPending}>
            <ButtonLabel light>Comment</ButtonLabel>
          </RetroButton>
        </View>
      )}
    </View>
  );
}

// Edit a comment's text in place
function EditBox({ comment, onDone }: { comment: Comment; onDone: () => void }) {
  const [text, setText] = useState(comment.body);
  const edit = useEditComment(comment.post_id);
  const save = () => edit.mutate({ id: comment.id, body: text.trim() }, { onSuccess: onDone });

  return (
    <View className="gap-2 pl-1">
      <View className="border border-line bg-surface">
        <TextInput
          value={text}
          onChangeText={setText}
          autoFocus
          multiline
          className="min-h-10 px-3 py-2 font-mono text-sm text-ink"
          style={{ outlineStyle: 'none' } as any}
        />
      </View>
      <View className="flex-row justify-end gap-2">
        <RetroButton onPress={onDone}>
          <ButtonLabel>Cancel</ButtonLabel>
        </RetroButton>
        <RetroButton tone="primary" onPress={save} disabled={!text.trim() || edit.isPending}>
          <ButtonLabel light>Save</ButtonLabel>
        </RetroButton>
      </View>
    </View>
  );
}

function CommentItem({
  comment,
  childrenOf,
  canLabel,
}: {
  comment: Comment;
  childrenOf: Map<number | null, Comment[]>;
  canLabel: boolean;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [replying, setReplying] = useState(false);
  const [editing, setEditing] = useState(false);
  const vote = useVoteComment(comment.post_id);
  const c = useColors();
  const replies = childrenOf.get(comment.id) ?? [];
  const userId = useUserId();
  const mine = userId !== null && comment.user_id === userId;

  return (
    <View className="flex-row">
      {/* Left rail: avatar + thread line; tap to collapse */}
      <View className="w-7 items-center">
        {collapsed ? (
          <Pressable onPress={() => setCollapsed(false)} className="h-7 justify-center" accessibilityLabel="Expand comment">
            <PixelIcon name="plus" size={16} color={c['ink-weak']} />
          </Pressable>
        ) : (
          <>
            <View className="h-7 justify-center">
              <Avatar name={comment.author_name} size={20} />
            </View>
            <Pressable
              onPress={() => setCollapsed(true)}
              className="group w-4 flex-1 items-center"
              accessibilityLabel="Collapse comment"
            >
              <View className="w-0.5 flex-1 bg-pill-hover group-hover:bg-ink-weak" />
            </Pressable>
          </>
        )}
      </View>

      <View className="min-w-0 flex-1">
        <View className="h-7 flex-row items-center gap-2 pl-1">
          <Text className="text-xs font-semibold text-ink">{comment.author_name}</Text>
          <Text className="font-mono text-xs text-ink-weak">{timeAgo(comment.created_at)}</Text>
        </View>
        {!collapsed && (
          <>
            {editing ? (
              <EditBox comment={comment} onDone={() => setEditing(false)} />
            ) : (
              <Text className="pl-1 text-sm leading-5 text-ink">{comment.body}</Text>
            )}
            <View className="flex-row items-center">
              <VotePill
                score={comment.score}
                myVote={comment.myVote}
                onVote={(value) => vote.mutate({ id: comment.id, value })}
                disabled={!canLabel}
              />
              {userId !== null && (
                <Pressable
                  onPress={() => setReplying(true)}
                  className="h-7 flex-row items-center gap-1.5 px-2 hover:bg-pill"
                >
                  <PixelIcon name="comment" size={12} color={c['ink-weak']} />
                  <Text className="font-mono-bold text-xs text-ink-weak">Reply</Text>
                </Pressable>
              )}
              {mine && (
                <Pressable onPress={() => setEditing(true)} className="h-7 justify-center px-2 hover:bg-pill">
                  <Text className="font-mono-bold text-xs text-ink-weak">Edit</Text>
                </Pressable>
              )}
            </View>
            {replying && (
              <View className="mb-2">
                <Composer
                  postId={comment.post_id}
                  parentId={comment.id}
                  autoFocus
                  onDone={() => setReplying(false)}
                />
              </View>
            )}
            {replies.map((r) => (
              <CommentItem key={r.id} comment={r} childrenOf={childrenOf} canLabel={canLabel} />
            ))}
          </>
        )}
      </View>
    </View>
  );
}

// limit caps the number of top-level threads shown; canLabel lets the channel owner vote on comments
export function CommentTree({
  comments,
  limit,
  canLabel,
}: {
  comments: Comment[];
  limit?: number;
  canLabel: boolean;
}) {
  const childrenOf = new Map<number | null, Comment[]>();
  for (const comment of comments) {
    const list = childrenOf.get(comment.parent_id) ?? [];
    list.push(comment);
    childrenOf.set(comment.parent_id, list);
  }
  return (
    <View className="gap-2">
      {(childrenOf.get(null) ?? []).slice(0, limit).map((comment) => (
        <CommentItem key={comment.id} comment={comment} childrenOf={childrenOf} canLabel={canLabel} />
      ))}
    </View>
  );
}
