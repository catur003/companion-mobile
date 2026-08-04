import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Alert, Pressable } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/components/Card';
import { FormField } from '@/components/FormField';
import { Button } from '@/components/Button';
import { AppModal, AppModalButton, AppModalKind } from '@/components/AppModal';
import { KeyboardScreen } from '@/components/KeyboardScreen';
import { colors, spacing } from '@/lib/theme';
import { getSshCredentials, setSshCredentials, clearSshCredentials, SshAuthMethod } from '@/lib/storage';
import { connectSsh, getErrorMessage } from '@/lib/ssh';

interface ModalState {
  visible: boolean;
  kind: AppModalKind;
  title: string;
  message?: string;
}

/**
 * Form setup kredensial buat Terminal SSH native (Fase 3) - disimpan lokal
 * lewat expo-secure-store (lihat `lib/storage.ts`), dipakai `ssh-terminal.tsx`
 * buat konek. Host/user/port/password/private key TIDAK PERNAH dikirim ke
 * backend vps-manager - koneksinya langsung dari HP ke server lewat port 22,
 * di luar jalur API `execCommand`/`/system/exec` yang sudah ada.
 */
export default function SshCredentialsScreen() {
  const router = useRouter();
  const [loaded, setLoaded] = useState(false);
  const [host, setHost] = useState('');
  const [port, setPort] = useState('22');
  const [username, setUsername] = useState('root');
  const [authMethod, setAuthMethod] = useState<SshAuthMethod>('password');
  const [password, setPassword] = useState('');
  const [privateKey, setPrivateKey] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modal, setModal] = useState<ModalState>({ visible: false, kind: 'info', title: '' });

  useEffect(() => {
    (async () => {
      const saved = await getSshCredentials();
      if (saved) {
        setHost(saved.host);
        setPort(String(saved.port));
        setUsername(saved.username);
        setAuthMethod(saved.authMethod);
        setPassword(saved.password ?? '');
        setPrivateKey(saved.privateKey ?? '');
        setPassphrase(saved.passphrase ?? '');
      }
      setLoaded(true);
    })();
  }, []);

  function closeModal() {
    setModal((m) => ({ ...m, visible: false }));
  }

  function buildCredentials() {
    const portNum = Number(port);
    if (!host.trim() || !username.trim() || !portNum) return null;
    if (authMethod === 'password' && !password) return null;
    if (authMethod === 'key' && !privateKey.trim()) return null;
    return {
      host: host.trim(),
      port: portNum,
      username: username.trim(),
      authMethod,
      password: authMethod === 'password' ? password : undefined,
      privateKey: authMethod === 'key' ? privateKey.trim() : undefined,
      passphrase: authMethod === 'key' ? passphrase || undefined : undefined,
    };
  }

  async function handleTest() {
    const creds = buildCredentials();
    if (!creds) {
      Alert.alert('Belum lengkap', 'Isi host, username, port, dan password/private key dulu.');
      return;
    }
    setTesting(true);
    try {
      const session = await connectSsh(creds);
      session.disconnect();
      setModal({ visible: true, kind: 'success', title: 'Berhasil Konek', message: `Login sebagai ${creds.username}@${creds.host} sukses.` });
    } catch (err) {
      setModal({
        visible: true,
        kind: 'error',
        title: 'Gagal Konek',
        message: getErrorMessage(err),
      });
    } finally {
      setTesting(false);
    }
  }

  async function handleSave() {
    const creds = buildCredentials();
    if (!creds) {
      Alert.alert('Belum lengkap', 'Isi host, username, port, dan password/private key dulu.');
      return;
    }
    setSaving(true);
    try {
      await setSshCredentials(creds);
      setModal({
        visible: true,
        kind: 'success',
        title: 'Kredensial Tersimpan',
        message: 'Sekarang bisa langsung buka Terminal SSH dari Diagnostik.',
      });
    } catch (err) {
      setModal({
        visible: true,
        kind: 'error',
        title: 'Gagal Simpan',
        message: err instanceof Error ? err.message : 'Penyimpanan gagal - kemungkinan private key kepanjangan untuk device ini.',
      });
    } finally {
      setSaving(false);
    }
  }

  function handleClear() {
    Alert.alert('Hapus Kredensial SSH?', 'Kamu perlu isi ulang dari awal buat pakai Terminal SSH lagi.', [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus',
        style: 'destructive',
        onPress: async () => {
          await clearSshCredentials();
          setHost('');
          setPort('22');
          setUsername('root');
          setPassword('');
          setPrivateKey('');
          setPassphrase('');
        },
      },
    ]);
  }

  if (!loaded) return null;

  return (
    <KeyboardScreen style={styles.screen} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: 'Kredensial SSH' }} />

      <Card style={{ backgroundColor: colors.accentSoft, borderColor: 'transparent' }}>
        <Text style={styles.infoText}>
          Dipakai buat Terminal SSH beneran (bukan lewat API vps-manager) - koneksi langsung dari HP ke port 22
          server. Disimpan cuma di HP ini (expo-secure-store), gak pernah dikirim ke backend.
        </Text>
      </Card>

      <Card>
        <FormField label="Host / IP Server" placeholder="vps.contoh.com atau 103.x.x.x" value={host} onChangeText={setHost} />
        <FormField label="Port SSH" placeholder="22" keyboardType="number-pad" value={port} onChangeText={setPort} />
        <FormField label="Username" placeholder="root / catur / deploy" value={username} onChangeText={setUsername} />
      </Card>

      <Card>
        <Text style={styles.label}>Metode Autentikasi</Text>
        <View style={styles.methodRow}>
          <Button
            label="Password"
            variant={authMethod === 'password' ? 'primary' : 'secondary'}
            onPress={() => setAuthMethod('password')}
          />
          <Button
            label="Private Key"
            variant={authMethod === 'key' ? 'primary' : 'secondary'}
            onPress={() => setAuthMethod('key')}
          />
        </View>

        {authMethod === 'password' ? (
          <FormField
            label="Password"
            placeholder="Password SSH"
            secureTextEntry={!showSecret}
            value={password}
            onChangeText={setPassword}
            style={{ marginTop: spacing.md }}
            rightElement={
              <Pressable hitSlop={8} onPress={() => setShowSecret((v) => !v)}>
                <Ionicons name={showSecret ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.inkFaint} />
              </Pressable>
            }
          />
        ) : (
          <>
            <FormField
              label="Private Key (PEM/OpenSSH)"
              placeholder={'-----BEGIN OPENSSH PRIVATE KEY-----\n...'}
              multiline
              numberOfLines={6}
              style={{ minHeight: 120, textAlignVertical: 'top', marginTop: spacing.md }}
              value={privateKey}
              onChangeText={setPrivateKey}
            />
            <FormField
              label="Passphrase (opsional)"
              placeholder="Kosongkan kalau key gak ada passphrase"
              secureTextEntry={!showSecret}
              value={passphrase}
              onChangeText={setPassphrase}
              rightElement={
                <Pressable hitSlop={8} onPress={() => setShowSecret((v) => !v)}>
                  <Ionicons name={showSecret ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.inkFaint} />
                </Pressable>
              }
            />
            <Text style={styles.hintText}>
              Auth key belum ada contoh resmi di library-nya - kalau ternyata gagal terus, pakai Password dulu.
            </Text>
          </>
        )}

        <View style={styles.actionRow}>
          <View style={{ flex: 1 }}>
            <Button label="Tes Koneksi" variant="secondary" loading={testing} onPress={handleTest} />
          </View>
          <View style={{ flex: 1 }}>
            <Button label="Simpan" loading={saving} onPress={handleSave} />
          </View>
        </View>
      </Card>

      <Text style={styles.sectionTitle}>Zona Berbahaya</Text>
      <Card style={{ borderColor: colors.redSoft }}>
        <Pressable onPress={handleClear}>
          <Text style={styles.dangerText}>Hapus Kredensial Tersimpan</Text>
        </Pressable>
      </Card>

      <AppModal
        visible={modal.visible}
        kind={modal.kind}
        title={modal.title}
        message={modal.message}
        buttons={
          modal.kind === 'success' && modal.title === 'Kredensial Tersimpan'
            ? ([
                { label: 'Nanti Saja', variant: 'secondary', onPress: closeModal },
                {
                  label: 'Buka Terminal',
                  onPress: () => {
                    closeModal();
                    router.replace('/(tabs)/deploy/ssh-terminal');
                  },
                },
              ] as AppModalButton[])
            : undefined
        }
        onRequestClose={closeModal}
      />
    </KeyboardScreen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: 60 },
  label: { fontSize: 12, fontWeight: '700', color: colors.inkMuted, marginBottom: spacing.sm },
  infoText: { fontSize: 12.5, color: colors.ink, lineHeight: 18 },
  methodRow: { flexDirection: 'row', gap: spacing.sm },
  actionRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.red,
    marginTop: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  dangerText: { fontSize: 14, fontWeight: '700', color: colors.red, textAlign: 'center', paddingVertical: 4 },
  hintText: { fontSize: 11, color: colors.inkFaint, marginTop: spacing.xs, lineHeight: 16 },
});
