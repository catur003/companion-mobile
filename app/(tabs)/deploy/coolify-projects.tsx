import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, Pressable } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { FormField } from '@/components/FormField';
import { colors, spacing, radius } from '@/lib/theme';
import { listCoolifyApplications, listCoolifyDatabases } from '@/lib/coolifyApi';
import {
  listRegisteredProjects,
  upsertRegisteredProject,
  deleteRegisteredProject,
  listDatabaseSchemas,
  RegisteredCoolifyProject,
} from '@/lib/companionApi';
import { ApiError } from '@/lib/api';

/**
 * Gantiin ritual SSH + nano projects.json manual (4 Agustus 2026). SENGAJA
 * gak ada auto-detect/heuristik nama-cocokin app<->database - applicationUuid
 * & databaseUuid WAJIB dipilih eksplisit user dari daftar Coolify asli.
 * Alasan: heuristik nama beresiko silent-wrong (app kepasang DB yang salah
 * tanpa ada tanda error sama sekali) - dihindari sesuai diskusi user.
 */
export default function CoolifyProjectMappingScreen() {
  const qc = useQueryClient();

  const registeredQuery = useQuery({ queryKey: ['registered-projects'], queryFn: listRegisteredProjects });
  const appsQuery = useQuery({ queryKey: ['coolify-all-applications'], queryFn: listCoolifyApplications });
  const dbsQuery = useQuery({ queryKey: ['coolify-all-databases'], queryFn: listCoolifyDatabases });

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const [applicationUuid, setApplicationUuid] = useState<string | undefined>();
  const [databaseUuid, setDatabaseUuid] = useState<string | undefined>();
  const [schemaName, setSchemaName] = useState('');

  const schemasQuery = useQuery({
    queryKey: ['coolify-schemas', databaseUuid],
    queryFn: () => listDatabaseSchemas(databaseUuid!),
    enabled: Boolean(databaseUuid),
  });

  function resetForm() {
    setEditingKey(null);
    setKey('');
    setName('');
    setApplicationUuid(undefined);
    setDatabaseUuid(undefined);
    setSchemaName('');
  }

  function startEdit(entry: RegisteredCoolifyProject) {
    setEditingKey(entry.key);
    setKey(entry.key);
    setName(entry.name);
    setApplicationUuid(entry.applicationUuid);
    setDatabaseUuid(entry.databaseUuid);
    setSchemaName(entry.schemaName ?? '');
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!key.trim() || !name.trim() || !applicationUuid) {
        throw new ApiError('Key, Nama, dan Application wajib diisi.', 'INCOMPLETE');
      }
      return upsertRegisteredProject({
        key: key.trim(),
        name: name.trim(),
        applicationUuid,
        databaseUuid,
        schemaName: schemaName.trim() || undefined,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['registered-projects'] });
      resetForm();
      Alert.alert('Tersimpan', 'Mapping project berhasil disimpan. Langsung kepakai di Dashboard & fitur lain, gak perlu build ulang app.');
    },
    onError: (err) => Alert.alert('Gagal', err instanceof ApiError ? err.message : 'Terjadi kesalahan.'),
  });

  const deleteMutation = useMutation({
    mutationFn: (k: string) => deleteRegisteredProject(k),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['registered-projects'] });
      resetForm();
    },
    onError: (err) => Alert.alert('Gagal Hapus', err instanceof ApiError ? err.message : 'Terjadi kesalahan.'),
  });

  function confirmDelete(entry: RegisteredCoolifyProject) {
    Alert.alert(`Hapus mapping "${entry.name}"?`, 'Ini cuma hapus mapping-nya (app & database di Coolify TIDAK ikut terhapus).', [
      { text: 'Batal', style: 'cancel' },
      { text: 'Hapus', style: 'destructive', onPress: () => deleteMutation.mutate(entry.key) },
    ]);
  }

  const registered = registeredQuery.data ?? [];
  const apps = appsQuery.data ?? [];
  const dbs = dbsQuery.data ?? [];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Card style={styles.introCard}>
        <Text style={styles.intro}>
          Beta. Mapping ini nyambungin project ke Dashboard/Browse DB/dst di ZenVPS. Application & Database WAJIB
          dipilih dari daftar - gak ada tebak-tebakan dari nama, biar gak salah pasang.
        </Text>
      </Card>

      <Text style={styles.sectionTitle}>{editingKey ? `Edit: ${editingKey}` : 'Tambah Mapping Baru'}</Text>
      <Card>
        <FormField label="Key (identifier unik)" placeholder="web-desa" value={key} onChangeText={setKey} autoCapitalize="none" editable={!editingKey} />
        <FormField label="Nama Tampilan" placeholder="Web Desa" value={name} onChangeText={setName} />

        <Text style={styles.label}>Application</Text>
        {appsQuery.isLoading && <Text style={styles.mutedText}>Memuat daftar application...</Text>}
        {appsQuery.isError && <Text style={[styles.mutedText, { color: colors.red }]}>Gagal ambil daftar: {(appsQuery.error as Error)?.message}</Text>}
        <View style={styles.pickRow}>
          {apps.map((a) => (
            <Pressable
              key={a.uuid}
              onPress={() => setApplicationUuid(a.uuid)}
              style={[styles.pickChip, applicationUuid === a.uuid && styles.pickChipActive]}
            >
              <Text style={[styles.pickChipText, applicationUuid === a.uuid && styles.pickChipTextActive]} numberOfLines={1}>
                {a.name}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={[styles.label, { marginTop: spacing.md }]}>Database (opsional)</Text>
        {dbsQuery.isLoading && <Text style={styles.mutedText}>Memuat daftar database...</Text>}
        {dbsQuery.isError && <Text style={[styles.mutedText, { color: colors.red }]}>Gagal ambil daftar: {(dbsQuery.error as Error)?.message}</Text>}
        <View style={styles.pickRow}>
          <Pressable onPress={() => setDatabaseUuid(undefined)} style={[styles.pickChip, !databaseUuid && styles.pickChipActive]}>
            <Text style={[styles.pickChipText, !databaseUuid && styles.pickChipTextActive]}>Tanpa DB</Text>
          </Pressable>
          {dbs.map((d) => (
            <Pressable
              key={d.uuid}
              onPress={() => setDatabaseUuid(d.uuid)}
              style={[styles.pickChip, databaseUuid === d.uuid && styles.pickChipActive]}
            >
              <Text style={[styles.pickChipText, databaseUuid === d.uuid && styles.pickChipTextActive]} numberOfLines={1}>
                {d.name} {d.database_type ? `(${d.database_type})` : ''}
              </Text>
            </Pressable>
          ))}
        </View>

        {databaseUuid && (
          <View style={{ marginTop: spacing.sm }}>
            <Text style={styles.label}>Database di Server Ini</Text>
            {schemasQuery.isLoading && <Text style={styles.mutedText}>Memuat daftar schema...</Text>}
            {schemasQuery.isError && (
              <Text style={[styles.mutedText, { color: colors.red }]}>Gagal ambil database: {(schemasQuery.error as Error)?.message}</Text>
            )}
            {(schemasQuery.data?.length ?? 0) > 1 && (
              <Text style={[styles.mutedText, { color: colors.amber, marginBottom: spacing.xs }]}>
                Server ini punya lebih dari 1 database - WAJIB isi "Nama Database" di bawah biar gak nyasar ke database project lain.
              </Text>
            )}
            {schemasQuery.data?.map((s) => (
              <Pressable key={s} onPress={() => setSchemaName(s)} style={styles.schemaSuggestion}>
                <Text style={styles.schemaSuggestionText}>• {s} (tap buat isi)</Text>
              </Pressable>
            ))}
            <FormField
              label="Nama Database (kosongin kalau server ini cuma 1 database)"
              placeholder="mis. webdesadb"
              value={schemaName}
              onChangeText={setSchemaName}
              autoCapitalize="none"
            />
          </View>
        )}

        <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
          <View style={{ flex: 1 }}>
            <Button label={editingKey ? 'Update' : 'Simpan'} loading={saveMutation.isPending} onPress={() => saveMutation.mutate()} />
          </View>
          {editingKey && (
            <View style={{ flex: 1 }}>
              <Button label="Batal" variant="secondary" onPress={resetForm} />
            </View>
          )}
        </View>
      </Card>

      <Text style={styles.sectionTitle}>{registeredQuery.isLoading ? 'Memuat...' : `${registered.length} Project Terdaftar`}</Text>
      {registered.map((entry) => (
        <Card key={entry.key} style={styles.entryCard}>
          <View style={styles.entryRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.entryName}>{entry.name}</Text>
              <Text style={styles.entryMeta}>
                {entry.key} · {entry.databaseUuid ? (entry.schemaName ? `db: ${entry.schemaName}` : 'app + db') : 'app doang'}
              </Text>
            </View>
            <Pressable onPress={() => startEdit(entry)} style={{ padding: 6 }}>
              <Ionicons name="pencil-outline" size={18} color={colors.accent} />
            </Pressable>
            <Pressable onPress={() => confirmDelete(entry)} style={{ padding: 6 }}>
              <Ionicons name="trash-outline" size={18} color={colors.red} />
            </Pressable>
          </View>
        </Card>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.sm },
  introCard: { backgroundColor: colors.blueSoft, borderColor: colors.blueSoft },
  intro: { fontSize: 12.5, color: colors.inkMuted, lineHeight: 18 },
  mutedText: { fontSize: 12.5, color: colors.inkMuted },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: colors.inkFaint, marginTop: spacing.md, marginBottom: spacing.xs, textTransform: 'uppercase', letterSpacing: 0.6 },
  label: { fontSize: 12, fontWeight: '700', color: colors.inkMuted, marginBottom: spacing.sm },
  pickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  pickChip: {
    maxWidth: 200,
    paddingVertical: 6,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.divider,
    backgroundColor: colors.card,
  },
  pickChipActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  pickChipText: { fontSize: 12, fontWeight: '600', color: colors.inkMuted },
  pickChipTextActive: { color: colors.accent, fontWeight: '700' },
  schemaSuggestion: { paddingVertical: 3 },
  schemaSuggestionText: { fontSize: 12, color: colors.accent, fontFamily: 'monospace' },
  entryCard: { paddingVertical: spacing.sm },
  entryRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  entryName: { fontSize: 14, fontWeight: '700', color: colors.ink },
  entryMeta: { fontSize: 11, color: colors.inkFaint, marginTop: 2 },
});
