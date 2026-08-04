import { useEffect, useRef } from 'react';
import { Modal, View, Text, StyleSheet, Pressable, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radius, spacing } from '@/lib/theme';

export type AppModalKind = 'success' | 'error' | 'warning' | 'confirm' | 'info';

export interface AppModalButton {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'danger' | 'secondary';
}

interface AppModalProps {
  visible: boolean;
  kind?: AppModalKind;
  title: string;
  message?: string;
  buttons?: AppModalButton[];
  onRequestClose?: () => void;
}

const KIND_CFG: Record<AppModalKind, { icon: keyof typeof Ionicons.glyphMap; fg: string; bg: string }> = {
  success: { icon: 'checkmark-circle', fg: colors.green, bg: colors.greenSoft },
  error: { icon: 'close-circle', fg: colors.red, bg: colors.redSoft },
  warning: { icon: 'alert-circle', fg: colors.amber, bg: colors.amberSoft },
  confirm: { icon: 'help-circle', fg: colors.accent, bg: colors.accentSoft },
  info: { icon: 'information-circle', fg: colors.blue, bg: colors.blueSoft },
};

/**
 * Modal konfirmasi/notifikasi custom, gantiin `Alert.alert()` bawaan RN yang
 * tampilannya beda-beda tiap platform & gak ngikutin tema pastel app ini.
 * Dipakai lewat state lokal di screen (lihat contoh di `SettingsForm.tsx`),
 * bukan context global - cukup buat kebutuhan sekarang, gampang di-upgrade
 * jadi `useAppModal()` hook global nanti kalau mau dipakai di semua screen
 * sekaligus (saat ini screen lain masih pakai `Alert.alert`, di luar scope
 * fase ini).
 */
export function AppModal({ visible, kind = 'info', title, message, buttons, onRequestClose }: AppModalProps) {
  const cfg = KIND_CFG[kind];
  const actions: AppModalButton[] = buttons?.length ? buttons : [{ label: 'OK', onPress: onRequestClose ?? (() => {}) }];

  // Animasi custom (bukan `animationType="fade"` bawaan Modal): backdrop
  // fade + card scale-up dengan spring (bukan linear) biar kerasa "pop",
  // konsisten sama micro-interaction spring di Card/Button. Value di-reset
  // ke posisi awal tiap kali `visible` jadi true, bukan cuma dijalankan
  // sekali di mount - modal ini bisa dibuka-tutup berkali-kali sepanjang
  // hidup komponen (state-nya gak pernah unmount, cuma `visible` yang toggle).
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const cardScale = useRef(new Animated.Value(0.9)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    backdropOpacity.setValue(0);
    cardScale.setValue(0.9);
    cardOpacity.setValue(0);
    Animated.parallel([
      Animated.timing(backdropOpacity, { toValue: 1, duration: 160, useNativeDriver: true }),
      Animated.timing(cardOpacity, { toValue: 1, duration: 160, useNativeDriver: true }),
      Animated.spring(cardScale, { toValue: 1, useNativeDriver: true, speed: 16, bounciness: 8 }),
    ]).start();
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onRequestClose}>
      <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onRequestClose} />
        <Animated.View style={[styles.card, { opacity: cardOpacity, transform: [{ scale: cardScale }] }]}>
          <View style={[styles.iconWrap, { backgroundColor: cfg.bg }]}>
            <Ionicons name={cfg.icon} size={28} color={cfg.fg} />
          </View>
          <Text style={styles.title}>{title}</Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}
          <View style={[styles.btnRow, actions.length > 1 && styles.btnRowSplit]}>
            {actions.map((btn, i) => {
              const isDanger = btn.variant === 'danger';
              const isSecondary = btn.variant === 'secondary';
              return (
                <Pressable
                  key={i}
                  onPress={btn.onPress}
                  style={({ pressed }) => [
                    styles.btn,
                    isSecondary ? styles.btnSecondary : { backgroundColor: isDanger ? colors.red : colors.accent },
                    pressed && { opacity: 0.75 },
                  ]}
                >
                  <Text style={[styles.btnLabel, isSecondary && { color: colors.ink }]}>{btn.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(30,27,46,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.bg,
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.cardBorder,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  iconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: { fontSize: 17, fontWeight: '800', color: colors.ink, textAlign: 'center' },
  message: {
    fontSize: 13.5,
    color: colors.inkMuted,
    textAlign: 'center',
    marginTop: spacing.sm,
    lineHeight: 19,
  },
  btnRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xl, width: '100%' },
  btnRowSplit: {},
  btn: {
    flex: 1,
    borderRadius: radius.md,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnSecondary: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.divider },
  btnLabel: { fontWeight: '700', fontSize: 14, color: colors.onAccent },
});
