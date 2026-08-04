import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { FormField } from './FormField';
import { Card } from './Card';
import { Button } from './Button';
import { ThemePicker } from './ThemePicker';
import { AppModal, AppModalKind, AppModalButton } from './AppModal';
import { AuroraBackground } from './AuroraBackground';
import { colors, radius, spacing } from '@/lib/theme';
import { useTabTopPadding } from '@/lib/useTopInset';
import { getApiKey, getBaseUrl, setApiKey, setBaseUrl, clearCredentials } from '@/lib/storage';
import {
  getCompanionBaseUrl,
  getCompanionToken,
  setCompanionBaseUrl,
  setCompanionToken,
  clearCompanionCredentials,
} from '@/lib/storage';
import {
  getCoolifyBaseUrl,
  getCoolifyToken,
  setCoolifyBaseUrl,
  setCoolifyToken,
  clearCoolifyCredentials,
} from '@/lib/storage';
import { useAuth } from '@/lib/AuthContext';
import { healthCheck } from '@/lib/api';
import { companionHealthCheck } from '@/lib/companionApi';
import { coolifyHealthCheck } from '@/lib/coolifyApi';

interface ModalState {
  visible: boolean;
  kind: AppModalKind;
  title: string;
  message?: string;
  buttons?: AppModalButton[];
}

const MODAL_CLOSED: ModalState = { visible: false, kind: 'info', title: '' };

interface SettingsFormProps {
  /**
   * 'tab'   - dipakai di tab "Setelan" (Tabs headerShown: false) - butuh
   *           padding atas dari safe-area insets sendiri + header custom.
   * 'modal' - dipakai di layar `/settings` yang dibuka lewat Stack modal
   *           (sudah punya native header "Pengaturan Koneksi") - JANGAN
   *           dobel padding/header.
   */
  variant?: 'tab' | 'modal';
}

