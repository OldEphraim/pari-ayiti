import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ht from './locales/ht.json';
import fr from './locales/fr.json';

export type Language = 'ht' | 'fr';
export const SUPPORTED_LANGUAGES: Language[] = ['ht', 'fr'];

const STORAGE_KEY = 'pari-ayiti.language';

function isLanguage(value: string | null): value is Language {
  return value === 'ht' || value === 'fr';
}

export async function initI18n(): Promise<void> {
  let initial: Language = 'ht';
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (isLanguage(stored)) {
      initial = stored;
    }
  } catch {
    // AsyncStorage can fail on first boot or corrupted state; fall back to ht.
  }

  await i18n.use(initReactI18next).init({
    resources: {
      ht: { translation: ht },
      fr: { translation: fr },
    },
    lng: initial,
    fallbackLng: 'fr',
    // RN doesn't render HTML — no XSS risk in interpolation.
    interpolation: { escapeValue: false },
    // Avoid suspense so async resource loading doesn't blank the screen.
    react: { useSuspense: false },
    returnNull: false,
  });
}

export async function setLanguage(lang: Language): Promise<void> {
  await i18n.changeLanguage(lang);
  try {
    await AsyncStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Non-fatal — next launch will fall back to default; the switch still
    // took effect in the current session.
  }
}

export function currentLanguage(): Language {
  return (i18n.language as Language) ?? 'ht';
}

export default i18n;
