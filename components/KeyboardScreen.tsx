import { ReactNode, createContext, useContext, useEffect, useRef, useState } from 'react';
import { ScrollView, Platform, StyleSheet, StyleProp, ViewStyle, Keyboard, KeyboardEvent } from 'react-native';

/**
 * Context yang nyediain fungsi "scroll ke input yang lagi fokus" ke anak-anak
 * KeyboardScreen. Dipakai lewat hook `useKeyboardScroll()` di FormField / raw
 * TextInput yang butuh auto-scroll pas di-tap.
 */
const KeyboardScrollContext = createContext<{ scrollToInput: (node: any) => void } | null>(null);

export function useKeyboardScroll() {
  return useContext(KeyboardScrollContext);
}

/**
 * Wrapper standar buat layar berisi form (TextInput dkk).
 *
 * BUG SEBELUMNYA ("kadang bisa kadang gak" pas dev/`npx expo start`, dan
 * SAMA SEKALI gak jalan di build asli/release): kode lama pakai
 * `scrollResponderScrollNativeHandleToKeyboard`, method PRIVAT/legacy RN
 * (gak ada di typings resmi, makanya di-@ts-ignore) yang jalan lewat
 * UIManager versi lama. Method itu gak konsisten didukung di Fabric/New
 * Architecture (app ini pakai `newArchEnabled: true` di app.json) - itu
 * kenapa perilakunya beda antara `npx expo start` (kalau lewat Expo Go,
 * ada jalur keyboard-avoidance sendiri di luar kode kita, jadi kelihatan
 * "mendingan" walau tetap kadang meleset) vs build APK/AAB asli (Fabric
 * aktif penuh, method privat itu sering diam-diam gak ngefek sama sekali).
 *
 * Sekarang diganti 2 mekanisme yang KEDUANYA API PUBLIK & stabil, gak
 * nambah dependency baru:
 * 1. `Keyboard.addListener` buat tau TINGGI keyboard yang beneran muncul,
 *    lalu nambahin padding-bottom ScrollView sebesar itu. Sebelumnya
 *    padding-bottom cuma fixed kecil dari tiap layar (mis. 60) - kalau
 *    keyboard-nya tinggi (ada suggestion bar dll), ScrollView-nya gak
 *    punya cukup "ruang gulir" buat naikin input paling bawah sampai
 *    beneran lewat dari keyboard, walau udah dipanggil scrollTo - inilah
 *    yang bikin di build asli kelihatan "mentok"/gak bisa digulir lagi
 *    padahal inputnya masih ketutup.
 * 2. `ref.measureLayout()` - method resmi yang ada di semua host component
 *    (termasuk TextInput), dipakai buat ngukur posisi input yang lagi
 *    difokus relatif ke ScrollView, lalu manggil `scrollTo()` manual.
 */
export function KeyboardScreen({
  children,
  style,
  contentContainerStyle,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    // `Will*` di iOS biar animasinya nyambung mulus sama animasi keyboard;
    // iOS gak selalu ngirim event `Will*` yang reliable di Android, jadi
    // pakai `Did*` di situ.
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, (e: KeyboardEvent) => {
      setKeyboardHeight(e.endCoordinates?.height ?? 0);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  function scrollToInput(node: any) {
    if (!node || typeof node.measureLayout !== 'function') return;
    // Delay dikit biar keyboard/resize layout ("adjustResize" di Android)
    // udah mulai settle sebelum posisi input diukur - tanpa ini kadang
    // keukur posisi LAMA (sebelum layout ke-resize keyboard).
    setTimeout(() => {
      const scrollNode = scrollRef.current;
      if (!scrollNode) return;
      node.measureLayout(
        scrollNode,
        (_x: number, y: number) => {
          scrollNode.scrollTo({ y: Math.max(y - 80, 0), animated: true });
        },
        () => {
          // Pengukuran gagal (jarang, mis. node udah unmount) - diamkan
          // aja, jangan sampai bikin layar crash gara-gara auto-scroll.
        }
      );
    }, Platform.OS === 'android' ? 150 : 60);
  }

  const flatContentStyle = StyleSheet.flatten(contentContainerStyle) || {};

  return (
    <KeyboardScrollContext.Provider value={{ scrollToInput }}>
      <ScrollView
        ref={scrollRef}
        style={[styles.flex, style]}
        contentContainerStyle={[
          flatContentStyle,
          // Tambahan ruang scroll seukuran keyboard yang lagi kebuka, biar
          // input paling bawah SELALU bisa digulir sampai lewat dari
          // keyboard, bukan cuma sampai batas padding statis layar.
          keyboardHeight > 0 ? { paddingBottom: (flatContentStyle.paddingBottom || 0) + keyboardHeight } : null,
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    </KeyboardScrollContext.Provider>
  );
}

const styles = StyleSheet.create({ flex: { flex: 1 } });
