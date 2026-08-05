import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, ActivityIndicator, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { FormField } from '@/components/FormField';
import { colors, spacing } from '@/lib/theme';
import { ApiError } from '@/lib/api';
import { listCoolifyDatabases } from '@/lib/coolifyApi';
import {
  listContainerDatabases,
  deleteContainerDatabase,
  createDatabaseSchema,
  getContainerDatabaseConnection,
  uploadDatabaseImport,
  getJobStatus,
  getDatabaseExportTarget,
  ContainerDatabaseEntry,
} from '@/lib/companionApi';

/**
 * REDESIGN (4 Agustus 2026) - konsep "schema" bikin bingung, diganti jadi
 * mental model yang sama kayak vps-manager lama: 1 Container Database (=
 * 1 server MySQL) isinya banyak Database (A, B, C dst), masing-masing
 * kepisah total, bisa ditambah/dihapus dari sini.
 *
 * UBAH LAGI (4 Agustus 2026, feedback): tiap baris punya 4 aksi sekarang -
 * "Lihat Tabel" (browse langsung), "Info Koneksi" (username/password/
 * DATABASE_URL, bisa dibuka ulang kapan aja), "Import" (upload .sql - job
 * background + polling status, BUKAN nunggu di layar sampai selesai), dan
 * "Export" (download dump .sql langsung).
 */
