import { useRef, useState, type ReactNode } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import Markdown from 'react-native-markdown-display';
import {
  useAddKeyword,
  useDeleteKeyword,
  useEnqueueTask,
  useKeywords,
  useStrategy,
  useTasks,
  useUpdateCrawlIntensity,
  useUpdateFilterPrompt,
  type Keyword,
  type TaskType,
} from '@/lib/api';
import { useColors } from '@/lib/theme';
import { timeAgo } from '@/lib/time';
import { PixelIcon } from './PixelIcon';
import { ButtonLabel, RetroButton, Window } from './Retro';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View className="gap-1.5">
      <Text className="font-mono-bold text-xs text-ink-weak">{label}</Text>
      {children}
    </View>
  );
}

// A keyword chip; the channel owner also gets a delete button on the right
function Chip({
  keyword,
  channelId,
  canEdit,
}: {
  keyword: Keyword;
  channelId: number;
  canEdit: boolean;
}) {
  const remove = useDeleteKeyword(channelId);
  const c = useColors();
  return (
    <View className="flex-row items-center border border-line bg-surface">
      <Text className={`py-1 pl-2 font-mono text-xs text-ink ${canEdit ? 'pr-1' : 'pr-2'}`}>
        {keyword.query}
      </Text>
      {canEdit && (
        <Pressable
          onPress={() => remove.mutate(keyword.id)}
          className="h-6 w-6 items-center justify-center hover:bg-pill"
          accessibilityLabel={`Delete ${keyword.query}`}
        >
          <PixelIcon name="close" size={8} color={c['ink-weak']} />
        </Pressable>
      )}
    </View>
  );
}

// Type a keyword and press Enter or Add
function AddKeyword({ channelId }: { channelId: number }) {
  const [text, setText] = useState('');
  const input = useRef<TextInput>(null);
  const add = useAddKeyword(channelId);
  const c = useColors();
  const query = text.trim();

  // Focus stays in the box so several keywords can be added in a row
  const submit = () =>
    query &&
    add.mutate(query, {
      onSuccess: () => {
        setText('');
        input.current?.focus();
      },
    });
  const duplicate = (add.error as { code?: string } | null)?.code === '23505';

  return (
    <View className="gap-1">
      <View className="flex-row gap-1.5">
        <View className="min-w-0 flex-1 border border-line bg-surface">
          <TextInput
            value={text}
            onChangeText={(t) => {
              setText(t);
              add.reset();
            }}
            onSubmitEditing={submit}
            ref={input}
            maxLength={200}
            placeholder="Add a keyword"
            placeholderTextColor={c['ink-weak']}
            className="h-7 px-2 font-mono text-xs text-ink"
            style={{ outlineStyle: 'none' } as any}
          />
        </View>
        <RetroButton tone="primary" onPress={submit} disabled={!query || add.isPending}>
          <ButtonLabel light>Add</ButtonLabel>
        </RetroButton>
      </View>
      {add.error && (
        <Text className="font-mono text-xs text-primary">
          {duplicate ? 'Already in the list' : add.error.message}
        </Text>
      )}
    </View>
  );
}

const TASK_LABEL: Record<TaskType, string> = { collect: 'Collect now', refine: 'Refine now' };

// Queues a task for the owner's agent, with the latest task of that type beside it
function RunTask({ channelId, type }: { channelId: number; type: TaskType }) {
  const { data: tasks } = useTasks(channelId);
  const enqueue = useEnqueueTask(channelId);
  const last = tasks?.find((t) => t.type === type);
  const open = last?.status === 'queued' || last?.status === 'running';
  const status =
    last &&
    (last.status === 'failed'
      ? `Failed ${timeAgo(last.finished_at!)}: ${last.error}`
      : last.status === 'done'
        ? `Done ${timeAgo(last.finished_at!)}`
        : last.status === 'running'
          ? 'Running'
          : `Queued ${timeAgo(last.created_at)}, waiting for your agent`);
  return (
    <View className="gap-1">
      <View className="flex-row items-center gap-2">
        <RetroButton onPress={() => enqueue.mutate(type)} disabled={open || enqueue.isPending}>
          <ButtonLabel>{TASK_LABEL[type]}</ButtonLabel>
        </RetroButton>
        {status && <Text className="min-w-0 flex-1 font-mono text-xs text-ink-weak">{status}</Text>}
      </View>
      {enqueue.error && <Text className="font-mono text-xs text-primary">{enqueue.error.message}</Text>}
    </View>
  );
}

