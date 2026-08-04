import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Clipboard from 'expo-clipboard';
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
  ContainerDatabaseEntry,
} from '@/lib/companionApi';

/**
 * REDESIGN (4 Agustus 2026) - konsep "schema" bikin bingung, diganti jadi
 * mental model yang sama kayak vps-manager lama: 1 Container Database (=
 * 1 server MySQL) isinya banyak Database (A, B, C dst), masing-masing
 * kepisah total, bisa ditambah/dihapus dari sini.
 *
 * UBAH LAGI (4 Agustus 2026, feedback): dulu screen ini CUMA nampilin nama
 * database, gak nyambung ke mana-mana - user gak bisa liat isi tabelnya, gak
 * bisa liat username/password lagi setelah bikin. Sekarang tiap baris punya
 * 2 aksi: "Lihat Tabel" (browse LANGSUNG, gak perlu daftarin ke "Kelola
 * Mapping Project" dulu) dan "Info Koneksi" (username/password/DATABASE_URL
 * lengkap, bisa dibuka ulang kapan aja + copy clipboard).
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
          1 Container Database = 1 server MySQL, bisa isi banyak Database terpisah (A, B, C) - hemat resource VPS,
          gak perlu bikin container baru tiap project. Tap "Lihat Tabel" buat browse isinya, "Info Koneksi" buat
          liat/copy DATABASE_URL kapan aja.
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

function DatabaseRow({
  db,
  onBrowse,
  onInfo,
  infoLoading,
  onDelete,
  deleting,
}: {
  db: ContainerDatabaseEntry;
  onBrowse: () => void;
  onInfo: () => void;
  infoLoading: boolean;
  onDelete: () => void;
  deleting: boolean;
}) {
  return (
    <Card style={styles.dbCard}>
      <View style={styles.dbHeaderRow}>
        <Text style={styles.dbName}>{db.name}</Text>
        <Text style={styles.dbMeta}>{db.isDefault ? 'Default (dibuat Coolify)' : 'Numpang'}</Text>
      </View>
      <View style={styles.dbActionsRow}>
        <View style={{ flex: 1 }}>
          <Button label="Lihat Tabel" variant="secondary" onPress={onBrowse} />
        </View>
        <View style={{ flex: 1 }}>
          <Button label="Info Koneksi" variant="secondary" loading={infoLoading} onPress={onInfo} />
        </View>
        {!db.isDefault && (
          <View style={{ flex: 1 }}>
            <Button label="Hapus" variant="danger" loading={deleting} onPress={onDelete} />
          </View>
        )}
      </View>
    </Card>
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
  dbHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dbName: { fontSize: 14, fontWeight: '700', color: colors.ink, fontFamily: 'monospace' },
  dbMeta: { fontSize: 11, color: colors.inkFaint },
  dbActionsRow: { flexDirection: 'row', gap: spacing.sm },
});
