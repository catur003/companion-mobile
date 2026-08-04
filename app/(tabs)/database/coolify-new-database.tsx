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
import { listCoolifyProjects, listCoolifyServers, createCoolifyMysqlDatabase } from '@/lib/coolifyApi';

/**
 * MySQL doang dulu (request user, 4 Agustus 2026) - desain extensible: kalau
 * nanti butuh Postgres/dll, tambah opsi di "type" toggle + panggil fungsi
 * create baru yang beda (lihat pola createCoolifyMysqlDatabase di
 * coolifyApi.ts), TIDAK ngerombak form/logic yang ada di sini.
 *
 * Ini bikin CONTAINER DATABASE BARU (server MySQL baru). Kalau mau nambah
 * database DI DALAM container yang udah ada (numpang, hemat RAM) - itu di
 * layar terpisah "Kelola Container Database" (coolify-container-db.tsx).
 */
export default function NewCoolifyDatabaseScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [dbName, setDbName] = useState('');
  const [dbUser, setDbUser] = useState('');
  const [dbPassword, setDbPassword] = useState('');

  const projectsQuery = useQuery({ queryKey: ['coolify-projects'], queryFn: listCoolifyProjects });
  const serversQuery = useQuery({ queryKey: ['coolify-servers'], queryFn: listCoolifyServers });
  const autoProjectUuid = projectsQuery.data?.length === 1 ? projectsQuery.data[0].uuid : undefined;
  const autoServerUuid = serversQuery.data?.length === 1 ? serversQuery.data[0].uuid : undefined;
  const needsProjectPick = (projectsQuery.data?.length ?? 0) > 1;
  const needsServerPick = (serversQuery.data?.length ?? 0) > 1;
  const [manualProjectUuid, setManualProjectUuid] = useState<string | undefined>();
  const [manualServerUuid, setManualServerUuid] = useState<string | undefined>();
  const projectUuid = manualProjectUuid ?? autoProjectUuid;
  const serverUuid = manualServerUuid ?? autoServerUuid;

  const mutation = useMutation({
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

  function handleSubmit() {
    if (!projectUuid || !serverUuid) {
      Alert.alert('Belum lengkap', 'Project dan Server Coolify wajib kepilih (lihat di atas form).');
      return;
    }
    mutation.mutate();
  }

  return (
    <KeyboardScreen style={styles.screen} contentContainerStyle={styles.content}>
      <Card style={styles.introCard}>
        <Text style={styles.intro}>
          Beta - bikin Container Database (server MySQL) baru langsung ke Coolify. Belum pernah dites ke instance
          nyata, coba ke project kecil dulu. Mau numpang di container yang UDAH ADA (hemat RAM)? Pakai "Kelola
          Container Database", bukan layar ini.
        </Text>
      </Card>

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

      <Button label="Buat Container Database Baru" loading={mutation.isPending} onPress={handleSubmit} />
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
  label: { fontSize: 12, fontWeight: '700', color: colors.inkMuted, marginBottom: spacing.sm },
  modeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