// The X search keywords for a topic; canEdit (the channel owner) adds and deletes them.
// Five-step bar: tap a step to set the level; filled up to the current one
function Intensity({ channelId, level, canEdit }: { channelId: number; level: number; canEdit: boolean }) {
  const update = useUpdateCrawlIntensity(channelId);
  return (
    <View className="h-5 flex-row gap-1">
      {[1, 2, 3, 4, 5].map((step) => (
        <Pressable
          key={step}
          onPress={() => update.mutate(step)}
          disabled={!canEdit}
          accessibilityLabel={`Crawl intensity ${step}`}
          className={`flex-1 border border-line ${step <= level ? 'bg-primary' : 'bg-pill'} ${canEdit ? 'hover:opacity-80' : ''}`}
        />
      ))}
    </View>
  );
}

export function SearchCard({ channelId, canEdit }: { channelId: number; canEdit: boolean }) {
  const { data: s } = useStrategy(channelId);
  const { data: keywords } = useKeywords(channelId);
  return (
    <Window title="Search">
      {s && (
        <View className="gap-4 p-3">
          <Field label="Keywords">
            <View className="flex-row flex-wrap gap-1.5">
              {keywords?.map((k) => (
                <Chip key={k.id} keyword={k} channelId={channelId} canEdit={canEdit} />
              ))}
            </View>
            {canEdit && <AddKeyword channelId={channelId} />}
          </Field>
          <Field label="Crawl intensity">
            <Intensity channelId={channelId} level={s.crawl_intensity} canEdit={canEdit} />
          </Field>
          {canEdit && <RunTask channelId={channelId} type="collect" />}
        </View>
      )}
    </Window>
  );
}

// The prompt the agent screens collected posts with: rendered as markdown, editable in place by the channel owner.
export function FilterCard({ channelId, canEdit }: { channelId: number; canEdit: boolean }) {
  const { data: s } = useStrategy(channelId);
  const update = useUpdateFilterPrompt(channelId);
  const [draft, setDraft] = useState<string | null>(null);
  const c = useColors();

  const save = () => update.mutate(draft!, { onSuccess: () => setDraft(null) });

  return (
    <Window title="Filter">
      {s && (
        <View className="gap-2 p-3">
          {draft === null ? (
            <>
              <Markdown style={markdownStyle(c)}>{s.filter_prompt}</Markdown>
              {canEdit && (
                <View className="flex-row items-start gap-2">
                  <View className="min-w-0 flex-1">
                    <RunTask channelId={channelId} type="refine" />
                  </View>
                  <RetroButton onPress={() => setDraft(s.filter_prompt)}>
                    <ButtonLabel>Edit</ButtonLabel>
                  </RetroButton>
                </View>
              )}
            </>
          ) : (
            <>
              <View className="border border-line bg-surface">
                <TextInput
                  value={draft}
                  onChangeText={setDraft}
                  autoFocus
                  multiline
                  className="min-h-64 px-2 py-2 font-mono text-xs leading-5 text-ink"
                  style={{ outlineStyle: 'none' } as any}
                />
              </View>
              <View className="flex-row justify-end gap-2">
                <RetroButton onPress={() => setDraft(null)}>
                  <ButtonLabel>Cancel</ButtonLabel>
                </RetroButton>
                <RetroButton
                  tone="primary"
                  onPress={save}
                  disabled={!draft.trim() || update.isPending}
                >
                  <ButtonLabel light>Save</ButtonLabel>
                </RetroButton>
              </View>
            </>
          )}
        </View>
      )}
    </Window>
  );
}

function markdownStyle(c: ReturnType<typeof useColors>) {
  return {
    body: { color: c.ink, fontSize: 13, lineHeight: 19 },
    heading1: { fontSize: 18, fontWeight: '700' as const, marginVertical: 6 },
    // Section titles (Reader, Keep, Drop, Verify) look like the Search panel's field labels
    heading2: {
      fontFamily: 'IBMPlexMono_600SemiBold',
      fontSize: 12,
      color: c['ink-weak'],
      marginTop: 12,
      marginBottom: 4,
    },
    heading3: { fontSize: 13, fontWeight: '700' as const, marginVertical: 4 },
    paragraph: { marginTop: 0, marginBottom: 4 },
    bullet_list: { marginBottom: 0 },
    ordered_list: { marginBottom: 0 },
    list_item: { marginBottom: 6 },
    code_inline: { fontFamily: 'IBMPlexMono_400Regular', backgroundColor: c.pill, color: c.ink },
    // The example under each rule: small, muted and set off by a thin line, so the rules read first
    fence: {
      fontFamily: 'IBMPlexMono_400Regular',
      fontSize: 10,
      lineHeight: 14,
      color: c['ink-weak'],
      backgroundColor: 'transparent',
      borderWidth: 0,
      borderLeftWidth: 2,
      borderLeftColor: c.line,
      borderRadius: 0,
      padding: 0,
      paddingLeft: 8,
      marginTop: 2,
      marginBottom: 0,
    },
    link: { color: c.primary },
    hr: { backgroundColor: c.line },
  };
}
