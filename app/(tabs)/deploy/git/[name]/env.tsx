import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TextInput, Alert } from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { AppModal, AppModalButton } from '@/components/AppModal';
import { KeyboardScreen, useKeyboardScroll } from '@/components/KeyboardScreen';
import { colors, spacing, radius, mono } from '@/lib/theme';
import { getProjectEnv, updateProjectEnv, ApiError } from '@/lib/api';

export default function ProjectEnvScreen() {
  const { name } = useLocalSearchParams<{ name: string }>();
  const editorRef = useRef<TextInput>(null);
  const keyboardScroll = useKeyboardScroll();
  const [content, setContent] = useState('');
  const [dirty, setDirty] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);

  const envQuery = useQuery({ queryKey: ['project-env', name], queryFn: () => getProjectEnv(name), enabled: Boolean(name) });

  useEffect(() => {
    if (envQuery.data && !dirty) {
      setContent(envQuery.data.content);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [envQuery.data]);

  const saveMutation = useMutation({
    mutationFn: () => updateProjectEnv(name, content),
    onSuccess: () => {
      setDirty(false);
      setConfirmVisible(false);
      Alert.alert('Tersimpan', `.env project "${name}" berhasil ditulis ulang. Restart app PM2 kalau perlu supaya perubahan kepakai.`);
    },
    onError: (err) => {
      setConfirmVisible(false);
      Alert.alert('Gagal Simpan', err instanceof ApiError ? err.message : 'Terjadi kesalahan.');
    },
  });

  const buttons: AppModalButton[] = [
    { label: 'Batal', onPress: () => setConfirmVisible(false), variant: 'secondary' },
    { label: 'Timpa', onPress: () => saveMutation.mutate(), variant: 'danger' },
  ];

  return (
    <KeyboardScreen style={styles.screen} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: `.env - ${name}` }} />

      {envQuery.isLoading && <Card><Text style={styles.mutedText}>Memuat isi .env...</Text></Card>}
      {envQuery.isError && (
        <Card style={{ borderColor: colors.redSoft, backgroundColor: colors.redSoft }}>
          <Text style={{ color: colors.red, fontSize: 13 }}>
            Gagal baca .env: {(envQuery.error as Error)?.message ?? 'unknown error'}
          </Text>
        </Card>
      )}

      {!envQuery.isLoading && !envQuery.isError && (
        <>
          <Text style={styles.warning}>
            Isi ditimpa PERSIS seperti yang ditulis di sini (bukan digabung dengan isi lama). Pastikan format
            KEY=value per baris sudah benar sebelum simpan.
          </Text>
          <View style={styles.editorBox}>
            <TextInput
              ref={editorRef}
              style={styles.editor}
              value={content}
              onChangeText={(t) => {
                setContent(t);
                setDirty(true);
              }}
              onFocus={() => keyboardScroll?.scrollToInput(editorRef.current)}
              multiline
              textAlignVertical="top"
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="KEY=value"
              placeholderTextColor={colors.inkFaint}
            />
          </View>
          <Button
            label="Simpan .env"
            onPress={() => setConfirmVisible(true)}
            loading={saveMutation.isPending}
            disabled={!dirty}
          />
        </>
      )}

      <AppModal
        visible={confirmVisible}
        kind="warning"
        title="Timpa .env?"
        message={`Isi .env project "${name}" akan ditimpa permanen dengan teks di editor. Tindakan ini tidak bisa dibatalkan (kecuali kamu masih ingat isi lamanya).`}
        buttons={buttons}
        onRequestClose={() => setConfirmVisible(false)}
      />
    </KeyboardScreen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  mutedText: { fontSize: 13, color: colors.inkMuted },
  warning: { fontSize: 12, color: colors.inkMuted, lineHeight: 17, marginBottom: spacing.md },
  editorBox: {
    backgroundColor: colors.termBg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.termBorder,
    padding: spacing.md,
    marginBottom: spacing.lg,
    minHeight: 320,
  },
  editor: {
    fontFamily: mono.fontFamily,
    fontSize: 12.5,
    lineHeight: 18,
    color: colors.termText,
    minHeight: 300,
  },
});
