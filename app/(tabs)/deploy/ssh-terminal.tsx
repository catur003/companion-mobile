import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TextInput, ScrollView, Pressable, KeyboardAvoidingView, Platform } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '@/components/Button';
import { colors, spacing, radius, mono } from '@/lib/theme';
import { getSshCredentials } from '@/lib/storage';
import { connectSsh, getPtyTypeXterm, getErrorMessage, SshSession } from '@/lib/ssh';

interface LogEntry {
  id: string;
  command: string;
  output: string;
  isError: boolean;
}

type ConnState = 'checking' | 'no-credentials' | 'connecting' | 'connected' | 'error';

/**
 * Terminal SSH BENERAN (Fase 3) - beda dari `terminal.tsx` lama yang tiap
 * command dieksekusi lepas-lepas lewat endpoint `/system/exec` (gak ada
 * state antar-command, `cd` gak nempel). Di sini satu shell session native
 * dibuka sekali (`startShell`) dan dipakai terus buat semua command
 * (`writeToShell`) sampai layar ditutup - jadi `cd`, environment var, dst
 * beneran nempel persis kayak SSH client biasa.
 *
 * `terminal.tsx` lama TETAP ada (bukan dipensiunin) sebagai fallback cepat -
 * berguna kalau kredensial SSH belum disetel atau native module belum
 * ke-build ke APK yang lagi jalan.
 */
export default function SshTerminalScreen() {
  const router = useRouter();
  const [state, setState] = useState<ConnState>('checking');
  const [errorMsg, setErrorMsg] = useState('');
  const [hostLabel, setHostLabel] = useState('');
  const [input, setInput] = useState('');
  const [log, setLog] = useState<LogEntry[]>([]);
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState<number | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const sessionRef = useRef<SshSession | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const creds = await getSshCredentials();
      if (!creds) {
        if (!cancelled) setState('no-credentials');
        return;
      }
      if (!cancelled) {
        setState('connecting');
        setHostLabel(`${creds.username}@${creds.host}`);
      }
      try {
        const session = await connectSsh(creds);
        if (cancelled) {
          session.disconnect();
          return;
        }
        await session.startShell(getPtyTypeXterm());
        sessionRef.current = session;
        setState('connected');
      } catch (err) {
        if (!cancelled) {
          setErrorMsg(getErrorMessage(err));
          setState('error');
        }
      }
    })();

    return () => {
      cancelled = true;
      try {
        sessionRef.current?.closeShell();
        sessionRef.current?.disconnect();
      } catch {
        // sesi mungkin udah putus duluan - aman diabaikan
      }
      sessionRef.current = null;
    };
  }, []);

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
    if (!command || running || !sessionRef.current) return;
    setInput('');
    setHistory((prev) => [...prev, command]);
    setHistoryIdx(null);
    setRunning(true);
    try {
      const output = await sessionRef.current.writeToShell(`${command}\n`);
      setLog((prev) => [...prev, { id: `${Date.now()}`, command, output: output || '(tidak ada output)', isError: false }]);
    } catch (err) {
      setLog((prev) => [
        ...prev,
        { id: `${Date.now()}`, command, output: getErrorMessage(err), isError: true },
      ]);
    } finally {
      setRunning(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
    }
  }

  if (state === 'no-credentials') {
    return (
      <View style={styles.centerScreen}>
        <Stack.Screen options={{ title: 'Terminal SSH' }} />
        <Ionicons name="key-outline" size={40} color={colors.inkFaint} />
        <Text style={styles.centerTitle}>Belum Ada Kredensial SSH</Text>
        <Text style={styles.centerText}>Setel host, username, dan password/private key dulu buat pakai terminal ini.</Text>
        <View style={{ marginTop: spacing.lg, width: '100%' }}>
          <Button label="Setel Kredensial SSH" onPress={() => router.push('/(tabs)/deploy/ssh-credentials')} />
        </View>
      </View>
    );
  }

  if (state === 'error') {
    return (
      <View style={styles.centerScreen}>
        <Stack.Screen options={{ title: 'Terminal SSH' }} />
        <Ionicons name="close-circle-outline" size={40} color={colors.red} />
        <Text style={styles.centerTitle}>Gagal Konek</Text>
        <Text style={styles.centerText}>{errorMsg}</Text>
        <View style={{ marginTop: spacing.lg, width: '100%', gap: spacing.sm }}>
          <Button label="Cek Kredensial SSH" variant="secondary" onPress={() => router.push('/(tabs)/deploy/ssh-credentials')} />
          <Button label="Coba Lagi" onPress={() => router.replace('/(tabs)/deploy/ssh-terminal')} />
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'Terminal SSH' }} />

      <View style={styles.wrap}>
        <View style={styles.titleBar}>
          <View
            style={[
              styles.dot,
              { backgroundColor: state === 'connected' ? colors.termDotGreen : colors.termDotAmber },
            ]}
          />
          <View style={[styles.dot, { backgroundColor: colors.termDotAmber }]} />
          <View style={[styles.dot, { backgroundColor: colors.termDotRed }]} />
          <Text style={styles.titleText}>{state === 'connected' ? hostLabel : 'menghubungkan...'}</Text>
        </View>

        <ScrollView ref={scrollRef} style={styles.body} contentContainerStyle={{ padding: spacing.md }}>
          <Text style={[styles.line, styles.muted]}>
            ⚡ sesi shell langsung ke server via SSH (port 22) - cd & environment nempel antar-command.
          </Text>
          {log.map((entry) => (
            <View key={entry.id} style={styles.lineBlock}>
              <Text style={[styles.line, styles.ok]}>$ {entry.command}</Text>
              <Text style={[styles.line, entry.isError ? styles.err : styles.muted]}>{entry.output}</Text>
            </View>
          ))}
          {state === 'connecting' && <Text style={[styles.line, styles.amber]}>▸ menghubungkan ke server...</Text>}
          {running && <Text style={[styles.line, styles.amber]}>▸ menjalankan...</Text>}
          {state === 'connected' && <Text style={[styles.line, styles.ok]}>$ ▊</Text>}
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
          placeholder={state === 'connected' ? 'ketik command...' : 'tunggu koneksi...'}
          placeholderTextColor={colors.inkFaint}
          autoCapitalize="none"
          autoCorrect={false}
          onSubmitEditing={handleRun}
          editable={state === 'connected' && !running}
        />
        <Pressable style={styles.sendBtn} onPress={handleRun} disabled={state !== 'connected' || running}>
          <Ionicons name="send" size={18} color={colors.onAccent} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  centerScreen: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  centerTitle: { fontSize: 16, fontWeight: '800', color: colors.ink, marginTop: spacing.md },
  centerText: { fontSize: 13, color: colors.inkMuted, textAlign: 'center', marginTop: spacing.xs, lineHeight: 19 },
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
