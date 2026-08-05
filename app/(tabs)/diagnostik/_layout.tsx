import { Stack } from 'expo-router';
import { colors } from '@/lib/theme';

// Sama alasan kayak deploy/_layout.tsx: tanpa ini, masuk langsung ke rute
// nested (mis. push dari Dashboard) bikin stack tab ini gak punya "index"
// di dasarnya.
export const unstable_settings = {
  initialRouteName: 'index',
};

export default function DiagnostikStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.card },
        headerTintColor: colors.ink,
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Diagnostik' }} />
      <Stack.Screen name="containers/index" options={{ title: 'Container Docker' }} />
      <Stack.Screen name="containers/[id]" options={{ title: 'Detail Container' }} />
    </Stack>
  );
}
