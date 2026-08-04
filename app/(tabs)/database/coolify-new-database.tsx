import { useState } from 'react';
import { StyleSheet, Alert, View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Card } from '@/components/Card';
import { FormField } from '@/components/FormField';
import { Button } from '@/components/Button';
import { KeyboardScreen } from '@/components/KeyboardScreen';
import { colors, spacing } from '@/lib/theme';
import { ApiError } from '@/lib/api';
import { listCoolifyProjects, listCoolifyServers, listCoolifyDatabases, createCoolifyMysqlDatabase } from '@/lib/coolifyApi';
import { listDatabaseSchemas, createDatabaseSchema } from '@/lib/companionApi';

/**
 * MySQL doang dulu (request user, 4 Agustus 2026) - desain extensible: kalau
 * nanti butuh Postgres/dll, tambah opsi di "type" toggle + panggil fungsi
 * create baru yang beda (lihat pola createCoolifyMysqlDatabase di
 * coolifyApi.ts), TIDAK ngerombak form/logic yang ada di sini.
 *
 * UBAH (4 Agustus 2026): tambah opsi "Numpang Server yang Ada" - 1 mysqld
 * bisa dipakai banyak project (schema/database terpisah dalam 1 server),
 * sama pola kayak vps-manager lama (bukan 1 container per project). Hemat
 * RAM buat VPS kecil. Daftar schema yang UDAH ADA ditampilin dulu (informatif,
 * cegah tabrakan nama) sebelum user isi nama schema baru.
 */
export default function NewCoolifyDatabaseScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<'new-server' | 'existing-server'>('new-server');

  // ---- Mode: Server Baru ----
  const [name, setName] = useState('');
  const [dbName, setDbName] = useState('');
  const [dbUser, setDbUser] = useState('');
  const [dbPassword, setDbPassword] = useState('');

  const projectsQuery = useQuery({ queryKey: ['coolify-projects'], queryFn: listCoolifyProjects, enabled: mode === 'new-server' });
  const serversQuery = useQuery({ queryKey: ['coolify-servers'], queryFn: listCoolifyServers, enabled: mode === 'new-server' });
  const autoProjectUuid = projectsQuery.data?.length === 1 ? projectsQuery.data[0].uuid : undefined;
  const autoServerUuid = serversQuery.data?.length === 1 ? serversQuery.data[0].uuid : undefined;
  const needsProjectPick = (projectsQuery.data?.length ?? 0) > 1;
  const needsServerPick = (serversQuery.data?.length ?? 0) > 1;
  const [manualProjectUuid, setManualProjectUuid] = useState<string | undefined>();
  const [manualServerUuid, setManualServerUuid] = useState<string | undefined>();
  const projectUuid = manualProjectUuid ?? autoProjectUuid;
  const serverUuid = manualServerUuid ?? autoServerUuid;

  const newServerMutation = useMutation({
    mutationFn: async () => {
      if (!projectUuid || !serverUuid) {
        throw new ApiError('Project/Server Coolify belum kepilih.', 'MISSING_PROJECT_OR_SERVER');
      }
      return createCoolifyMysqlDatabase({
        project_uuid: projectUuid,
        server_uuid: serverUuid,
        environment_name: 'production',
        name: name.trim() || undefined,
        mysql_database: dbName.trim() || undefined,
        mysql_user: dbUser.trim() || undefined,
        mysql_password: dbPassword.trim() || undefined,
      });
    },
    onSuccess: (created) => {
      Alert.alert(
        'Database Dibuat',
        `UUID: ${created.uuid}\n\nAmbil connection string dari "MySQL URL (internal)" di dashboard Coolify - jangan ketik manual. Tambahin databaseUuid ini ke project terkait lewat "Kelola Mapping Project".`
      );
      router.back();
    },
    onError: (err) => Alert.alert('Gagal Bikin Database', err instanceof ApiError ? err.message : 'Terjadi kesalahan.'),
  });

  // ---- Mode: Numpang Server yang Ada ----
  const allDatabasesQuery = useQuery({ queryKey: ['coolify-all-databases'], queryFn: listCoolifyDatabases, enabled: mode === 'existing-server' });
  const mysqlServers = (allDatabasesQuery.data ?? []).filter((d) => (d.database_type || '').toLowerCase().includes('mysql') || (d.database_type || '').toLowerCase().includes('mariadb'));
  const [selectedServerUuid, setSelectedServerUuid] = useState<string | undefined>();

  const schemasQuery = useQuery({
    queryKey: ['coolify-schemas', selectedServerUuid],
    queryFn: () => listDatabaseSchemas(selectedServerUuid!),
    enabled: Boolean(selectedServerUuid),
  });

  const [newSchemaName, setNewSchemaName] = useState('');
  const [newSchemaUser, setNewSchemaUser] = useState('');
  const [newSchemaPassword, setNewSchemaPassword] = useState('');

  const existingServerMutation = useMutation({
    mutationFn: (confirmed: boolean) => {
      if (!selectedServerUuid) throw new ApiError('Pilih server dulu.', 'NO_SERVER_SELECTED');
      if (!newSchemaName.trim() || !newSchemaUser.trim() || !newSchemaPassword.trim()) {
        throw new ApiError('Nama database, username, dan password wajib diisi.', 'INCOMPLETE');
      }
      return createDatabaseSchema({
        databaseUuid: selectedServerUuid,
        newDbName: newSchemaName.trim(),
        newUser: newSchemaUser.trim(),
        newPassword: newSchemaPassword.trim(),
        confirmed,
      });
    },
    onSuccess: (res) => {
      Alert.alert(
        'Schema Dibuat',
        `Database "${res.newDbName}" + user "${res.newUser}" berhasil dibuat di server yang sama.\n\nSusun DATABASE_URL manual: host & port SAMA kayak server ini (copy dari salah satu project yang udah numpang di sini), ganti nama-db/user/password sesuai yang baru dibuat. Tambahin ke "Kelola Mapping Project" - isi Database dari server ini, JANGAN LUPA isi field Schema Name = "${res.newDbName}".`
      );
      router.back();
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === 'CONFIRMATION_REQUIRED') {
        Alert.alert('Konfirmasi', 'Bikin database + user baru di server ini. Lanjut?', [
          { text: 'Batal', style: 'cancel' },
          { text: 'Lanjut', style: 'destructive', onPress: () => existingServerMutation.mutate(true) },
        ]);
        return;
      }
      Alert.alert('Gagal Bikin Schema', err instanceof ApiError ? err.message : 'Terjadi kesalahan.');
    },
  });

  return (
    <KeyboardScreen style={styles.screen} contentContainerStyle={styles.content}>
      <Card style={styles.introCard}>
        <Text style={styles.intro}>
          Beta - belum pernah dites ke instance nyata, coba ke project kecil dulu. "Numpang Server yang Ada" = 1
          mysqld dipakai banyak project (hemat RAM VPS kecil), gak bikin container baru tiap project.
        </Text>
      </Card>

      <Card>
        <Text style={styles.label}>Mode</Text>
        <View style={styles.modeRow}>
          <Button label="Server Baru" variant={mode === 'new-server' ? 'primary' : 'secondary'} onPress={() => setMode('new-server')} />
          <Button label="Numpang Server yang Ada" variant={mode === 'existing-server' ? 'primary' : 'secondary'} onPress={() => setMode('existing-server')} />
        </View>
      </Card>

      {mode === 'new-server' ? (
        <>
          {(needsProjectPick || needsServerPick) && (
            <Card>
              {needsProjectPick && (
                <PickerRow
                  label="Project Coolify"
                  options={(projectsQuery.data ?? []).map((p) => ({ value: p.uuid, label: p.name }))}
                  value={manualProjectUuid}
                  onChange={setManualProjectUuid}
                />
              )}
              {needsServerPick && (
                <PickerRow
                  label="Server Coolify"
                  options={(serversQuery.data ?? []).map((s) => ({ value: s.uuid, label: s.name }))}
                  value={manualServerUuid}
                  onChange={setManualServerUuid}
                />
              )}
            </Card>
          )}
          <Card>
            <FormField label="Nama Resource" placeholder="mysql-web-desa" value={name} onChangeText={setName} />
            <FormField label="Nama Database" placeholder="webdesadb" value={dbName} onChangeText={setDbName} autoCapitalize="none" />
            <FormField label="Username" placeholder="webdesauser" value={dbUser} onChangeText={setDbUser} autoCapitalize="none" />
            <FormField
              label="Password (opsional)"
              placeholder="Kosongin biar Coolify generate otomatis"
              secureTextEntry
              value={dbPassword}
              onChangeText={setDbPassword}
              hint="Disaranin kosongin - lebih aman & gak perlu diedit manual lagi nanti."
            />
          </Card>
          <Button label="Buat Server Database Baru" loading={newServerMutation.isPending} onPress={() => newServerMutation.mutate()} />
        </>
      ) : (
        <>
          <Card>
            <Text style={styles.label}>Pilih Server MySQL</Text>
            {allDatabasesQuery.isLoading && <Text style={styles.mutedText}>Memuat daftar server...</Text>}
            {mysqlServers.length === 0 && !allDatabasesQuery.isLoading && (
              <Text style={styles.mutedText}>Belum ada server MySQL sama sekali - bikin dulu lewat mode "Server Baru".</Text>
            )}
            <View style={styles.modeRow}>
              {mysqlServers.map((s) => (
                <Button
                  key={s.uuid}
                  label={s.name}
                  variant={selectedServerUuid === s.uuid ? 'primary' : 'secondary'}
                  onPress={() => setSelectedServerUuid(s.uuid)}
                />
              ))}
            </View>
          </Card>

          {selectedServerUuid && (
            <Card>
              <Text style={styles.label}>Schema/Database yang Udah Ada di Server Ini</Text>
              {schemasQuery.isLoading && <Text style={styles.mutedText}>Memuat...</Text>}
              {schemasQuery.isError && (
                <Text style={[styles.mutedText, { color: colors.red }]}>Gagal ambil daftar schema: {(schemasQuery.error as Error)?.message}</Text>
              )}
              {schemasQuery.data?.length === 0 && <Text style={styles.mutedText}>Belum ada schema lain di server ini.</Text>}
              {schemasQuery.data?.map((s) => (
                <Text key={s} style={styles.existingSchema}>
                  • {s}
                </Text>
              ))}
              <Text style={[styles.mutedText, { marginTop: spacing.sm }]}>
                Pastiin nama database baru di bawah BEDA dari daftar di atas.
              </Text>
            </Card>
          )}

          {selectedServerUuid && (
            <Card>
              <FormField label="Nama Database Baru" placeholder="webdesadb" value={newSchemaName} onChangeText={setNewSchemaName} autoCapitalize="none" />
              <FormField label="Username Baru" placeholder="webdesauser" value={newSchemaUser} onChangeText={setNewSchemaUser} autoCapitalize="none" />
              <FormField label="Password Baru" placeholder="Password buat user ini" secureTextEntry value={newSchemaPassword} onChangeText={setNewSchemaPassword} autoCapitalize="none" />
              <Button label="Buat Schema di Server Ini" variant="danger" loading={existingServerMutation.isPending} onPress={() => existingServerMutation.mutate(false)} />
            </Card>
          )}
        </>
      )}
    </KeyboardScreen>
  );
}

function PickerRow({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: string; label: string }[];
  value: string | undefined;
  onChange: (v: string) => void;
}) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.modeRow}>
        {options.map((opt) => (
          <Button
            key={opt.value}
            label={opt.label}
            variant={value === opt.value ? 'primary' : 'secondary'}
            onPress={() => onChange(opt.value)}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: 60 },
  introCard: { backgroundColor: colors.blueSoft, borderColor: colors.blueSoft },
  intro: { fontSize: 12.5, color: colors.inkMuted, lineHeight: 18 },
  mutedText: { fontSize: 12.5, color: colors.inkMuted },
  label: { fontSize: 12, fontWeight: '700', color: colors.inkMuted, marginBottom: spacing.sm },
  modeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  existingSchema: { fontSize: 12.5, color: colors.ink, fontFamily: 'monospace', marginTop: 2 },
});
