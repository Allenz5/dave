import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import Markdown from 'react-native-markdown-display';
import {
  useAddKeyword,
  useAgentStatus,
  useDeleteKeyword,
  useKeywords,
  useRefineQueued,
  useRunNow,
  useSetRefine,
  useStrategy,
  useUpdateFilterPrompt,
  useUpdateSettings,
  type Keyword,
} from '@/lib/api';
import { RUN, useCopy } from '@/lib/agent';
import { useUserId } from '@/lib/auth';
import { useColors } from '@/lib/theme';
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
    <View className="max-w-full flex-row items-center border border-line bg-surface">
      <Text className={`min-w-0 shrink py-1 pl-2 font-mono text-xs text-ink ${canEdit ? 'pr-1' : 'pr-2'}`}>
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

export function SearchCard({ channelId, canEdit }: { channelId: number; canEdit: boolean }) {
  const { data: s } = useStrategy(channelId);
  const { data: keywords } = useKeywords(channelId);
  return (
    <Window title="Keywords">
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
    <Window title="Rubric">
      {s && (
        <View className="gap-2 p-3">
          {draft === null ? (
            <>
              <Markdown style={markdownStyle(c)}>{fenceExamples(s.filter_prompt)}</Markdown>
              {canEdit && (
                <View className="flex-row justify-end">
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

const POSTS_PER_KEYWORD = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50];

function Checkbox({ checked, label, onPress }: { checked: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} className="flex-row items-center gap-2 self-start py-0.5 hover:opacity-80">
      <View className={`h-4 w-4 border border-line ${checked ? 'bg-primary' : 'bg-surface'}`} />
      <Text className="font-mono text-xs text-ink">{label}</Text>
    </Pressable>
  );
}

// A value that opens a list of choices below it
function Dropdown({ value, options, onChange }: { value: number; options: number[]; onChange: (v: number) => void }) {
  const [open, setOpen] = useState(false);
  const c = useColors();
  return (
    <View className="self-start border border-line bg-surface">
      <Pressable onPress={() => setOpen(!open)} className="h-7 flex-row items-center gap-2 px-2 hover:bg-pill">
        <Text className="w-6 font-mono text-xs text-ink">{value}</Text>
        <PixelIcon name={open ? 'up' : 'down'} size={8} color={c['ink-weak']} />
      </Pressable>
      {open &&
        options.map((o) => (
          <Pressable
            key={o}
            onPress={() => {
              onChange(o);
              setOpen(false);
            }}
            className={`h-6 justify-center border-t border-line px-2 ${o === value ? 'bg-pill' : 'hover:bg-pill'}`}
          >
            <Text className="font-mono text-xs text-ink">{o}</Text>
          </Pressable>
        ))}
    </View>
  );
}

// Minutes to the next full hour, when every agent runs; kept current every half minute
function useMinutesToHour() {
  const left = () => 60 - new Date().getMinutes();
  const [minutes, setMinutes] = useState(left);
  useEffect(() => {
    const id = setInterval(() => setMinutes(left()), 30_000);
    return () => clearInterval(id);
  }, []);
  return minutes;
}

// How the owner's agent runs this channel: when it next runs, how many posts each keyword takes, pausing, refining
// on the next run, and a collect right away, which queues it and copies the prompt to give the agent. Only the owner sees it.
export function ConfigCard({ channelId }: { channelId: number }) {
  const { data: s } = useStrategy(channelId);
  const { data: agent } = useAgentStatus(useUserId());
  const update = useUpdateSettings(channelId);
  const { data: refine } = useRefineQueued(channelId);
  const setRefine = useSetRefine(channelId);
  const runNow = useRunNow(channelId);
  const minutes = useMinutesToHour();
  const { copied, copy } = useCopy(RUN);

  const next = s?.paused
    ? 'Paused'
    : agent === 'connected'
      ? `In ${minutes} min`
      : agent === 'stalled'
        ? 'Agent offline'
        : 'No agent connected';

  return (
    <Window title="Configuration">
      {s && (
        <View className="gap-4 p-3">
          <Field label="Next run">
            <Text className="font-mono text-xs text-ink">{next}</Text>
          </Field>
          <Field label="Posts per keyword">
            <Dropdown
              value={s.posts_per_keyword}
              options={POSTS_PER_KEYWORD}
              onChange={(v) => update.mutate({ posts_per_keyword: v })}
            />
          </Field>
          <View className="gap-1.5">
            <Checkbox checked={s.paused} label="Pause collecting" onPress={() => update.mutate({ paused: !s.paused })} />
            <Checkbox
              checked={!!refine}
              label="Iterate on the next run"
              onPress={() => setRefine.mutate(!refine)}
            />
            {refine && (
              <Text className="font-mono text-xs leading-5 text-ink-weak">
                The next run rewrites the rubric from your votes and feedback.
              </Text>
            )}
          </View>
          {(update.error ?? setRefine.error ?? runNow.error) && (
            <Text className="font-mono text-xs text-primary">
              {(update.error ?? setRefine.error ?? runNow.error)!.message}
            </Text>
          )}
          <View className="flex-row items-center gap-2">
            <RetroButton
              onPress={() => {
                // Copied first: browsers only let a click write the clipboard before anything is awaited
                copy();
                runNow.mutate();
              }}
            >
              <ButtonLabel>Run now</ButtonLabel>
            </RetroButton>
            {copied && (
              <Text className="min-w-0 flex-1 font-mono text-xs text-ink-weak">Copied, paste it to your agent</Text>
            )}
          </View>
        </View>
      )}
    </Window>
  );
}

// An example written on one line as ```text``` becomes the fenced block the template asks for, so it renders like one
function fenceExamples(md: string) {
  return md.replace(/^(\s*)```([^`\n]+)```\s*$/gm, '$1```\n$1$2\n$1```');
}

function markdownStyle(c: ReturnType<typeof useColors>) {
  return {
    body: { color: c.ink, fontSize: 13, lineHeight: 19 },
    heading1: { fontSize: 18, fontWeight: '700' as const, marginVertical: 6 },
    // Section titles (Reader, Keep, Drop, Verify) look like the Keywords panel's field labels
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
