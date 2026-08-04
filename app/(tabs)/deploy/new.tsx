import { useState } from 'react';
import { StyleSheet, Alert, View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Card } from '@/components/Card';
import { FormField } from '@/components/FormField';
import { Button } from '@/components/Button';
import { KeyboardScreen } from '@/components/KeyboardScreen';
import { colors, spacing } from '@/lib/theme';
import { deployProject, listGithubAccounts, listOpenPorts, ApiError, DeployPayload } from '@/lib/api';

const PRISMA_MODES: DeployPayload['prismaMode'][] = ['none', 'generate', 'push', 'push_force', 'migrate'];
const PRISMA_MODE_LABELS: Record<string, string> = {
  none: 'none',
  generate: 'generate',
  push: 'push',
  push_force: 'push (force)',
  migrate: 'migrate',
};

export default function NewDeployScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [gitRepo, setGitRepo] = useState('');
  const [branch, setBranch] = useState('');
  const [domain, setDomain] = useState('');
  const [port, setPort] = useState('');
  const [folderPath, setFolderPath] = useState('');
  const [deployUser, setDeployUser] = useState('');
  const [envContent, setEnvContent] = useState('');
  const [prismaMode, setPrismaMode] = useState<DeployPayload['prismaMode']>('none');

  // Picker akun GitHub sengaja TIDAK ditaruh di form ini (dipindah ke
  // Setelan > Akun GitHub, biar form deploy tetap simpel). Kalau cuma ada
  // 1 akun tersimpan, kita pakai otomatis tanpa nanya - itu kasus paling
  // umum. Kalau ada >1 akun (ambigu, gak tau mau pakai yang mana), kita
  // TIDAK menebak - biarin gitRepo dikirim tanpa auth, biar gagalnya jelas
  // di step Git Clone (bukan diam-diam clone pakai akun yang salah).
  const githubAccounts = useQuery({ queryKey: ['github-accounts'], queryFn: listGithubAccounts });
  const autoGithubAccountLabel =
    githubAccounts.data?.accounts.length === 1 ? githubAccounts.data.accounts[0].label : undefined;

  // Scan port yang lagi kepake di server (ss -tlnp real, bukan cuma dari
  // registry) - dipakai buat kasih tau user port mana yang gak bisa dipakai
  // SEBELUM submit, bukan nunggu gagal di tengah proses deploy.
  const openPorts = useQuery({ queryKey: ['open-ports'], queryFn: listOpenPorts });
  const usedPortSet = new Set((openPorts.data?.ports ?? []).map((p) => Number(p.port)));
  const usedPortsSorted = Array.from(usedPortSet).sort((a, b) => a - b);
  const portNumForCheck = Number(port);
  const portIsUsed = port.trim() !== '' && Number.isFinite(portNumForCheck) && usedPortSet.has(portNumForCheck);
  const portOutOfRange =
    port.trim() !== '' && (!Number.isFinite(portNumForCheck) || portNumForCheck < 1 || portNumForCheck > 65535);

  const mutation = useMutation({
    mutationFn: (payload: DeployPayload) => deployProject(payload),
    onSuccess: (result) => {
      router.replace(`/(tabs)/deploy/${result.jobId}`);
    },
    onError: (err) => Alert.alert('Gagal memulai deploy', err instanceof ApiError ? err.message : 'Terjadi kesalahan.'),
  });

  function handleSubmit() {
    const portNum = Number(port);
    if (!name.trim() || !gitRepo.trim() || !domain.trim() || !folderPath.trim() || !portNum) {
      Alert.alert('Belum lengkap', 'Nama, Git repo, domain, port, dan folder path wajib diisi.');
      return;
    }
    if (portNum < 1 || portNum > 65535 || !Number.isInteger(portNum)) {
      Alert.alert('Port tidak valid', 'Port harus angka bulat antara 1-65535.');
      return;
    }
    if (usedPortSet.has(portNum)) {
      Alert.alert('Port sudah dipakai', `Port ${portNum} lagi dipakai proses lain di server. Pilih port lain.`);
      return;
    }
    mutation.mutate({
      name: name.trim(),
      gitRepo: gitRepo.trim(),
      domain: domain.trim(),
      port: portNum,
      folderPath: folderPath.trim(),
      branch: branch.trim() || undefined,
      deployUser: deployUser.trim() || undefined,
      envContent: envContent || undefined,
      prismaMode,
      githubAccountLabel: autoGithubAccountLabel,
    });
  }

  return (
    <KeyboardScreen style={styles.screen} contentContainerStyle={styles.content}>
      <Card>
        <FormField label="Nama Project" placeholder="zenstock" value={name} onChangeText={setName} />
        <FormField
          label="Git Repository"
          placeholder="https://github.com/user/repo.git"
          keyboardType="url"
          value={gitRepo}
          onChangeText={setGitRepo}
        />
        <FormField label="Branch (opsional)" placeholder="main" value={branch} onChangeText={setBranch} />
        <FormField label="Domain" placeholder="app.contoh.com" keyboardType="url" value={domain} onChangeText={setDomain} />
        <FormField
          label="Port"
          placeholder="3001"
          keyboardType="number-pad"
          value={port}
          onChangeText={setPort}
          error={portIsUsed || portOutOfRange}
          hint={
            portIsUsed
              ? `⚠ Port ${portNumForCheck} sudah dipakai proses lain, pilih port lain.`
              : portOutOfRange
              ? 'Port harus angka 1-65535.'
              : openPorts.isLoading
              ? 'Memindai port yang lagi dipakai...'
              : usedPortsSorted.length > 0
              ? `Port terpakai: ${usedPortsSorted.join(', ')}`
              : undefined
          }
        />
        <FormField
          label="Folder Path (absolute)"
          placeholder="/var/www/zenstock"
          value={folderPath}
          onChangeText={setFolderPath}
        />
        <FormField
          label="Deploy User (opsional)"
          placeholder="Default dari config VPS"
          value={deployUser}
          onChangeText={setDeployUser}
        />
      </Card>

      <Card>
        <Text style={styles.label}>Mode Prisma</Text>
        <View style={styles.modeRow}>
          {PRISMA_MODES.map((mode) => (
            <Button
              key={mode}
              label={PRISMA_MODE_LABELS[mode!]}
              variant={prismaMode === mode ? 'primary' : 'secondary'}
              onPress={() => setPrismaMode(mode)}
            />
          ))}
        </View>
      </Card>

      <Card>
        <FormField
          label="Isi .env (opsional)"
          placeholder={'DATABASE_URL=...\nNEXTAUTH_SECRET=...'}
          multiline
          numberOfLines={5}
          style={{ minHeight: 100, textAlignVertical: 'top' }}
          value={envContent}
          onChangeText={setEnvContent}
        />
      </Card>

      <Button
        label="Mulai Deploy"
        loading={mutation.isPending}
        disabled={portIsUsed || portOutOfRange}
        onPress={handleSubmit}
      />
    </KeyboardScreen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: 60 },
  label: { fontSize: 12, fontWeight: '700', color: colors.inkMuted, marginBottom: spacing.sm },
  modeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
