import { Stack } from 'expo-router';
import { colors } from '@/lib/theme';

// Penting: tanpa ini, kalau tab Deploy di-masuki langsung ke rute nested
// (misal dari Dashboard tap "Git" -> deploy/git/[name]), Expo Router akan
// init stack tab ini HANYA dengan layar tujuan tsb, tanpa "index" di
// bawahnya. Akibatnya menu utama Deploy (link NGINX, Backup) ketimpa /
// hilang dari history sampai tab-nya di-reset manual. Ini memaksa "index"
// selalu jadi dasar stack, mau masuknya lewat rute mana pun.
export const unstable_settings = {
  initialRouteName: 'index',
};

export default function DeployStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.card },
        headerTintColor: colors.ink,
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Deploy & Jobs' }} />
      <Stack.Screen name="new" options={{ title: 'Deploy Project Baru', presentation: 'modal' }} />
      <Stack.Screen name="ssl" options={{ title: 'Terbitkan SSL', presentation: 'modal' }} />
      <Stack.Screen name="coolify-files" options={{ title: 'File Viewer Coolify (Beta)', presentation: 'modal' }} />
      <Stack.Screen name="coolify-new" options={{ title: 'Deploy Baru (Coolify Beta)', presentation: 'modal' }} />
      <Stack.Screen name="coolify-logs" options={{ title: 'Log Coolify (Beta)', presentation: 'modal' }} />
      <Stack.Screen name="coolify-env" options={{ title: 'Env Vars Coolify (Beta)', presentation: 'modal' }} />
      <Stack.Screen name="coolify-migrate" options={{ title: 'DB Push/Seed (Beta)', presentation: 'modal' }} />
      <Stack.Screen name="coolify-projects" options={{ title: 'Kelola Mapping Project (Beta)' }} />
      <Stack.Screen name="[jobId]/index" options={{ title: 'Detail Job' }} />
      <Stack.Screen name="[jobId]/retry" options={{ title: 'Retry Deploy', presentation: 'modal' }} />
      <Stack.Screen name="nginx/index" options={{ title: 'Site Nginx' }} />
      <Stack.Screen name="nginx/new" options={{ title: 'Site Baru', presentation: 'modal' }} />
      <Stack.Screen name="nginx/[file]" options={{ title: 'Detail Site' }} />
      <Stack.Screen name="git/[name]" options={{ title: 'Git' }} />
      <Stack.Screen name="git/[name]/env" options={{ title: 'Environment', presentation: 'modal' }} />
      <Stack.Screen name="git/[name]/delete" options={{ title: 'Hapus Project', presentation: 'modal' }} />
      <Stack.Screen name="github-accounts" options={{ title: 'Akun GitHub', presentation: 'modal' }} />
      <Stack.Screen name="ssh-credentials" options={{ title: 'Kredensial SSH', presentation: 'modal' }} />
      <Stack.Screen
        name="ssh-terminal"
        options={{
          title: 'Terminal SSH',
          headerStyle: { backgroundColor: colors.termBg },
          headerTintColor: colors.termText,
        }}
      />
      <Stack.Screen name="backup/index" options={{ title: 'Backup & Restore' }} />
      <Stack.Screen name="backup/new" options={{ title: 'Backup Baru', presentation: 'modal' }} />
      <Stack.Screen name="backup/restore/[filename]" options={{ title: 'Restore Backup' }} />
      <Stack.Screen name="backup/import" options={{ title: 'Import SQL File', presentation: 'modal' }} />
      <Stack.Screen
        name="logs/[name]"
        options={{
          title: 'Log',
          headerStyle: { backgroundColor: colors.termBg },
          headerTintColor: colors.termText,
        }}
      />
      <Stack.Screen
        name="terminal"
        options={{
          title: 'Terminal Cepat (Exec)',
          headerStyle: { backgroundColor: colors.termBg },
          headerTintColor: colors.termText,
        }}
      />
    </Stack>
  );
}
