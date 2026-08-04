import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '@/lib/theme';

// CATATAN: sempat coba pasang <AuroraBackground/> SEKALI di sini (di balik
// <Tabs>) supaya animasinya kontinu gak keulang tiap pindah tab - ternyata
// gak nembus di Android, karena tiap tab dibungkus native `Screen` (dari
// react-native-screens) yang punya kanvas gambar sendiri, `sceneContainerStyle`
// transparent gak selalu diteruskan ke situ. Sekarang AuroraBackground
// dipasang di DALAM masing-masing 5 layar tab (lihat index.tsx,
// database/index.tsx, deploy/index.tsx, diagnostik.tsx, SettingsForm.tsx) -
// konsekuensinya animasi reset tiap kali layar itu di-mount ulang, tapi
// dijamin nembus karena gak lewat batas native Screen sama sekali.
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.inkFaint,
        tabBarStyle: { borderTopColor: colors.divider, backgroundColor: colors.card },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="database"
        options={{
          title: 'Database',
          tabBarIcon: ({ color, size }) => <Ionicons name="server-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="deploy"
        options={{
          title: 'Deploy',
          tabBarIcon: ({ color, size }) => <Ionicons name="rocket-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="diagnostik"
        options={{
          title: 'Diagnostik',
          tabBarIcon: ({ color, size }) => <Ionicons name="shield-checkmark-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Setelan',
          tabBarIcon: ({ color, size }) => <Ionicons name="settings-outline" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