export default function CoolifyContainerDbScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const containersQuery = useQuery({ queryKey: ['coolify-all-databases'], queryFn: listCoolifyDatabases });
  const containers = (containersQuery.data ?? []).filter(
    (d) => (d.database_type || '').toLowerCase().includes('mysql') || (d.database_type || '').toLowerCase().includes('mariadb')
  );

  const [selectedContainerUuid, setSelectedContainerUuid] = useState<string | undefined>();
  const selectedContainer = containers.find((c) => c.uuid === selectedContainerUuid) ?? containers[0];
  const activeContainerUuid = selectedContainerUuid ?? containers[0]?.uuid;

  const databasesQuery = useQuery({
    queryKey: ['container-databases', activeContainerUuid],
    queryFn: () => listContainerDatabases(activeContainerUuid!),
    enabled: Boolean(activeContainerUuid),
  });

  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newUser, setNewUser] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [infoLoadingFor, setInfoLoadingFor] = useState<string | null>(null);
  const [exportingFor, setExportingFor] = useState<string | null>(null);
  // dbName -> jobId lagi jalan (buat polling status import). null/gak ada =
  // gak lagi ada import jalan buat database itu.
  const [importJobByDb, setImportJobByDb] = useState<Record<string, string | undefined>>({});

  function invalidateList() {
    qc.invalidateQueries({ queryKey: ['container-databases', activeContainerUuid] });
  }

  async function showConnectionInfo(dbName: string) {
    if (!activeContainerUuid) return;
    setInfoLoadingFor(dbName);
    try {
      const info = await getContainerDatabaseConnection(activeContainerUuid, dbName);
      await Clipboard.setStringAsync(info.connectionString);
      Alert.alert(
        `Info Koneksi — ${dbName}`,
        `Host: ${info.host}\nPort: ${info.port}\nUsername: ${info.username}\nPassword: ${info.password}\nDatabase: ${info.database}\n\nDATABASE_URL lengkap udah DISALIN ke clipboard - tinggal paste ke env app.`
      );
    } catch (err) {
      Alert.alert('Gagal', err instanceof ApiError ? err.message : 'Terjadi kesalahan.');
    } finally {
      setInfoLoadingFor(null);
    }
  }

  async function handleExport(dbName: string) {
    if (!activeContainerUuid) return;
    setExportingFor(dbName);
    try {
      const { url, headers } = await getDatabaseExportTarget(activeContainerUuid, dbName);
      const dest = `${FileSystem.cacheDirectory}${dbName}-${Date.now()}.sql`;
      const result = await FileSystem.downloadAsync(url, dest, { headers });
      if (result.status !== 200) throw new Error(`Server membalas status ${result.status}.`);
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(result.uri, { dialogTitle: `${dbName}.sql` });
      } else {
        Alert.alert('Terunduh', `File tersimpan sementara di:\n${result.uri}`);
      }
    } catch (err) {
      Alert.alert('Gagal Export', err instanceof ApiError ? err.message : (err as Error)?.message || 'Terjadi kesalahan.');
    } finally {
      setExportingFor(null);
    }
  }

  async function handleImport(dbName: string) {
    if (!activeContainerUuid) return;
    const picked = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
    if (picked.canceled || !picked.assets?.[0]) return;
    const asset = picked.assets[0];

    Alert.alert(
      `Import ke "${dbName}"?`,
      `File: ${asset.name}\n\nISI FILE DIJALANIN APA ADANYA (bisa CREATE TABLE, INSERT, DROP, dll) - gak divalidasi/dibatasi kayak fitur SQL Query lain. Kalau ada data lama yang bentrok (mis. primary key sama), import bisa GAGAL DI TENGAH atau NIMPA data. Lanjut?`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Import',
          style: 'destructive',
          onPress: async () => {
            try {
              const { jobId } = await uploadDatabaseImport(activeContainerUuid, dbName, asset.uri, asset.name, true);
              setImportJobByDb((prev) => ({ ...prev, [dbName]: jobId }));
            } catch (err) {
              Alert.alert('Gagal Mulai Import', err instanceof ApiError ? err.message : 'Terjadi kesalahan.');
            }
          },
        },
      ]
    );
  }

  const addMutation = useMutation({
    mutationFn: (confirmed: boolean) => {
      if (!activeContainerUuid) throw new ApiError('Pilih Container Database dulu.', 'NO_CONTAINER');
      if (!newName.trim() || !newUser.trim() || !newPassword.trim()) {
        throw new ApiError('Nama database, username, dan password wajib diisi.', 'INCOMPLETE');
      }
      return createDatabaseSchema({
        databaseUuid: activeContainerUuid,
        newDbName: newName.trim(),
        newUser: newUser.trim(),
        newPassword: newPassword.trim(),
        confirmed,
      });
    },
    onSuccess: (res) => {
      setNewName('');
      setNewUser('');
      setNewPassword('');
      setShowAddForm(false);
      invalidateList();
      Alert.alert(
        `Database "${res.newDbName}" Dibuat`,
        `Tap "Info Koneksi" di baris database ini kapan aja buat liat username/password/DATABASE_URL lengkap - gak cuma sekali muncul di sini.`
      );
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === 'CONFIRMATION_REQUIRED') {
        Alert.alert('Konfirmasi', 'Bikin database + user baru di container ini. Lanjut?', [
          { text: 'Batal', style: 'cancel' },
          { text: 'Lanjut', style: 'destructive', onPress: () => addMutation.mutate(true) },
        ]);
        return;
      }
      Alert.alert('Gagal Bikin Database', err instanceof ApiError ? err.message : 'Terjadi kesalahan.');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (params: { name: string; confirmed: boolean }) => {
      if (!activeContainerUuid) throw new ApiError('Container gak ketemu.', 'NO_CONTAINER');
      return deleteContainerDatabase(activeContainerUuid, params.name, params.confirmed);
    },
    onSuccess: () => invalidateList(),
    onError: (err, params) => {
      if (err instanceof ApiError && err.code === 'CONFIRMATION_REQUIRED') {
        Alert.alert(
          `Hapus database "${params.name}"?`,
          'Semua data di dalamnya HILANG PERMANEN, dan user-nya ikut dihapus. App yang masih pakai database ini bakal langsung gagal connect.',
          [
            { text: 'Batal', style: 'cancel' },
            { text: 'Hapus Permanen', style: 'destructive', onPress: () => deleteMutation.mutate({ name: params.name, confirmed: true }) },
          ]
        );
        return;
      }
      Alert.alert('Gagal Hapus', err instanceof ApiError ? err.message : 'Terjadi kesalahan.');
    },
  });

  if (containersQuery.isLoading) {
    return (
      <View style={styles.screen}>
        <Card style={{ margin: spacing.lg }}>
          <Text style={styles.mutedText}>Memuat daftar Container Database...</Text>
        </Card>
      </View>
    );
  }

  if (containers.length === 0) {
    return (
      <View style={styles.screen}>
        <Card style={{ margin: spacing.lg }}>
          <Text style={styles.mutedText}>Belum ada Container Database (server MySQL) sama sekali - bikin dulu lewat "Buat Database".</Text>
        </Card>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Card style={styles.introCard}>
        <Text style={styles.intro}>
          1 Container Database = 1 server MySQL, bisa isi banyak Database terpisah (A, B, C) - hemat resource VPS.
          "Lihat Tabel" buat browse, "Info Koneksi" buat DATABASE_URL, "Import"/"Export" buat pindahin data (.sql).
        </Text>
      </Card>

      {containers.length > 1 && (
        <View style={styles.chipRow}>
          {containers.map((c) => (
            <Button
              key={c.uuid}
              label={c.name}
              variant={activeContainerUuid === c.uuid ? 'primary' : 'secondary'}
              onPress={() => setSelectedContainerUuid(c.uuid)}
            />
          ))}
        </View>
      )}

      <Text style={styles.sectionTitle}>
        {databasesQuery.isLoading ? 'Memuat...' : `${databasesQuery.data?.length ?? 0} Database di "${selectedContainer?.name}"`}
      </Text>

      {databasesQuery.isError && (
        <Card>
          <Text style={[styles.mutedText, { color: colors.red }]}>Gagal ambil daftar: {(databasesQuery.error as Error)?.message}</Text>
        </Card>
      )}

      {databasesQuery.data?.map((db) => (
        <DatabaseRow
          key={db.name}
          db={db}
          onBrowse={() =>
            router.push(`/(tabs)/database/coolify-container-db/${encodeURIComponent(activeContainerUuid!)}/${encodeURIComponent(db.name)}`)
          }
          onInfo={() => showConnectionInfo(db.name)}
          infoLoading={infoLoadingFor === db.name}
          onExport={() => handleExport(db.name)}
          exporting={exportingFor === db.name}
          onImport={() => handleImport(db.name)}
          activeJobId={importJobByDb[db.name]}
          onJobSettled={() => setImportJobByDb((prev) => ({ ...prev, [db.name]: undefined }))}
          onDelete={() => deleteMutation.mutate({ name: db.name, confirmed: false })}
          deleting={deleteMutation.isPending}
        />
      ))}

      {!showAddForm ? (
        <Button label="+ Tambah Database Baru" variant="secondary" onPress={() => setShowAddForm(true)} />
      ) : (
        <Card>
          <Text style={styles.label}>Database Baru</Text>
          <FormField label="Nama Database" placeholder="mis. webdesadb" value={newName} onChangeText={setNewName} autoCapitalize="none" />
          <FormField label="Username" placeholder="mis. webdesauser" value={newUser} onChangeText={setNewUser} autoCapitalize="none" />
          <FormField label="Password" placeholder="Password buat user ini" secureTextEntry value={newPassword} onChangeText={setNewPassword} autoCapitalize="none" />
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <View style={{ flex: 1 }}>
              <Button label="Batal" variant="secondary" onPress={() => setShowAddForm(false)} />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="Buat" loading={addMutation.isPending} onPress={() => addMutation.mutate(false)} />
            </View>
          </View>
        </Card>
      )}
    </ScrollView>
  );
}

