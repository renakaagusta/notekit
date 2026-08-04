/**
 * App localization (i18next). English is the default and fallback; every other
 * locale mirrors the shape of `locales/en.ts`.
 *
 * Adding a language later = create `locales/<code>.ts` (typed as `Messages`),
 * then register it in `LOCALES` + `resources` below. Nothing else changes.
 */
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { en } from "./locales/en";
import { id } from "./locales/id";

export const DEFAULT_LOCALE = "en";

/** Registered locales, shown in the language switcher (order = display order). */
export const LOCALES: { code: string; label: string }[] = [
  { code: "en", label: "English" },
  { code: "id", label: "Bahasa Indonesia" },
];

const resources = {
  en: { translation: en },
  id: { translation: id },
};

function initialLocale(): string {
  if (typeof localStorage === "undefined") return DEFAULT_LOCALE;
  const stored = localStorage.getItem("nk:locale");
  return stored && LOCALES.some((l) => l.code === stored) ? stored : DEFAULT_LOCALE;
}

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    resources,
    lng: initialLocale(),
    fallbackLng: DEFAULT_LOCALE,
    interpolation: { escapeValue: false }, // React already escapes
    returnNull: false,
  });
}

/** Persist + apply a locale change. */
export function setLocale(code: string): void {
  if (typeof localStorage !== "undefined") localStorage.setItem("nk:locale", code);
  void i18n.changeLanguage(code);
}

export function currentLocale(): string {
  return i18n.language || DEFAULT_LOCALE;
}

export default i18n;
