import { Stack } from 'expo-router';
import { colors } from '@/lib/theme';

// Sama seperti deploy/_layout.tsx — "Buat DB Baru" di Dashboard masuk
// langsung ke database/create, jadi index perlu dipaksa selalu jadi dasar
// stack biar menu Database gak ketimpa.
export const unstable_settings = {
  initialRouteName: 'index',
};

export default function DatabaseStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.card },
        headerTintColor: colors.ink,
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Database' }} />
      <Stack.Screen name="create" options={{ title: 'Buat Database', presentation: 'modal' }} />
      <Stack.Screen name="coolify-query" options={{ title: 'Coolify SQL (Beta)', presentation: 'modal' }} />
      <Stack.Screen name="coolify-new-database" options={{ title: 'Buat Database Coolify (Beta)', presentation: 'modal' }} />
      <Stack.Screen name="[dbName]/index" options={{ title: 'Detail Database' }} />
      <Stack.Screen name="[dbName]/[tableName]" options={{ title: 'Detail Tabel' }} />
    </Stack>
  );
}