/** Poll status job import tiap 2 detik selama masih queued/running. */
function ImportJobStatus({ jobId, onSettled }: { jobId: string; onSettled: () => void }) {
  const { data } = useQuery({
    queryKey: ['job-status', jobId],
    queryFn: () => getJobStatus(jobId),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'success' || status === 'failed' ? false : 2000;
    },
  });

  if (!data) return null;

  if (data.status === 'success' && !data.errorTail) {
    // Sengaja gak auto-hilang - biar user liat "Berhasil" dulu, baru hilang
    // pas dia ninggalin layar/refresh manual (state lokal di parent).
  }

  return (
    <View style={styles.jobStatusRow}>
      {(data.status === 'queued' || data.status === 'running') && <ActivityIndicator size="small" color={colors.amber} />}
      <Text
        style={[
          styles.jobStatusText,
          data.status === 'success' && { color: colors.green },
          data.status === 'failed' && { color: colors.red },
        ]}
      >
        Import: {data.status === 'queued' ? 'menunggu...' : data.status === 'running' ? 'lagi jalan...' : data.status === 'success' ? 'berhasil ✓' : 'gagal ✕'}
      </Text>
      {data.status === 'failed' && data.errorTail && (
        <Text style={styles.jobErrorText} numberOfLines={4}>
          {data.errorTail}
        </Text>
      )}
      {(data.status === 'success' || data.status === 'failed') && (
        <Button label="Tutup" variant="secondary" onPress={onSettled} />
      )}
    </View>
  );
}

