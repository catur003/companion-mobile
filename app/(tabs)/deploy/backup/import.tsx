import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { colors, spacing } from '@/lib/theme';
import { scanSqlFiles, listDatabases, importSqlFile, uploadSqlFile, SqlFileEntry, ApiError } from '@/lib/api';

export default function ImportSqlScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const [selectedFile, setSelectedFile] = useState<SqlFileEntry | null>(null);
  const [selectedDb, setSelectedDb] = useState<string | null>(null);

  const scan = useQuery({ queryKey: ['sql-files'], queryFn: scanSqlFiles });
  const databases = useQuery({ queryKey: ['databases'], queryFn: listDatabases });

  const importMutation = useMutation({
    mutationFn: () => importSqlFile(selectedDb as string, (selectedFile as SqlFileEntry).fullPath),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['backups'] });
      Alert.alert('Import Selesai', `File "${selectedFile?.file}" berhasil di-import ke database "${selectedDb}".`, [
        { text: 'OK', onPress: () => router.back() },
      ]);
    },
    onError: (err) => Alert.alert('Gagal Import', err instanceof ApiError ? err.message : 'Terjadi kesalahan.'),
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      const picked = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
      if (picked.canceled) return null;
      const asset = picked.assets[0];
      if (!/\.sql(\.gz)?$/i.test(asset.name)) {
        throw new ApiError('File harus berekstensi .sql atau .sql.gz.', 'INVALID_FILE');
      }
      return uploadSqlFile(asset.uri, asset.name, asset.mimeType);
    },
    onSuccess: (data) => {
      if (!data) return; // user batal milih file
      qc.invalidateQueries({ queryKey: ['sql-files'] });
      const lastSlash = data.fullPath.lastIndexOf('/');
      const dir = lastSlash >= 0 ? data.fullPath.slice(0, lastSlash) : '';
      setSelectedFile({ file: data.file, dir, fullPath: data.fullPath });
      Alert.alert('Upload Berhasil', `File "${data.file}" siap dipilih sebagai sumber import. Lanjut pilih database tujuan.`);
    },
    onError: (err) => Alert.alert('Gagal Upload', err instanceof ApiError ? err.message : 'Terjadi kesalahan.'),
  });

  function handleImport() {
    if (!selectedFile || !selectedDb) return;
    Alert.alert(
      `Timpa database "${selectedDb}"?`,
      `Seluruh isi database "${selectedDb}" akan DIGANTI dengan isi file "${selectedFile.file}". Tidak ada undo otomatis. Lanjut?`,
      [
        { text: 'Batal', style: 'cancel' },
        { text: 'Ya, Timpa & Import', style: 'destructive', onPress: () => importMutation.mutate() },
      ]
    );
  }

  const files = scan.data?.files ?? [];
  const dbs = databases.data?.databases ?? [];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: 'Import SQL File' }} />

      <Card style={{ borderColor: colors.amberSoft, backgroundColor: colors.amberSoft }}>
        <View style={styles.warnRow}>
          <Ionicons name="warning-outline" size={18} color={colors.amber} />
          <Text style={styles.warnText}>
            Buat file .sql/.sql.gz yang dikirim manual ke server (bukan hasil backup tool ini). Import
            MENIMPA seluruh isi database tujuan.
          </Text>
        </View>
      </Card>

      <Text style={styles.sectionTitle}>1. Pilih File SQL</Text>
      <Button
        label="Upload File dari HP"
        variant="secondary"
        loading={uploadMutation.isPending}
        onPress={() => uploadMutation.mutate()}
      />
      <Text style={[styles.mutedText, { marginTop: spacing.xs, marginBottom: spacing.sm }]}>
        atau pilih file yang sudah ada di server:
      </Text>
      {scan.isLoading && <Card><Text style={styles.mutedText}>Memindai folder di server...</Text></Card>}
      {scan.isError && (
        <Card style={{ borderColor: colors.redSoft, backgroundColor: colors.redSoft }}>
          <Text style={{ color: colors.red, fontSize: 13 }}>Gagal memindai file SQL.</Text>
        </Card>
      )}
      {!scan.isLoading && !scan.isError && files.length === 0 && (
        <Card>
          <Text style={styles.mutedText}>
            Gak ketemu file .sql/.sql.gz lepas di server. Folder yang dipindai:
            {'\n'}{(scan.data?.scannedDirs ?? []).join('\n')}
          </Text>
        </Card>
      )}
      {!scan.isLoading && !scan.isError && files.length > 0 && (
        <Card style={{ padding: 0 }}>
          {files.map((f, i) => (
            <Pressable
              key={f.fullPath}
              onPress={() => setSelectedFile(f)}
              style={[styles.itemRow, i > 0 && styles.rowDivider]}
            >
              <View style={{ flex: 1 }}>
                <Text
                  style={[styles.itemLabel, selectedFile?.fullPath === f.fullPath && { color: colors.accent, fontWeight: '700' }]}
                  numberOfLines={1}
                >
                  {f.file}
                </Text>
                <Text style={styles.itemSub} numberOfLines={1}>{f.dir}</Text>
              </View>
              {selectedFile?.fullPath === f.fullPath && <Ionicons name="checkmark-circle" size={18} color={colors.accent} />}
            </Pressable>
          ))}
        </Card>
      )}

      <Text style={styles.sectionTitle}>2. Pilih Database Tujuan</Text>
      {databases.isLoading && <Card><Text style={styles.mutedText}>Memuat...</Text></Card>}
      {databases.isError && (
        <Card style={{ borderColor: colors.redSoft, backgroundColor: colors.redSoft }}>
          <Text style={{ color: colors.red, fontSize: 13 }}>Gagal ambil daftar database.</Text>
        </Card>
      )}
      {!databases.isLoading && !databases.isError && dbs.length === 0 && (
        <Card><Text style={styles.mutedText}>Belum ada database - buat dulu sebelum import.</Text></Card>
      )}
      {!databases.isLoading && !databases.isError && dbs.length > 0 && (
        <Card style={{ padding: 0 }}>
          {dbs.map((name, i) => (
            <Pressable
              key={name}
              onPress={() => setSelectedDb(name)}
              style={[styles.itemRow, i > 0 && styles.rowDivider]}
            >
              <Text style={[styles.itemLabel, selectedDb === name && { color: colors.accent, fontWeight: '700' }]} numberOfLines={1}>
                {name}
              </Text>
              {selectedDb === name && <Ionicons name="checkmark-circle" size={18} color={colors.accent} />}
            </Pressable>
          ))}
        </Card>
      )}

      <View style={{ marginTop: spacing.lg }}>
        <Button
          label={selectedFile && selectedDb ? `Import ke "${selectedDb}"` : 'Pilih file & database dulu'}
          variant="danger"
          onPress={handleImport}
          disabled={!selectedFile || !selectedDb}
          loading={importMutation.isPending}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  mutedText: { fontSize: 13, color: colors.inkMuted, lineHeight: 19 },
  warnRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  warnText: { flex: 1, fontSize: 12.5, lineHeight: 18, color: colors.amber, fontWeight: '600' },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: colors.inkFaint, marginTop: spacing.lg, marginBottom: spacing.sm, textTransform: 'uppercase', letterSpacing: 0.6 },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, paddingHorizontal: spacing.lg },
  itemLabel: { fontSize: 13.5, color: colors.ink, flexShrink: 1 },
  itemSub: { fontSize: 11, color: colors.inkFaint, marginTop: 2 },
  rowDivider: { borderTopWidth: 1, borderTopColor: colors.divider },
});
