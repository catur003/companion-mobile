import { Stack } from 'expo-router';
import { colors } from '@/lib/theme';

// Penting: tanpa ini, kalau tab Deploy di-masuki langsung ke rute nested,
// Expo Router akan init stack tab ini HANYA dengan layar tujuan tsb, tanpa
// "index" di bawahnya. Ini memaksa "index" selalu jadi dasar stack, mau
// masuknya lewat rute mana pun.
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
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="coolify-files" options={{ title: 'File Viewer Coolify (Beta)', presentation: 'modal' }} />
      <Stack.Screen name="coolify-new" options={{ title: 'Deploy Baru (Coolify Beta)', presentation: 'modal' }} />
      <Stack.Screen name="coolify-logs" options={{ title: 'Log Coolify (Beta)', presentation: 'modal' }} />
      <Stack.Screen name="coolify-env" options={{ title: 'Env Vars Coolify (Beta)', presentation: 'modal' }} />
      <Stack.Screen name="coolify-migrate" options={{ title: 'DB Push/Seed (Beta)', presentation: 'modal' }} />
      <Stack.Screen name="coolify-projects" options={{ title: 'Kelola Mapping Project (Beta)' }} />
      <Stack.Screen name="coolify-domain" options={{ title: 'Domain & SSL (Beta)', presentation: 'modal' }} />
      <Stack.Screen name="ssh-credentials" options={{ title: 'Kredensial SSH', presentation: 'modal' }} />
      <Stack.Screen
        name="ssh-terminal"
        options={{
          title: 'Terminal SSH',
          headerStyle: { backgroundColor: colors.termBg },
          headerTintColor: colors.termText,
        }}
      />
    </Stack>
  );
}
