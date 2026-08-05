import { useState } from 'react';
import { StyleSheet, Alert, Text } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/Card';
import { FormField } from '@/components/FormField';
import { Button } from '@/components/Button';
import { KeyboardScreen } from '@/components/KeyboardScreen';
import { colors, spacing } from '@/lib/theme';
import { issueSSL, ApiError } from '@/lib/api';

export default function IssueSSLScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const { domain: prefillDomain } = useLocalSearchParams<{ domain?: string }>();
  const [domain, setDomain] = useState(prefillDomain ?? '');

  const mutation = useMutation({
    mutationFn: () => issueSSL(domain.trim()),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['domains'] });
      router.replace(`/(tabs)/deploy/${result.jobId}`);
    },
    onError: (err) => Alert.alert('Gagal', err instanceof ApiError ? err.message : 'Terjadi kesalahan.'),
  });

  return (
    <KeyboardScreen style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.intro}>
        Terbitkan sertifikat SSL (Let's Encrypt) untuk domain yang sudah diarahkan ke VPS ini. Domain harus{' '}
        <Text style={{ fontWeight: '700', color: colors.ink }}>sudah pernah di-deploy lewat menu Deploy</Text> (dicek ke
        registry) — kalau belum, request akan ditolak. Prosesnya berjalan sebagai job di background, cek progress di
        layar berikutnya.{'\n\n'}
        <Text style={{ fontWeight: '700', color: colors.ink }}>Catatan:</Text> proses ini akan membuat ulang / menimpa
        file konfigurasi nginx untuk domain ini (dibutuhkan certbot buat validasi) - kalau sebelumnya site nginx-nya
        pernah dihapus manual, dia akan muncul lagi setelah ini.
      </Text>
      <Card>
        <FormField label="Domain" placeholder="app.contoh.com" keyboardType="url" value={domain} onChangeText={setDomain} />
      </Card>
      <Button
        label="Terbitkan SSL"
        loading={mutation.isPending}
        onPress={() => {
          if (!domain.trim()) {
            Alert.alert('Isi domain dulu');
            return;
          }
          mutation.mutate();
        }}
      />
    </KeyboardScreen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.md },
  intro: { fontSize: 13, color: colors.inkMuted, lineHeight: 19 },
});
