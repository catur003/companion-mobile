import { useState } from 'react';
import { StyleSheet, Alert, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/Card';
import { FormField } from '@/components/FormField';
import { Button } from '@/components/Button';
import { KeyboardScreen } from '@/components/KeyboardScreen';
import { colors, spacing } from '@/lib/theme';
import { createNginxSite, ApiError } from '@/lib/api';

export default function NewNginxSiteScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const [domain, setDomain] = useState('');
  const [port, setPort] = useState('');

  const mutation = useMutation({
    mutationFn: () => createNginxSite(domain.trim(), parseInt(port, 10)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['nginx-sites'] });
      qc.invalidateQueries({ queryKey: ['domains'] });
      Alert.alert('Site dibuat', `Domain "${domain.trim()}" berhasil di-setup dan nginx sudah di-reload.`, [
        { text: 'OK', onPress: () => router.back() },
      ]);
    },
    onError: (err) => {
      const message = err instanceof ApiError ? err.message : 'Terjadi kesalahan.';
      const isDomainConflict = err instanceof ApiError && /sudah dipakai project/i.test(message);
      Alert.alert(
        'Gagal',
        message,
        isDomainConflict
          ? [
              { text: 'Tutup', style: 'cancel' },
              {
                text: 'Lihat Detail Domain',
                onPress: () => router.push(`/(tabs)/deploy/domains/${encodeURIComponent(domain.trim())}`),
              },
            ]
          : undefined
      );
    },
  });

  function handleSubmit() {
    if (!domain.trim()) {
      Alert.alert('Isi domain dulu', 'Contoh: app.contoh.com');
      return;
    }
    const portNum = parseInt(port, 10);
    if (!Number.isFinite(portNum) || portNum <= 0 || portNum > 65535) {
      Alert.alert('Port tidak valid', 'Isi angka 1-65535, mis. port yang dipakai app PM2.');
      return;
    }
    mutation.mutate();
  }

  return (
    <KeyboardScreen style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.intro}>
        Bikin reverse-proxy site baru: domain diarahkan ke port lokal (mis. port app PM2). Domain harus sudah
        diarahkan (DNS A record) ke IP VPS ini sebelum dites di browser.
      </Text>
      <Card>
        <FormField label="Domain" placeholder="app.contoh.com" keyboardType="url" value={domain} onChangeText={setDomain} />
        <FormField label="Port Tujuan" placeholder="3001" keyboardType="number-pad" value={port} onChangeText={setPort} />
      </Card>
      <Button label="Buat Site" loading={mutation.isPending} onPress={handleSubmit} />
    </KeyboardScreen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.md },
  intro: { fontSize: 13, color: colors.inkMuted, lineHeight: 19 },
});
