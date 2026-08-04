import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert } from 'react-native';
import { useMutation } from '@tanstack/react-query';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { FormField } from '@/components/FormField';
import { colors, spacing } from '@/lib/theme';
import { readContainerFile } from '@/lib/companionApi';
import { ApiError } from '@/lib/api';

// TEMPORARY (Fase 4, baru PORTOFOLIO) - sama pola kayak PORTOFOLIO_APPLICATION_UUID
// di Dashboard. UBAH (4 Agustus 2026): pakai applicationUuid Coolify (stabil),
// BUKAN container ID Docker mentah lagi - itu berubah tiap redeploy. Root
// default container Companion API: /app (Nixpacks) - path yang diisi di sini
// RELATIF ke root itu, bukan absolut.
const PORTOFOLIO_APPLICATION_UUID = 'bxpbj2db8xneyfquv7o9l1bk';

export default function CoolifyFileViewerScreen() {
  const [path, setPath] = useState('package.json');
  const [content, setContent] = useState<string | null>(null);

  const readMutation = useMutation({
    mutationFn: () => readContainerFile(PORTOFOLIO_APPLICATION_UUID, path),
    onSuccess: (res) => setContent(res.content),
    onError: (err) => {
      setContent(null);
      Alert.alert('Gagal Baca File', err instanceof ApiError ? err.message : 'Terjadi kesalahan.');
    },
  });

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Card style={styles.introCard}>
        <Text style={styles.intro}>
          Beta, read-only (belum ada tombol simpan di sini - endpoint write sudah dites bekerja, tapi UI edit belum
          dibuat, sengaja buat cek dulu isi source PORTOFOLIO yang lagi jalan di VPS vs GitHub). Path relatif ke root
          app di container (/app).
        </Text>
      </Card>

      <Card>
        <FormField
          label="Path File"
          value={path}
          onChangeText={setPath}
          autoCapitalize="none"
          placeholder="mis. package.json atau app/api/auth/login/route.js"
        />
        <Button label="Baca File" loading={readMutation.isPending} onPress={() => readMutation.mutate()} />
      </Card>

      {content !== null && (
        <Card>
          <Text style={styles.fileLabel}>{path}</Text>
          <ScrollView horizontal>
            <Text style={styles.code}>{content}</Text>
          </ScrollView>
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },
  introCard: { backgroundColor: colors.blueSoft, borderColor: colors.blueSoft },
  intro: { fontSize: 12.5, color: colors.inkMuted, lineHeight: 18 },
  fileLabel: { fontSize: 12, fontWeight: '700', color: colors.inkFaint, marginBottom: spacing.sm },
  code: { fontFamily: 'monospace', fontSize: 11.5, color: colors.ink, lineHeight: 17 },
});
