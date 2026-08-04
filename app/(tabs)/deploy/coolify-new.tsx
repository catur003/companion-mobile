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
import {
  listCoolifyProjects,
  listCoolifyServers,
  listCoolifyGithubApps,
  createCoolifyPublicApplication,
  createCoolifyPrivateGithubApplication,
  setCoolifyApplicationEnvsBulk,
} from '@/lib/coolifyApi';

const BUILD_PACKS: Array<'nixpacks' | 'static' | 'dockerfile' | 'dockercompose'> = [
  'nixpacks',
  'static',
  'dockerfile',
  'dockercompose',
];

/**
 * Mirror app/(tabs)/deploy/new.tsx (vps-manager) SENGAJA - "workflow biar
 * sama" (request user, sama kayak CoolifyAppCard). Beda field yang gak
 * terhindarkan karena model Coolify beda dari vps-manager:
 * - "Domain" (vps-manager, wajib) -> "Domains" (Coolify, opsional - bisa
 *   pakai subdomain sslip.io auto-generate kalau dikosongin)
 * - "Folder Path" (absolute host path) -> gak ada konsepnya di Coolify,
 *   diganti "Base Directory" (relatif ke root repo, buat monorepo)
 * - "Deploy User" -> gak ada konsepnya di Coolify (container terisolasi
 *   per-app, gak ada multi-user PM2)
 * - "Mode Prisma" (build-time flag) -> dihapus dari form ini SENGAJA, itu
 *   perannya Post-deployment Command yang diisi manual di Coolify dashboard
 *   atau lewat /db/migrate (Companion API) SETELAH app dibuat - Coolify API
 *   create endpoint gak punya field ini
 *
 * BELUM DIVERIFIKASI ke instance nyata (endpoint POST /applications/public
 * & PATCH /envs/bulk) - lihat catatan detail di coolifyApi.ts. Tes ke 1
 * project kecil dulu.
 */
