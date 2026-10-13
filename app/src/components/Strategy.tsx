import { useRef, useState, type ReactNode } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import Markdown from 'react-native-markdown-display';
import {
  useAddKeyword,
  useDeleteKeyword,
  useKeywords,
  useStrategy,
  useUpdateFilterPrompt,
  type Keyword,
} from '@/lib/api';
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

// The X search keywords for a topic; canEdit (the channel owner) adds and deletes them.
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
