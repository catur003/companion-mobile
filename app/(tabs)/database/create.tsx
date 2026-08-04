import { useState } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
import { Card } from '@/components/Card';
import { FormField } from '@/components/FormField';
import { Button } from '@/components/Button';
import { KeyboardScreen } from '@/components/KeyboardScreen';
import { colors, spacing } from '@/lib/theme';
import { createDatabase, ApiError } from '@/lib/api';

const SAFE_NAME = /^[a-zA-Z0-9_]+$/;

export default function CreateDatabaseScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const [dbName, setDbName] = useState('');
  const [dbUser, setDbUser] = useState('');
  const [password, setPassword] = useState('');

  const mutation = useMutation({
    mutationFn: () => createDatabase(dbName.trim(), dbUser.trim(), password.trim() || undefined),
    onSuccess: async (result) => {
      qc.invalidateQueries({ queryKey: ['databases'] });
      await Clipboard.setStringAsync(result.connectionUrl);
      Alert.alert(
        'Database dibuat',
        `Nama: ${result.dbName}\nUser: ${result.dbUser}\nPassword: ${result.password}\n\nURL koneksi sudah DISALIN ke clipboard - tinggal paste ke kolom .env pas Deploy. Simpan password ini juga, tidak akan ditampilkan lagi.`,
        [{ text: 'OK', onPress: () => router.back() }]
      );
    },
    onError: (err) => {
      Alert.alert('Gagal', err instanceof ApiError ? err.message : 'Terjadi kesalahan.');
    },
  });

  function handleSubmit() {
    if (!SAFE_NAME.test(dbName.trim())) {
      Alert.alert('Nama database tidak valid', 'Hanya huruf, angka, underscore.');
      return;
    }
    if (!SAFE_NAME.test(dbUser.trim())) {
      Alert.alert('Nama user tidak valid', 'Hanya huruf, angka, underscore.');
      return;
    }
    mutation.mutate();
  }

  return (
    <KeyboardScreen style={styles.screen} contentContainerStyle={styles.content}>
      <Card>
        <FormField label="Nama Database" placeholder="zenstock_db" value={dbName} onChangeText={setDbName} />
        <FormField label="Nama User" placeholder="zenstock_usr" value={dbUser} onChangeText={setDbUser} />
        <FormField
          label="Password (opsional)"
          placeholder="Kosongkan untuk auto-generate"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
      </Card>
      <Button label="Buat Database" loading={mutation.isPending} onPress={handleSubmit} />
    </KeyboardScreen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.md },
});
