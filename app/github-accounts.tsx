import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '@/components/Card';
import { FormField } from '@/components/FormField';
import { Button } from '@/components/Button';
import { AppModal, AppModalKind, AppModalButton } from '@/components/AppModal';
import { colors, radius, spacing } from '@/lib/theme';
import { listGithubAccounts, addGithubAccount, removeGithubAccount, ApiError } from '@/lib/api';

interface ModalState {
  visible: boolean;
  kind: AppModalKind;
  title: string;
  message?: string;
  buttons?: AppModalButton[];
}

const MODAL_CLOSED: ModalState = { visible: false, kind: 'info', title: '' };

export default function GithubAccountsScreen() {
  const qc = useQueryClient();
  const [label, setLabel] = useState('');
  const [username, setUsername] = useState('');
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removingLabel, setRemovingLabel] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>(MODAL_CLOSED);

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ['github-accounts'],
    queryFn: listGithubAccounts,
  });

  function closeModal() {
    setModal(MODAL_CLOSED);
  }

  function showInfo(kind: AppModalKind, title: string, message?: string) {
    setModal({ visible: true, kind, title, message, buttons: [{ label: 'OK', onPress: closeModal }] });
  }

  async function handleAdd() {
    if (!label.trim() || !username.trim() || !token.trim()) {
      showInfo('warning', 'Belum lengkap', 'Label, username, dan token (PAT) wajib diisi.');
      return;
    }
    setSaving(true);
    try {
      await addGithubAccount({ label: label.trim(), username: username.trim(), token: token.trim() });
      setLabel('');
      setUsername('');
      setToken('');
      await qc.invalidateQueries({ queryKey: ['github-accounts'] });
      showInfo('success', 'Tersimpan', 'Akun GitHub berhasil disimpan. Muncul otomatis di pilihan akun saat deploy repo private.');
    } catch (err) {
      showInfo('error', 'Gagal menyimpan', err instanceof ApiError ? err.message : 'Terjadi kesalahan tak terduga.');
    } finally {
      setSaving(false);
    }
  }

  function confirmRemove(accLabel: string) {
    setModal({
      visible: true,
      kind: 'warning',
      title: 'Hapus akun ini?',
      message: `Akun "${accLabel}" tidak akan bisa dipakai lagi buat clone repo private sampai ditambah ulang.`,
      buttons: [
        { label: 'Batal', onPress: closeModal, variant: 'secondary' },
        {
          label: 'Hapus',
          variant: 'danger',
          onPress: async () => {
            closeModal();
            setRemovingLabel(accLabel);
            try {
              await removeGithubAccount(accLabel);
              await qc.invalidateQueries({ queryKey: ['github-accounts'] });
            } catch (err) {
              showInfo('error', 'Gagal hapus', err instanceof ApiError ? err.message : 'Terjadi kesalahan tak terduga.');
            } finally {
              setRemovingLabel(null);
            }
          },
        },
      ],
    });
  }

  const accounts = data?.accounts ?? [];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={styles.content}
      refreshControl={undefined}
    >
      <Card style={styles.introCard}>
        <View style={styles.introIconWrap}>
          <Ionicons name="logo-github" size={18} color={colors.accent} />
        </View>
        <Text style={styles.intro}>
          Simpan Personal Access Token (PAT) GitHub di sini buat deploy repo PRIVATE. Token dipakai server buat clone
          repo, gak pernah dikirim balik ke app setelah tersimpan (cuma label & username yang muncul di daftar).
        </Text>
      </Card>

      <Text style={styles.sectionTitle}>Tambah Akun</Text>
      <Card>
        <FormField label="Label" placeholder="mis. zenin" value={label} onChangeText={setLabel} />
        <FormField label="Username GitHub" placeholder="mis. catur" value={username} onChangeText={setUsername} />
        <FormField
          label="Personal Access Token"
          placeholder="ghp_..."
          secureTextEntry={!showToken}
          value={token}
          onChangeText={setToken}
          rightElement={
            <Pressable hitSlop={8} onPress={() => setShowToken((v) => !v)}>
              <Ionicons name={showToken ? 'eye-off-outline' : 'eye-outline'} size={18} color={colors.inkFaint} />
            </Pressable>
          }
        />
        <Button label="Simpan Akun" loading={saving} onPress={handleAdd} />
      </Card>

      <Text style={styles.sectionTitle}>Akun Tersimpan</Text>
      {isLoading && (
        <Card>
          <Text style={styles.emptyText}>Memuat...</Text>
        </Card>
      )}
      {isError && (
        <Card style={{ borderColor: colors.redSoft, backgroundColor: colors.redSoft }}>
          <Text style={{ color: colors.red, fontSize: 13 }}>
            Gagal memuat daftar akun: {(error as Error)?.message ?? 'unknown error'}
          </Text>
        </Card>
      )}
      {!isLoading && !isError && accounts.length === 0 && (
        <Card>
          <Text style={styles.emptyText}>Belum ada akun GitHub tersimpan. Tambah dulu di atas.</Text>
        </Card>
      )}
      {accounts.map((acc) => (
        <Card key={acc.label} style={styles.itemRow}>
          <View style={styles.itemIconWrap}>
            <Ionicons name="key-outline" size={16} color={colors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.itemLabel}>{acc.label}</Text>
            <Text style={styles.itemSub}>{acc.username}</Text>
          </View>
          <Button
            label="Hapus"
            variant="secondary"
            loading={removingLabel === acc.label}
            onPress={() => confirmRemove(acc.label)}
          />
        </Card>
      ))}

      <AppModal
        visible={modal.visible}
        kind={modal.kind}
        title={modal.title}
        message={modal.message}
        buttons={modal.buttons}
        onRequestClose={closeModal}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.lg, paddingBottom: spacing.xxl },
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
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.inkFaint,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  emptyText: { fontSize: 13, color: colors.inkMuted },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  itemIconWrap: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemLabel: { fontSize: 13.5, fontWeight: '700', color: colors.ink },
  itemSub: { fontSize: 11.5, color: colors.inkMuted, marginTop: 2 },
});
