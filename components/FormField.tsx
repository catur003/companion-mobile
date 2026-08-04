import { ReactNode, useRef } from 'react';
import { View, Text, TextInput, StyleSheet, TextInputProps } from 'react-native';
import { colors, radius, spacing } from '@/lib/theme';
import { useKeyboardScroll } from '@/components/KeyboardScreen';

interface FormFieldProps extends TextInputProps {
  label: string;
  hint?: string;
  /** Kalau true, hint & border field jadi merah - dipakai buat state error/warning (mis. port bentrok). */
  error?: boolean;
  /** Elemen opsional di kanan input (mis. tombol mata show/hide password). */
  rightElement?: ReactNode;
}

export function FormField({ label, hint, error, style, rightElement, onFocus, ...rest }: FormFieldProps) {
  const inputRef = useRef<TextInput>(null);
  const keyboardScroll = useKeyboardScroll();

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputRow}>
        <TextInput
          ref={inputRef}
          placeholderTextColor={colors.inkFaint}
          style={[styles.input, error && styles.inputError, rightElement ? { paddingRight: 40 } : null, style]}
          autoCapitalize="none"
          autoCorrect={false}
          onFocus={(e) => {
            keyboardScroll?.scrollToInput(inputRef.current);
            onFocus?.(e);
          }}
          {...rest}
        />
        {rightElement ? <View style={styles.rightSlot}>{rightElement}</View> : null}
      </View>
      {hint ? <Text style={[styles.hint, error && styles.hintError]}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.md },
  label: { fontSize: 12, fontWeight: '700', color: colors.inkMuted, marginBottom: 6 },
  inputRow: { position: 'relative', justifyContent: 'center' },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 11,
    fontSize: 14,
    color: colors.ink,
  },
  inputError: { borderColor: colors.red },
  rightSlot: { position: 'absolute', right: 4, height: '100%', alignItems: 'center', justifyContent: 'center' },
  hint: { fontSize: 11, color: colors.inkFaint, marginTop: 4 },
  hintError: { color: colors.red, fontWeight: '600' },
});
