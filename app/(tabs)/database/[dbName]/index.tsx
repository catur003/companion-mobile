import { useState } from 'react';
import { View, Text, StyleSheet, FlatList, Alert, TextInput } from 'react-native';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { AppModal } from '@/components/AppModal';
import { colors, spacing } from '@/lib/theme';
import { listTables, resetDatabasePassword, dropDatabase, testDatabaseCredentials, ApiError } from '@/lib/api';

export default function DatabaseDetailScreen() {
  const { dbName } = useLocalSearchParams<{ dbName: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const [resetUser, setResetUser] = useState('');
  const [testPassword, setTestPassword] = useState('');
  // FIXED (missing confirm): sebelumnya "Reset Password" langsung eksekusi
  // on-tap TANPA konfirmasi - padahal app manapun yang lagi konek pakai
  // password LAMA bakal langsung ke-disconnect begitu password baru
  // diterapkan. Sekarang wajib lewat AppModal dulu.
  const [confirmResetVisible, setConfirmResetVisible] = useState(false);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['tables', dbName],
    queryFn: () => listTables(dbName),
    enabled: Boolean(dbName),
  });

  const resetMutation = useMutation({
    mutationFn: (dbUser: string) => resetDatabasePassword(dbName, dbUser),
    onSuccess: async (result) => {
      await Clipboard.setStringAsync(result.connectionUrl);
      Alert.alert(
        'Password direset',
        `User: ${result.dbUser}\nPassword baru: ${result.password}\n\nURL koneksi sudah DISALIN ke clipboard - tinggal paste ke .env. Simpan password ini juga, tidak ditampilkan lagi.`
      );
    },
    onError: (err) => Alert.alert('Gagal', err instanceof ApiError ? err.message : 'Terjadi kesalahan.'),
  });

  const dropMutation = useMutation({
    mutationFn: (dbUser: string) => dropDatabase(dbName, dbUser || undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['databases'] });
      Alert.alert('Terhapus', `Database "${dbName}" berhasil dihapus.`, [{ text: 'OK', onPress: () => router.back() }]);
    },
    onError: (err) => Alert.alert('Gagal', err instanceof ApiError ? err.message : 'Terjadi kesalahan.'),
  });

  const testCredMutation = useMutation({
    mutationFn: () => testDatabaseCredentials(dbName, resetUser.trim(), testPassword || undefined),
    onSuccess: () => Alert.alert('Berhasil', `Kredensial user "${resetUser.trim()}" valid, koneksi ke "${dbName}" berhasil.`),
    onError: (err) => Alert.alert('Gagal', err instanceof ApiError ? err.message : 'Terjadi kesalahan.'),
  });

  function confirmDrop() {
    Alert.alert(
      `Hapus "${dbName}"?`,
      'Semua data di dalamnya akan HILANG PERMANEN. Tindakan ini tidak bisa dibatalkan.',
      [
        { text: 'Batal', style: 'cancel' },
        { text: 'Hapus Permanen', style: 'destructive', onPress: () => dropMutation.mutate(resetUser.trim()) },
      ]
    );
  }

  const tables = data?.tables ?? [];

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: dbName }} />
      <FlatList
        data={tables}
        keyExtractor={(t) => t}
        contentContainerStyle={styles.content}
        onRefresh={refetch}
        refreshing={false}
        ListHeaderComponent={
          <>
            <Text style={styles.sectionTitle}>Kelola User</Text>
            <Card>
              <Text style={styles.label}>Nama User (buat reset password / ikut dihapus saat drop)</Text>
              <TextInput
                value={resetUser}
                onChangeText={setResetUser}
                placeholder="mis. zenstock_usr"
                placeholderTextColor={colors.inkFaint}
                autoCapitalize="none"
                style={styles.input}
              />
              <Text style={[styles.label, { marginTop: spacing.sm }]}>Password (opsional, buat Test Kredensial)</Text>
              <TextInput
                value={testPassword}
                onChangeText={setTestPassword}
                placeholder="Kosongkan kalau mau pakai yang tersimpan"
                placeholderTextColor={colors.inkFaint}
                autoCapitalize="none"
                secureTextEntry
                style={styles.input}
              />
              <View style={{ marginTop: spacing.sm }}>
                <Button
                  label="Test Kredensial"
                  variant="secondary"
                  loading={testCredMutation.isPending}
                  onPress={() => {
                    if (!resetUser.trim()) {
                      Alert.alert('Isi nama user dulu');
                      return;
                    }
                    testCredMutation.mutate();
                  }}
                />
              </View>
              <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <Button
                    label="Reset Password"
                    variant="secondary"
                    loading={resetMutation.isPending}
                    onPress={() => {
                      if (!resetUser.trim()) {
                        Alert.alert('Isi nama user dulu');
                        return;
                      }
                      setConfirmResetVisible(true);
                    }}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Button label="Drop Database" variant="danger" loading={dropMutation.isPending} onPress={confirmDrop} />
                </View>
              </View>
            </Card>

            <Text style={styles.sectionTitle}>{isLoading ? 'Memuat tabel...' : `${tables.length} Tabel`}</Text>
          </>
        }
        ListEmptyComponent={
          !isLoading ? (
            <Card>
              <Text style={styles.emptyText}>
                {isError ? `Gagal ambil daftar tabel: ${(error as Error)?.message}` : 'Belum ada tabel.'}
              </Text>
            </Card>
          ) : null
        }
        renderItem={({ item }) => (
          <Card onPress={() => router.push(`/(tabs)/database/${encodeURIComponent(dbName)}/${encodeURIComponent(item)}`)}>
            <View style={styles.row}>
              <Text style={styles.name}>{item}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.inkFaint} />
            </View>
          </Card>
        )}
      />
      <AppModal
        visible={confirmResetVisible}
        kind="warning"
        title={`Reset password user "${resetUser.trim()}"?`}
        message="Password baru langsung berlaku. Aplikasi manapun yang saat ini konek ke database ini pakai password LAMA akan langsung terputus sampai .env-nya diupdate ke password baru."
        buttons={[
          { label: 'Batal', onPress: () => setConfirmResetVisible(false), variant: 'secondary' },
          {
            label: 'Reset Password',
            variant: 'danger',
            onPress: () => {
              setConfirmResetVisible(false);
              resetMutation.mutate(resetUser.trim());
            },
          },
        ]}
        onRequestClose={() => setConfirmResetVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: 60 },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: colors.inkFaint, marginBottom: spacing.sm, marginTop: spacing.md, textTransform: 'uppercase', letterSpacing: 0.6 },
  emptyText: { fontSize: 13, color: colors.inkMuted },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { fontSize: 14, fontWeight: '700', color: colors.ink },
  label: { fontSize: 12, fontWeight: '700', color: colors.inkMuted, marginBottom: 6 },
  input: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.ink,
  },
});
