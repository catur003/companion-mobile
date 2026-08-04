import { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, mono } from '@/lib/theme';
import { getPm2Logs } from '@/lib/api';

const POLL_MS = 3000;

export default function Pm2LogScreen() {
  const { name } = useLocalSearchParams<{ name: string }>();
  const [live, setLive] = useState(true);
  const scrollRef = useRef<ScrollView>(null);

  const { data, isLoading, isError, error, isFetching } = useQuery({
    queryKey: ['pm2-logs', name],
    queryFn: () => getPm2Logs(name, 200),
    enabled: Boolean(name),
    refetchInterval: live ? POLL_MS : false,
  });

  useEffect(() => {
    // Auto-scroll ke bawah tiap ada data baru - kesan "live tail" beneran.
    if (data) scrollRef.current?.scrollToEnd({ animated: true });
  }, [data?.output]);

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: `Log: ${name}` }} />

      <View style={styles.toolbar}>
        <View style={styles.liveIndicator}>
          <View style={[styles.dot, { backgroundColor: live ? colors.termGreen : colors.termMuted }]} />
          <Text style={styles.liveText}>{live ? (isFetching ? 'Live · update...' : 'Live') : 'Dijeda'}</Text>
        </View>
        <Pressable onPress={() => setLive((v) => !v)} style={styles.toggleBtn}>
          <Ionicons name={live ? 'pause' : 'play'} size={14} color={colors.accent} />
          <Text style={styles.toggleLabel}>{live ? 'Jeda' : 'Lanjut'}</Text>
        </Pressable>
      </View>

      {isLoading && (
        <View style={styles.centerBox}>
          <Text style={styles.mutedText}>Memuat log...</Text>
        </View>
      )}
      {isError && (
        <View style={styles.centerBox}>
          <Text style={styles.errorText}>
            Gagal ambil log: {(error as Error)?.message ?? 'unknown error'}
          </Text>
        </View>
      )}
      {data && (
        <ScrollView ref={scrollRef} style={styles.logBox} contentContainerStyle={{ padding: spacing.md }}>
          <Text style={styles.logText} selectable>
            {data.output || '(log kosong)'}
          </Text>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.termBg },
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.termBorder,
  },
  liveIndicator: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  liveText: { fontFamily: mono.fontFamily, fontSize: 11, color: colors.termMuted },
  toggleBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: colors.termCardBg },
  toggleLabel: { fontSize: 12, fontWeight: '700', color: colors.accent },
  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  mutedText: { fontFamily: mono.fontFamily, fontSize: 12, color: colors.termMuted },
  errorText: { fontFamily: mono.fontFamily, fontSize: 12, color: colors.termRed, textAlign: 'center' },
  logBox: { flex: 1 },
  logText: { fontFamily: mono.fontFamily, fontSize: 11.5, lineHeight: 17, color: colors.termText },
});
