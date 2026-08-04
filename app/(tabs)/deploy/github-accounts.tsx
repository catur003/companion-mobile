import { useRef, useState } from 'react';
import { View, Text, StyleSheet, TextInput, Alert } from 'react-native';
import { Stack } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { AppModal, AppModalButton } from '@/components/AppModal';
import { KeyboardScreen, useKeyboardScroll } from '@/components/KeyboardScreen';
import { colors, spacing, radius } from '@/lib/theme';
import { listGithubAccounts, addGithubAccount, removeGithubAccount, ApiError } from '@/lib/api';

export default function GithubAccountsScreen() {
  const qc = useQueryClient();
  const keyboardScroll = useKeyboardScroll();
  const labelRef = useRef<TextInput>(null);
  const usernameRef = useRef<TextInput>(null);
  const tokenRef = useRef<TextInput>(null);
  const [label, setLabel] = useState('');
  const [username, setUsername] = useState('');
  const [token, setToken] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const accounts = useQuery({ queryKey: ['github-accounts'], queryFn: listGithubAccounts });

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['github-accounts'] });
  }

  const addMutation = useMutation({
    mutationFn: () => addGithubAccount({ label: label.trim(), username: username.trim(), token: token.trim() }),
    onSuccess: () => {
      invalidate();
      setLabel('');
      setUsername('');
      setToken('');
      Alert.alert('Tersimpan', `Akun "${label.trim()}" berhasil disimpan.`);
    },
    onError: (err) => Alert.alert('Gagal Simpan', err instanceof ApiError ? err.message : 'Terjadi kesalahan.'),
  });

  const removeMutation = useMutation({
    mutationFn: (l: string) => removeGithubAccount(l),
    onSuccess: () => {
      invalidate();
      setDeleteTarget(null);
    },
    onError: (err) => {
      setDeleteTarget(null);
      Alert.alert('Gagal Hapus', err instanceof ApiError ? err.message : 'Terjadi kesalahan.');
    },
  });

  const canAdd = Boolean(label.trim() && username.trim() && token.trim()) && !addMutation.isPending;

  const deleteButtons: AppModalButton[] = [
    { label: 'Batal', onPress: () => setDeleteTarget(null), variant: 'secondary' },
    {
      label: 'Hapus',
      variant: 'danger',
      onPress: () => {
        if (deleteTarget) removeMutation.mutate(deleteTarget);
      },
    },
  ];

  return (
    <KeyboardScreen style={styles.screen} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: 'Akun GitHub' }} />

      <Text style={styles.sectionTitle}>Akun Tersimpan</Text>
      {accounts.isLoading && <Card><Text style={styles.mutedText}>Memuat...</Text></Card>}
      {accounts.isError && (
        <Card style={{ borderColor: colors.redSoft, backgroundColor: colors.redSoft }}>
          <Text style={{ color: colors.red, fontSize: 13 }}>Gagal ambil daftar akun.</Text>
        </Card>
      )}
      {accounts.data && accounts.data.accounts.length === 0 && (
        <Card><Text style={styles.mutedText}>Belum ada akun tersimpan. Tambah lewat form di bawah.</Text></Card>
      )}
      {accounts.data?.accounts.map((a, i) => (
        <Card key={a.label} style={i > 0 ? { marginTop: -spacing.xs } : undefined}>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.accountLabel}>{a.label}</Text>
              <Text style={styles.subtext}>@{a.username}</Text>
            </View>
            <Button
              label="Hapus"
              variant="danger"
              loading={removeMutation.isPending && deleteTarget === a.label}
              disabled={removeMutation.isPending}
              onPress={() => setDeleteTarget(a.label)}
            />
          </View>
        </Card>
      ))}

      <Text style={styles.sectionTitle}>Tambah Akun</Text>
      <Card>
        <Text style={styles.subtext}>
          Token (Personal Access Token) tidak pernah dikirim balik ke app setelah tersimpan - kalau mau ganti,
          isi ulang dengan label yang sama, itu akan menimpa akun lama.
        </Text>
        <Text style={[styles.inputLabel, { marginTop: spacing.md }]}>Label</Text>
        <TextInput
          ref={labelRef}
          style={styles.input}
          value={label}
          onChangeText={setLabel}
          onFocus={() => keyboardScroll?.scrollToInput(labelRef.current)}
          placeholder="mis. kerja, pribadi"
          placeholderTextColor={colors.inkFaint}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Text style={[styles.inputLabel, { marginTop: spacing.md }]}>Username GitHub</Text>
        <TextInput
          ref={usernameRef}
          style={styles.input}
          value={username}
          onChangeText={setUsername}
          onFocus={() => keyboardScroll?.scrollToInput(usernameRef.current)}
          placeholder="mis. catur"
          placeholderTextColor={colors.inkFaint}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Text style={[styles.inputLabel, { marginTop: spacing.md }]}>Token (PAT)</Text>
        <TextInput
          ref={tokenRef}
          style={styles.input}
          value={token}
          onChangeText={setToken}
          onFocus={() => keyboardScroll?.scrollToInput(tokenRef.current)}
          placeholder="ghp_..."
          placeholderTextColor={colors.inkFaint}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
        />
        <View style={{ marginTop: spacing.md }}>
          <Button label="Simpan Akun" onPress={() => addMutation.mutate()} loading={addMutation.isPending} disabled={!canAdd} />
        </View>
      </Card>

      <AppModal
        visible={Boolean(deleteTarget)}
        kind="warning"
        title={`Hapus akun "${deleteTarget}"?`}
        message='Akun dihapus dari Configuration. Repo yang masih pakai token ini via remote URL TIDAK ikut ke-update - kalau perlu, terapkan kredensial lain lewat "Update Kredensial GitHub" per-project.'
        buttons={deleteButtons}
        onRequestClose={() => setDeleteTarget(null)}
      />
    </KeyboardScreen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  mutedText: { fontSize: 13, color: colors.inkMuted },
  subtext: { fontSize: 12, color: colors.inkMuted, lineHeight: 17 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.inkFaint,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  accountLabel: { fontSize: 14, fontWeight: '700', color: colors.ink },
  inputLabel: { fontSize: 12, fontWeight: '700', color: colors.inkMuted, marginBottom: 6 },
  input: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 11,
    fontSize: 13,
    color: colors.ink,
  },
});