export default function NewCoolifyDeployScreen() {
  const router = useRouter();
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');
  const [name, setName] = useState('');
  const [gitRepo, setGitRepo] = useState('');
  const [branch, setBranch] = useState('main');
  const [domains, setDomains] = useState('');
  const [port, setPort] = useState('3000');
  const [baseDirectory, setBaseDirectory] = useState('');
  const [buildPack, setBuildPack] = useState<(typeof BUILD_PACKS)[number]>('nixpacks');
  const [envContent, setEnvContent] = useState('');

  const githubAppsQuery = useQuery({
    queryKey: ['coolify-github-apps'],
    queryFn: listCoolifyGithubApps,
    enabled: visibility === 'private',
  });
  const autoGithubAppUuid = githubAppsQuery.data?.length === 1 ? githubAppsQuery.data[0].uuid : undefined;
  const needsGithubAppPick = (githubAppsQuery.data?.length ?? 0) > 1;
  const [manualGithubAppUuid, setManualGithubAppUuid] = useState<string | undefined>();
  const githubAppUuid = manualGithubAppUuid ?? autoGithubAppUuid;

  // Sama pola kayak new.tsx: auto-pick kalau cuma ada 1 opsi, jangan nanya
  // hal yang jawabannya cuma 1 kemungkinan. Server biasanya cuma "localhost"
  // (1 VPS = 1 server Coolify), Project juga biasa cuma 1 kalau baru mulai.
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

  const portNum = Number(port);
  const portOutOfRange = port.trim() !== '' && (!Number.isFinite(portNum) || portNum < 1 || portNum > 65535);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!projectUuid || !serverUuid) {
        throw new ApiError('Project/Server Coolify belum kepilih.', 'MISSING_PROJECT_OR_SERVER');
      }

      const shared = {
        project_uuid: projectUuid,
        server_uuid: serverUuid,
        environment_name: 'production',
        git_branch: branch.trim() || 'main',
        build_pack: buildPack,
        ports_exposes: port.trim(),
        name: name.trim() || undefined,
        base_directory: baseDirectory.trim() || undefined,
        domains: domains.trim() || undefined,
      };

      const created =
        visibility === 'private'
          ? await (async () => {
              if (!githubAppUuid) {
                throw new ApiError('GitHub App belum kepilih.', 'MISSING_GITHUB_APP');
              }
              return createCoolifyPrivateGithubApplication({
                ...shared,
                github_app_uuid: githubAppUuid,
                git_repository: gitRepo.trim(),
              });
            })()
          : await createCoolifyPublicApplication({
              ...shared,
              git_repository: gitRepo.trim(),
            });

      // Parse textarea KEY=VALUE jadi array - Coolify gak terima raw .env
      // blob (beda dari vps-manager yang terima envContent apa adanya).
      const envs = envContent
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith('#') && line.includes('='))
        .map((line) => {
          const idx = line.indexOf('=');
          return { key: line.slice(0, idx).trim(), value: line.slice(idx + 1).trim() };
        });
      if (envs.length > 0) {
        await setCoolifyApplicationEnvsBulk(created.uuid, envs);
      }

      return created;
    },
    onSuccess: (created) => {
      Alert.alert(
        'Application Dibuat',
        `UUID: ${created.uuid}\n\nApp ini BELUM otomatis muncul di Dashboard ZenVPS - tambahin manual ke lib/coolifyProjects.ts kalau mau dipantau dari sini.`
      );
      router.back();
    },
    onError: (err) => Alert.alert('Gagal Bikin Application', err instanceof ApiError ? err.message : 'Terjadi kesalahan.'),
  });

  function handleSubmit() {
    if (!gitRepo.trim()) {
      Alert.alert('Belum lengkap', visibility === 'private' ? 'Repo (format owner/repo) wajib diisi.' : 'Git repository wajib diisi.');
      return;
    }
    if (!projectUuid || !serverUuid) {
      Alert.alert('Belum lengkap', 'Project dan Server Coolify wajib kepilih (lihat di atas form).');
      return;
    }
    if (visibility === 'private' && !githubAppUuid) {
      Alert.alert('Belum lengkap', 'GitHub App wajib kepilih buat repo private.');
      return;
    }
    if (portOutOfRange) {
      Alert.alert('Port tidak valid', 'Port harus angka 1-65535.');
      return;
    }
    mutation.mutate();
  }

  return (
    <KeyboardScreen style={styles.screen} contentContainerStyle={styles.content}>
      <Card style={styles.introCard}>
        <Text style={styles.intro}>
          Beta - bikin application baru langsung ke Coolify. Belum pernah dites ke instance nyata, coba ke project
          kecil dulu.
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
        <Text style={styles.label}>Visibilitas Repo</Text>
        <View style={styles.modeRow}>
          <Button label="Public" variant={visibility === 'public' ? 'primary' : 'secondary'} onPress={() => setVisibility('public')} />
          <Button label="Private (GitHub App)" variant={visibility === 'private' ? 'primary' : 'secondary'} onPress={() => setVisibility('private')} />
        </View>
        {visibility === 'private' && (
          <>
            {githubAppsQuery.isLoading && <Text style={styles.hintText}>Memuat daftar GitHub App...</Text>}
            {githubAppsQuery.isError && (
              <Text style={[styles.hintText, { color: colors.red }]}>
                Gagal ambil GitHub App: {(githubAppsQuery.error as Error)?.message}
              </Text>
            )}
            {!githubAppsQuery.isLoading && (githubAppsQuery.data?.length ?? 0) === 0 && (
              <Text style={[styles.hintText, { color: colors.amber }]}>
                Belum ada GitHub App terhubung ke Coolify. Setup dulu di dashboard Coolify (Settings/Sources) sebelum
                bisa deploy repo private.
              </Text>
            )}
            {needsGithubAppPick && (
              <PickerRow
                label="GitHub App"
                options={(githubAppsQuery.data ?? []).map((a) => ({ value: a.uuid, label: a.name }))}
                value={manualGithubAppUuid}
                onChange={setManualGithubAppUuid}
              />
            )}
          </>
        )}
      </Card>

      <Card>
        <FormField label="Nama Application" placeholder="web-desa" value={name} onChangeText={setName} />
        <FormField
          label="Git Repository"
          placeholder={visibility === 'private' ? 'owner/nama-repo (BUKAN URL lengkap)' : 'https://github.com/user/repo'}
          keyboardType={visibility === 'private' ? 'default' : 'url'}
          autoCapitalize="none"
          value={gitRepo}
          onChangeText={setGitRepo}
          hint={visibility === 'private' ? 'Format khusus: owner/repo, beda dari mode Public yang pakai URL lengkap.' : undefined}
        />
        <FormField label="Branch" placeholder="main" value={branch} onChangeText={setBranch} />
        <FormField
          label="Domains (opsional)"
          placeholder="Kosongin buat auto subdomain sslip.io"
          keyboardType="url"
          value={domains}
          onChangeText={setDomains}
        />
        <FormField
          label="Port"
          placeholder="3000"
          keyboardType="number-pad"
          value={port}
          onChangeText={setPort}
          error={portOutOfRange}
          hint={portOutOfRange ? 'Port harus angka 1-65535.' : undefined}
        />
        <FormField
          label="Base Directory (opsional, buat monorepo)"
          placeholder="Kosongin kalau app di root repo"
          value={baseDirectory}
          onChangeText={setBaseDirectory}
        />
      </Card>

      <Card>
        <Text style={styles.label}>Build Pack</Text>
        <View style={styles.modeRow}>
          {BUILD_PACKS.map((pack) => (
            <Button
              key={pack}
              label={pack}
              variant={buildPack === pack ? 'primary' : 'secondary'}
              onPress={() => setBuildPack(pack)}
            />
          ))}
        </View>
      </Card>

      <Card>
        <FormField
          label="Isi .env (opsional)"
          placeholder={'DATABASE_URL=...\nAUTH_SECRET=...'}
          multiline
          numberOfLines={5}
          style={{ minHeight: 100, textAlignVertical: 'top' }}
          value={envContent}
          onChangeText={setEnvContent}
        />
      </Card>

      <Button label="Buat Application" loading={mutation.isPending} disabled={portOutOfRange} onPress={handleSubmit} />
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
  hintText: { fontSize: 11.5, color: colors.inkFaint, marginTop: spacing.xs, lineHeight: 16 },
  modeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
