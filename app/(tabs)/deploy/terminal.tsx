import { useState, useRef } from 'react';
import { View, Text, StyleSheet, TextInput, ScrollView, Pressable, KeyboardAvoidingView, Platform } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, mono } from '@/lib/theme';
import { execCommand, ApiError } from '@/lib/api';

interface LogEntry {
  id: string;
  command: string;
  output: string;
  exitOk: boolean;
}

export default function TerminalScreen() {
  const router = useRouter();
  const [input, setInput] = useState('');
  const [log, setLog] = useState<LogEntry[]>([]);
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState<number | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  function recallHistory(direction: 'up' | 'down') {
    if (history.length === 0) return;
    let nextIdx: number;
    if (direction === 'up') {
      nextIdx = historyIdx === null ? history.length - 1 : Math.max(0, historyIdx - 1);
    } else {
      if (historyIdx === null) return;
      nextIdx = historyIdx + 1;
      if (nextIdx >= history.length) {
        setHistoryIdx(null);
        setInput('');
        return;
      }
    }
    setHistoryIdx(nextIdx);
    setInput(history[nextIdx]);
  }

  async function handleRun() {
    const command = input.trim();
    if (!command || running) return;
    setInput('');
    setHistory((prev) => [...prev, command]);
    setHistoryIdx(null);
    setRunning(true);
    try {
      const result = await execCommand(command);
      setLog((prev) => [
        ...prev,
        { id: `${Date.now()}`, command, output: result.output || result.errorMessage || '(tidak ada output)', exitOk: result.exitOk },
      ]);
    } catch (err) {
      setLog((prev) => [
        ...prev,
        { id: `${Date.now()}`, command, output: err instanceof ApiError ? err.message : 'Gagal menghubungi server.', exitOk: false },
      ]);
    } finally {
      setRunning(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'Terminal' }} />

      <View style={styles.wrap}>
        <View style={styles.titleBar}>
          <View style={[styles.dot, { backgroundColor: colors.termDotRed }]} />
          <View style={[styles.dot, { backgroundColor: colors.termDotAmber }]} />
          <View style={[styles.dot, { backgroundColor: colors.termDotGreen }]} />
          <Text style={styles.titleText}>catur@vps</Text>
        </View>

        <ScrollView ref={scrollRef} style={styles.body} contentContainerStyle={{ padding: spacing.md }}>
          <Pressable onPress={() => router.replace('/(tabs)/deploy/ssh-terminal')}>
            <Text style={[styles.line, styles.amber]}>→ Ada Terminal SSH beneran (session nempel, cd gak reset) - tap di sini.</Text>
          </Pressable>
          <Text style={[styles.line, styles.muted]}>
            ⚠ command dieksekusi langsung di server sebagai user API, gak ada konfirmasi tambahan.
          </Text>
          {log.map((entry) => (
            <View key={entry.id} style={styles.lineBlock}>
              <Text style={[styles.line, styles.ok]}>$ {entry.command}</Text>
              <Text style={[styles.line, entry.exitOk ? styles.muted : styles.err]}>{entry.output}</Text>
            </View>
          ))}
          {running && <Text style={[styles.line, styles.amber]}>▸ menjalankan...</Text>}
          <Text style={[styles.line, styles.ok]}>$ ▊</Text>
        </ScrollView>
      </View>

      <View style={styles.inputRow}>
        <Pressable style={styles.historyBtn} onPress={() => recallHistory('up')} disabled={history.length === 0}>
          <Ionicons name="chevron-up" size={18} color={colors.termMuted} />
        </Pressable>
        <Pressable style={styles.historyBtn} onPress={() => recallHistory('down')} disabled={historyIdx === null}>
          <Ionicons name="chevron-down" size={18} color={colors.termMuted} />
        </Pressable>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={(t) => {
            setInput(t);
            setHistoryIdx(null);
          }}
          placeholder="ketik command..."
          placeholderTextColor={colors.inkFaint}
          autoCapitalize="none"
          autoCorrect={false}
          onSubmitEditing={handleRun}
          editable={!running}
        />
        <Pressable style={styles.sendBtn} onPress={handleRun} disabled={running}>
          <Ionicons name="send" size={18} color={colors.onAccent} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  wrap: {
    flex: 1,
    margin: spacing.md,
    backgroundColor: colors.termBg,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.termBorder,
  },
  titleBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.termBorder,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  titleText: { marginLeft: spacing.sm, color: colors.termMuted, fontFamily: mono.fontFamily, fontSize: 11 },
  body: { flex: 1 },
  lineBlock: { marginBottom: 6 },
  line: { fontFamily: mono.fontFamily, fontSize: 12, lineHeight: 18 },
  ok: { color: colors.termGreen },
  err: { color: colors.termRed },
  amber: { color: colors.termAmber },
  muted: { color: colors.termMuted },
  inputRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.cardBorder,
    backgroundColor: colors.card,
  },
  input: {
    flex: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.ink,
    fontFamily: mono.fontFamily,
    fontSize: 13,
  },
  sendBtn: {
    width: 44,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historyBtn: {
    width: 36,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