function DatabaseRow({
  db,
  onBrowse,
  onInfo,
  infoLoading,
  onExport,
  exporting,
  onImport,
  activeJobId,
  onJobSettled,
  onDelete,
  deleting,
}: {
  db: ContainerDatabaseEntry;
  onBrowse: () => void;
  onInfo: () => void;
  infoLoading: boolean;
  onExport: () => void;
  exporting: boolean;
  onImport: () => void;
  activeJobId?: string;
  onJobSettled: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const busy = infoLoading || exporting || deleting || Boolean(activeJobId);
  return (
    <Card style={styles.dbCard}>
      <View style={styles.dbHeaderRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.dbName}>{db.name}</Text>
          <Text style={styles.dbMeta}>{db.isDefault ? 'Default · dibuat Coolify' : 'Numpang'}</Text>
        </View>
        {!db.isDefault && (
          <Pressable onPress={onDelete} disabled={busy} hitSlop={8} style={{ opacity: busy ? 0.4 : 1 }}>
            {deleting ? <ActivityIndicator size="small" color={colors.red} /> : <Ionicons name="trash-outline" size={18} color={colors.red} />}
          </Pressable>
        )}
      </View>
      <View style={styles.dbActionsRow}>
        <ActionBtn icon="grid-outline" label="Lihat Tabel" onPress={onBrowse} disabled={busy} />
        <ActionBtn icon="key-outline" label="Info Koneksi" onPress={onInfo} loading={infoLoading} disabled={busy} />
        <ActionBtn icon="cloud-upload-outline" label="Import" onPress={onImport} disabled={Boolean(activeJobId) || busy} />
        <ActionBtn icon="cloud-download-outline" label="Export" onPress={onExport} loading={exporting} disabled={busy} />
      </View>
      {activeJobId && <ImportJobStatus jobId={activeJobId} onSettled={onJobSettled} />}
    </Card>
  );
}

function ActionBtn({
  icon,
  label,
  onPress,
  loading,
  disabled,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.actionBtn, (pressed || disabled) && styles.actionBtnDisabled]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={colors.accent} />
      ) : (
        <Ionicons name={icon} size={17} color={colors.accent} />
      )}
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.sm },
  introCard: { backgroundColor: colors.blueSoft, borderColor: colors.blueSoft },
  intro: { fontSize: 12.5, color: colors.inkMuted, lineHeight: 18 },
  mutedText: { fontSize: 13, color: colors.inkMuted },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: colors.inkFaint, marginTop: spacing.md, marginBottom: spacing.xs, textTransform: 'uppercase', letterSpacing: 0.6 },
  label: { fontSize: 12, fontWeight: '700', color: colors.inkMuted, marginBottom: spacing.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  dbCard: { gap: spacing.sm },
  dbHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.sm },
  dbName: { fontSize: 14, fontWeight: '700', color: colors.ink, fontFamily: 'monospace' },
  dbMeta: { fontSize: 11, color: colors.inkFaint, marginTop: 2 },
  dbActionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    paddingTop: spacing.sm,
  },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 4 },
  actionBtnDisabled: { opacity: 0.4 },
  actionLabel: { fontSize: 12, fontWeight: '700', color: colors.accent },
  jobStatusRow: { gap: 4, paddingTop: spacing.xs, borderTopWidth: 1, borderTopColor: colors.divider, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  jobStatusText: { fontSize: 12, fontWeight: '700', color: colors.inkMuted },
  jobErrorText: { fontSize: 11, color: colors.red, fontFamily: 'monospace', width: '100%' },
});