export function SettingsForm({ variant = 'modal' }: SettingsFormProps) {
  const router = useRouter();
  const topPadding = useTabTopPadding(spacing.lg);
  const { refresh } = useAuth();

  const [baseUrl, setBaseUrlInput] = useState('');
  const [apiKey, setApiKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modal, setModal] = useState<ModalState>(MODAL_CLOSED);

  // Companion API (Coolify migration, Fase 4) - state terpisah, TIDAK
  // dicampur sama field vps-manager di atas. Lihat lib/companionApi.ts.
  const [companionUrl, setCompanionUrlInput] = useState('');
  const [companionToken, setCompanionTokenInput] = useState('');
  const [showCompanionToken, setShowCompanionToken] = useState(false);
  const [companionTesting, setCompanionTesting] = useState(false);
  const [companionSaving, setCompanionSaving] = useState(false);

  // Coolify API langsung (Bagian 3.2) - state terpisah lagi dari Companion API.
  const [coolifyUrl, setCoolifyUrlInput] = useState('');
  const [coolifyToken, setCoolifyTokenInput] = useState('');
  const [showCoolifyToken, setShowCoolifyToken] = useState(false);
  const [coolifyTesting, setCoolifyTesting] = useState(false);
  const [coolifySaving, setCoolifySaving] = useState(false);

  useEffect(() => {
    (async () => {
      const [url, key] = await Promise.all([getBaseUrl(), getApiKey()]);
      if (url) setBaseUrlInput(url);
      if (key) setApiKeyInput(key);
    })();
    (async () => {
      const [url, token] = await Promise.all([getCompanionBaseUrl(), getCompanionToken()]);
      if (url) setCompanionUrlInput(url);
      if (token) setCompanionTokenInput(token);
    })();
    (async () => {
      const [url, token] = await Promise.all([getCoolifyBaseUrl(), getCoolifyToken()]);
      if (url) setCoolifyUrlInput(url);
      if (token) setCoolifyTokenInput(token);
    })();
  }, []);

  function closeModal() {
    setModal(MODAL_CLOSED);
  }

  function showInfo(kind: AppModalKind, title: string, message?: string) {
    setModal({ visible: true, kind, title, message, buttons: [{ label: 'OK', onPress: closeModal }] });
  }

  async function handleTest() {
    if (!baseUrl.trim()) {
      showInfo('warning', 'Isi dulu', 'URL API wajib diisi, mis. https://vps-anda.com/api');
      return;
    }
    setTesting(true);
    const ok = await healthCheck(baseUrl.trim());
    setTesting(false);
    showInfo(
      ok ? 'success' : 'error',
      ok ? 'Berhasil' : 'Gagal',
      ok ? 'Server bisa dihubungi.' : 'Server tidak merespons di URL ini. Cek lagi alamatnya.'
    );
  }

  async function handleSave() {
    if (!baseUrl.trim() || !apiKey.trim()) {
      showInfo('warning', 'Belum lengkap', 'URL API dan API Key wajib diisi.');
      return;
    }
    setSaving(true);
    try {
      await setBaseUrl(baseUrl.trim());
      await setApiKey(apiKey.trim());
      // Refresh dulu SEBELUM navigasi, biar pas segments berubah ke
      // "(tabs)", AuthGate udah lihat configured=true - bukan nilai lama.
      await refresh();
      router.replace('/(tabs)');
    } catch (err) {
      // Bug fix: sebelumnya gak ada try/catch di sini - kalau SecureStore
      // gagal nulis (mis. Keystore error di release build), error-nya
      // ketelan diam-diam: tombol nyangkut loading, data gak ke-save,
      // isConfigured() tetap false selamanya, dan AuthGate di _layout.tsx
      // terus nge-bounce user balik ke Settings tiap ganti tab (keliatan
      // kayak "tab lain gabisa dipencet"). Sekarang errornya ditampilin
      // biar user tahu ada yang gagal, bukan nyangkut diam-diam.
      showInfo(
        'error',
        'Gagal Menyimpan',
        `Kredensial gagal disimpan ke perangkat ini: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setModal({
      visible: true,
      kind: 'warning',
      title: 'Hapus koneksi?',
      message: 'API key yang tersimpan di HP ini akan dihapus. Anda perlu isi ulang URL & API key buat pakai app lagi.',
      buttons: [
        { label: 'Batal', onPress: closeModal, variant: 'secondary' },
        {
          label: 'Hapus',
          variant: 'danger',
          onPress: async () => {
            await clearCredentials();
            await refresh();
            setBaseUrlInput('');
            setApiKeyInput('');
            closeModal();
            router.replace('/settings');
          },
        },
      ],
    });
  }

  // ---- Companion API (Coolify) - mirror handler di atas, TAPI gak
  // manggil refresh()/AuthGate sama sekali. Companion API itu opsional/
  // tambahan (Bagian 3.2: paralel, bukan pengganti) - app tetap harus bisa
  // dipakai normal buat project VPS lama walau Companion API belum diisi.
  async function handleCompanionTest() {
    if (!companionUrl.trim()) {
      showInfo('warning', 'Isi dulu', 'URL Companion API wajib diisi.');
      return;
    }
    setCompanionTesting(true);
    const ok = await companionHealthCheck(companionUrl.trim());
    setCompanionTesting(false);
    showInfo(
      ok ? 'success' : 'error',
      ok ? 'Berhasil' : 'Gagal',
      ok ? 'Companion API bisa dihubungi.' : 'Companion API tidak merespons di URL ini. Cek lagi alamat & port-nya.'
    );
  }

  async function handleCompanionSave() {
    if (!companionUrl.trim() || !companionToken.trim()) {
      showInfo('warning', 'Belum lengkap', 'URL dan Token Companion API wajib diisi.');
      return;
    }
    setCompanionSaving(true);
    try {
      await setCompanionBaseUrl(companionUrl.trim());
      await setCompanionToken(companionToken.trim());
      showInfo('success', 'Tersimpan', 'Koneksi Companion API tersimpan di perangkat ini.');
    } catch (err) {
      showInfo(
        'error',
        'Gagal Menyimpan',
        `Kredensial gagal disimpan ke perangkat ini: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      setCompanionSaving(false);
    }
  }

  function handleCompanionReset() {
    setModal({
      visible: true,
      kind: 'warning',
      title: 'Hapus koneksi Companion API?',
      message: 'URL & token Companion API yang tersimpan di HP ini akan dihapus.',
      buttons: [
        { label: 'Batal', onPress: closeModal, variant: 'secondary' },
        {
          label: 'Hapus',
          variant: 'danger',
          onPress: async () => {
            await clearCompanionCredentials();
            setCompanionUrlInput('');
            setCompanionTokenInput('');
            closeModal();
          },
        },
      ],
    });
  }

  // ---- Coolify API langsung (Bagian 3.2) - mirror lagi pola yang sama.
  async function handleCoolifyTest() {
    if (!coolifyUrl.trim() || !coolifyToken.trim()) {
      showInfo('warning', 'Isi dulu', 'URL dan Token Coolify wajib diisi buat tes koneksi.');
      return;
    }
    setCoolifyTesting(true);
    const ok = await coolifyHealthCheck(coolifyUrl.trim(), coolifyToken.trim());
    setCoolifyTesting(false);
    showInfo(
      ok ? 'success' : 'error',
      ok ? 'Berhasil' : 'Gagal',
      ok ? 'Coolify API bisa dihubungi & token valid.' : 'Gagal hubungi Coolify API - cek URL & token-nya.'
    );
  }

  async function handleCoolifySave() {
    if (!coolifyUrl.trim() || !coolifyToken.trim()) {
      showInfo('warning', 'Belum lengkap', 'URL dan Token Coolify wajib diisi.');
      return;
    }
    setCoolifySaving(true);
    try {
      await setCoolifyBaseUrl(coolifyUrl.trim());
      await setCoolifyToken(coolifyToken.trim());
      showInfo('success', 'Tersimpan', 'Koneksi Coolify API tersimpan di perangkat ini.');
    } catch (err) {
      showInfo(
        'error',
        'Gagal Menyimpan',
        `Kredensial gagal disimpan ke perangkat ini: ${err instanceof Error ? err.message : String(err)}`
      );
    } finally {
      setCoolifySaving(false);
    }
  }

  function handleCoolifyReset() {
    setModal({
      visible: true,
      kind: 'warning',
      title: 'Hapus koneksi Coolify API?',
      message: 'URL & token Coolify API yang tersimpan di HP ini akan dihapus.',
      buttons: [
        { label: 'Batal', onPress: closeModal, variant: 'secondary' },
        {
          label: 'Hapus',
          variant: 'danger',
          onPress: async () => {
            await clearCoolifyCredentials();
            setCoolifyUrlInput('');
            setCoolifyTokenInput('');
            closeModal();
          },
        },
      ],
    });
  }

  return (
    <View style={{ flex: 1 }}>
      {variant === 'tab' && <AuroraBackground />}
      <ScrollView
        // 'tab' - AuroraBackground dipasang langsung di atas (di dalam
        // wrapper View yang sama), jadi transparent biar nembus. 'modal' -
        // dipakai juga buat onboarding pertama kali SEBELUM masuk (tabs)
        // sama sekali (gak ada Aurora dipasang), jadi TETAP solid colors.bg
        // biar gak nampilin layar kosong/transparan yang aneh.
        style={{ flex: 1, backgroundColor: variant === 'tab' ? 'transparent' : colors.bg }}
        contentContainerStyle={[styles.content, variant === 'tab' && { paddingTop: topPadding }]}
      >
      {variant === 'tab' && (
        <>
          <Text style={styles.eyebrow}>ZENHUB VPS</Text>
          <Text style={styles.title}>Setelan</Text>
        </>
      )}

      <Card style={styles.introCard}>
        <View style={styles.introIconWrap}>
          <Ionicons name="link-outline" size={18} color={colors.accent} />
        </View>
        <Text style={styles.intro}>
          Hubungkan app ke API vps-manager di server Anda. API key didapat dari perintah{' '}
          <Text style={styles.code}>npm run api:keygen</Text> di VPS. Server API jalan di localhost:4001 secara
          default — pastikan sudah dipasang reverse proxy + SSL lewat Nginx, lalu isi URL publiknya di bawah.
        </Text>
      </Card>

      {variant === 'tab' && (
        <>
          <Text style={styles.sectionTitle}>Tampilan</Text>
          <ThemePicker />
        </>
      )}

      <Text style={styles.sectionTitle}>Koneksi Server</Text>
      <Card>
        <FormField
          label="URL API"
          placeholder="https://vps-anda.com"
          keyboardType="url"
          value={baseUrl}
          onChangeText={setBaseUrlInput}
        />
        <FormField
          label="API Key"
          placeholder="Tempel API key di sini"
          secureTextEntry={!showKey}
          value={apiKey}
          onChangeText={setApiKeyInput}
          rightElement={
            <Pressable hitSlop={8} onPress={() => setShowKey((v) => !v)}>
              <Ionicons name={showKey ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.inkFaint} />
            </Pressable>
          }
        />
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs }}>
          <View style={{ flex: 1 }}>
            <Button label="Tes Koneksi" variant="secondary" loading={testing} onPress={handleTest} />
          </View>
          <View style={{ flex: 1 }}>
            <Button label="Simpan" loading={saving} onPress={handleSave} />
          </View>
        </View>
      </Card>

      <Text style={styles.sectionTitle}>Companion API (Coolify — Beta)</Text>
      <Card style={styles.introCard}>
        <View style={styles.introIconWrap}>
          <Ionicons name="git-branch-outline" size={18} color={colors.accent} />
        </View>
        <Text style={styles.intro}>
          Opsional. Isi ini cuma buat project yang sudah pindah ke Coolify (mis. PORTOFOLIO). Project lain tetap
          pakai koneksi vps-manager di atas — dua-duanya bisa aktif bareng selama masa migrasi.
        </Text>
      </Card>
      <Card>
        <FormField
          label="URL Companion API"
          placeholder="http://ip-vps-coolify:4100"
          keyboardType="url"
          value={companionUrl}
          onChangeText={setCompanionUrlInput}
        />
        <FormField
          label="Token"
          placeholder="Tempel COMPANION_API_TOKEN di sini"
          secureTextEntry={!showCompanionToken}
          value={companionToken}
          onChangeText={setCompanionTokenInput}
          rightElement={
            <Pressable hitSlop={8} onPress={() => setShowCompanionToken((v) => !v)}>
              <Ionicons name={showCompanionToken ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.inkFaint} />
            </Pressable>
          }
        />
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs }}>
          <View style={{ flex: 1 }}>
            <Button label="Tes Koneksi" variant="secondary" loading={companionTesting} onPress={handleCompanionTest} />
          </View>
          <View style={{ flex: 1 }}>
            <Button label="Simpan" loading={companionSaving} onPress={handleCompanionSave} />
          </View>
        </View>
        {Boolean(companionUrl || companionToken) && (
          <Pressable onPress={handleCompanionReset} style={{ marginTop: spacing.sm, alignSelf: 'flex-start' }}>
            <Text style={{ fontSize: 12, color: colors.red, fontWeight: '600' }}>Hapus koneksi Companion API</Text>
          </Pressable>
        )}
      </Card>

      <Text style={styles.sectionTitle}>Coolify API Langsung (Beta)</Text>
      <Card style={styles.introCard}>
        <View style={styles.introIconWrap}>
          <Ionicons name="cube-outline" size={18} color={colors.accent} />
        </View>
        <Text style={styles.intro}>
          Buat start/stop/restart & lihat status app langsung dari Coolify (setara PM2 di atas). Token bisa sama
          persis dengan COOLIFY_API_TOKEN yang udah diisi di .env Companion API - instance Coolify yang sama.
        </Text>
      </Card>
      <Card>
        <FormField
          label="URL Coolify"
          placeholder="http://ip-vps-coolify:8000"
          keyboardType="url"
          value={coolifyUrl}
          onChangeText={setCoolifyUrlInput}
        />
        <FormField
          label="Token"
          placeholder="Tempel Coolify API Token di sini"
          secureTextEntry={!showCoolifyToken}
          value={coolifyToken}
          onChangeText={setCoolifyTokenInput}
          rightElement={
            <Pressable hitSlop={8} onPress={() => setShowCoolifyToken((v) => !v)}>
              <Ionicons name={showCoolifyToken ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.inkFaint} />
            </Pressable>
          }
        />
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs }}>
          <View style={{ flex: 1 }}>
            <Button label="Tes Koneksi" variant="secondary" loading={coolifyTesting} onPress={handleCoolifyTest} />
          </View>
          <View style={{ flex: 1 }}>
            <Button label="Simpan" loading={coolifySaving} onPress={handleCoolifySave} />
          </View>
        </View>
        {Boolean(coolifyUrl || coolifyToken) && (
          <Pressable onPress={handleCoolifyReset} style={{ marginTop: spacing.sm, alignSelf: 'flex-start' }}>
            <Text style={{ fontSize: 12, color: colors.red, fontWeight: '600' }}>Hapus koneksi Coolify API</Text>
          </Pressable>
        )}
      </Card>

      <Text style={styles.sectionTitle}>Data & Cache</Text>
      <Card onPress={() => router.push('/cleanup')} style={styles.rowCard}>
        <View style={[styles.rowIconWrap, { backgroundColor: colors.blueSoft }]}>
          <Ionicons name="trash-bin-outline" size={18} color={colors.blue} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowTitle}>Bersihkan Cache Project</Text>
          <Text style={styles.rowSub}>Hapus .next/cache & node_modules/.cache tiap project di VPS</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.inkFaint} />
      </Card>

      <Text style={styles.sectionTitle}>Deploy</Text>
      <Card onPress={() => router.push('/github-accounts')} style={styles.rowCard}>
        <View style={[styles.rowIconWrap, { backgroundColor: colors.accentSoft }]}>
          <Ionicons name="logo-github" size={18} color={colors.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowTitle}>Akun GitHub</Text>
          <Text style={styles.rowSub}>Kelola akun/token buat deploy repo private</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.inkFaint} />
      </Card>

      <Text style={styles.sectionTitle}>Tentang</Text>
      <Card onPress={() => Linking.openURL('https://github.com/catur003')} style={styles.rowCard}>
        <View style={[styles.rowIconWrap, { backgroundColor: colors.accentSoft }]}>
          <Ionicons name="logo-github" size={18} color={colors.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowTitle}>Dibuat oleh catur003</Text>
          <Text style={styles.rowSub}>github.com/catur003</Text>
        </View>
        <Ionicons name="open-outline" size={18} color={colors.inkFaint} />
      </Card>

      <Text style={[styles.sectionTitle, { color: colors.red }]}>Zona Berbahaya</Text>
      <Card style={styles.dangerCard} onPress={handleReset}>
        <View style={[styles.rowIconWrap, { backgroundColor: colors.redSoft }]}>
          <Ionicons name="log-out-outline" size={18} color={colors.red} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.rowTitle, { color: colors.red }]}>Hapus Koneksi Tersimpan</Text>
          <Text style={styles.rowSub}>URL & API key akan dihapus dari HP ini</Text>
        </View>
      </Card>

      <AppModal
        visible={modal.visible}
        kind={modal.kind}
        title={modal.title}
        message={modal.message}
        buttons={modal.buttons}
        onRequestClose={closeModal}
      />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
  eyebrow: { fontSize: 11, fontWeight: '700', color: colors.inkFaint, letterSpacing: 1 },
  title: { fontSize: 24, fontWeight: '800', color: colors.ink, marginBottom: spacing.lg },
  introCard: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  introIconWrap: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  intro: { flex: 1, fontSize: 13, color: colors.inkMuted, lineHeight: 19 },
  code: { fontFamily: 'monospace', color: colors.ink, backgroundColor: colors.divider },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.inkFaint,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  rowCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowIconWrap: { width: 36, height: 36, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 14, fontWeight: '700', color: colors.ink },
  rowSub: { fontSize: 11.5, color: colors.inkMuted, marginTop: 2 },
  dangerCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderColor: colors.redSoft },
});
