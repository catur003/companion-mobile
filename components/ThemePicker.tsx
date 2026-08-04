import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from './Card';
import { colors, radius, spacing } from '@/lib/theme';
import { THEME_LIST } from '@/lib/themes';
import { useThemePicker } from '@/lib/ThemeContext';

/**
 * Grid pilihan tema. Tap salah satu = langsung apply (gak perlu tombol
 * "Simpan" terpisah - ganti tema itu sendiri udah reversible & instant,
 * beda sama form Koneksi Server yang perlu validasi network dulu).
 */
export function ThemePicker() {
  const { themeName, setTheme } = useThemePicker();

  return (
    <Card>
      <View style={styles.grid}>
        {THEME_LIST.map((meta) => {
          const active = meta.name === themeName;
          return (
            <Pressable
              key={meta.name}
              onPress={() => setTheme(meta.name)}
              style={({ pressed }) => [
                styles.swatch,
                { borderColor: active ? meta.preview.accent : colors.divider },
                active && styles.swatchActive,
                pressed && { opacity: 0.85 },
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`Tema ${meta.label}`}
            >
              <View style={[styles.previewBg, { backgroundColor: meta.preview.bg }]}>
                <View style={[styles.dot, { backgroundColor: meta.preview.accent }]} />
                <View style={[styles.dot, { backgroundColor: meta.preview.accentPink, marginLeft: -6 }]} />
                {active && (
                  <View style={[styles.checkBadge, { backgroundColor: meta.preview.accent }]}>
                    <Ionicons name="checkmark" size={11} color="#FFFFFF" />
                  </View>
                )}
              </View>
              <Text style={styles.label} numberOfLines={1}>{meta.label}</Text>
              <Text style={styles.desc} numberOfLines={2}>{meta.description}</Text>
            </Pressable>
          );
        })}
      </View>
    </Card>
  );
}

const SWATCH_WIDTH = '47%';

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: spacing.md },
  swatch: {
    width: SWATCH_WIDTH,
    borderWidth: 1.5,
    borderRadius: radius.lg,
    padding: spacing.sm,
    backgroundColor: colors.bg,
  },
  swatchActive: { borderWidth: 2 },
  previewBg: {
    height: 44,
    borderRadius: radius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  dot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: '#FFFFFF' },
  checkBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontSize: 12.5, fontWeight: '700', color: colors.ink },
  desc: { fontSize: 10.5, color: colors.inkMuted, marginTop: 1, lineHeight: 13 },
});
