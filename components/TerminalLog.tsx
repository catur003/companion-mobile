import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { colors, mono, radius, spacing } from '@/lib/theme';
import { JobStep } from '@/lib/api';

/**
 * Tampilan log ala terminal - dipakai KHUSUS di layar detail job (deploy/SSL)
 * sesuai konsep hybrid yang di-ACC: rangka utama modern, tapi log proses
 * pakai gaya terminal karena itu paling natural buat ngecek "beneran jalan
 * apa nggak" step-by-step.
 */
export function TerminalLog({ steps, liveMessage }: { steps: JobStep[]; liveMessage?: string }) {
  return (
    <View style={styles.wrap}>
      <View style={styles.titleBar}>
        <View style={[styles.dotWin, { backgroundColor: colors.termDotRed }]} />
        <View style={[styles.dotWin, { backgroundColor: colors.termDotAmber }]} />
        <View style={[styles.dotWin, { backgroundColor: colors.termDotGreen }]} />
        <Text style={styles.titleText}>job.log</Text>
      </View>
      <ScrollView style={styles.body} contentContainerStyle={{ padding: spacing.md }}>
        {steps.length === 0 && (
          <Text style={[styles.line, styles.muted]}>$ menunggu step pertama...</Text>
        )}
        {steps.map((step, i) => (
          <View key={`${step.step}-${i}`} style={styles.lineBlock}>
            <Text
              style={[
                styles.line,
                step.ok ? styles.ok : styles.err,
              ]}
            >
              {step.ok ? '✓' : '✗'} {step.step}
            </Text>
            {step.message ? <Text style={[styles.line, styles.muted, styles.indent]}>{step.message}</Text> : null}
          </View>
        ))}
        {liveMessage ? <Text style={[styles.line, styles.amber]}>▸ {liveMessage}</Text> : null}
        <Text style={[styles.line, styles.ok]}>$ ▊</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
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
  dotWin: { width: 8, height: 8, borderRadius: 4 },
  titleText: {
    marginLeft: spacing.sm,
    color: colors.termMuted,
    fontFamily: mono.fontFamily,
    fontSize: 11,
  },
  body: { maxHeight: 420 },
  lineBlock: { marginBottom: 6 },
  line: { fontFamily: mono.fontFamily, fontSize: 12, lineHeight: 18 },
  indent: { paddingLeft: 16, fontSize: 11 },
  ok: { color: colors.termGreen },
  err: { color: colors.termRed },
  amber: { color: colors.termAmber },
  muted: { color: colors.termMuted },
});
