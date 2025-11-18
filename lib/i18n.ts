/**
 * Multi-language support utility
 * Supports English (en) and Traditional Chinese (zh-TW)
 */

import React from 'react';

export type Locale = 'en' | 'zh-TW';

export const defaultLocale: Locale = 'en';
export const locales: Locale[] = ['en', 'zh-TW'];

// Language display names
export const localeNames: Record<Locale, string> = {
  'en': 'English',
  'zh-TW': '繁體中文',
};

// Load language file
async function loadLocale(locale: Locale): Promise<Record<string, any>> {
  try {
    const module = await import(`../locales/${locale}.json`);
    return module.default || module;
  } catch (error) {
    console.error(`Failed to load locale ${locale}:`, error);
    // If loading fails, try to load default language
    if (locale !== defaultLocale) {
      try {
        const module = await import(`../locales/${defaultLocale}.json`);
        return module.default || module;
      } catch {
        return {};
      }
    }
    return {};
  }
}

// Get current language (from localStorage or browser language)
export function getLocale(): Locale {
  if (typeof window === 'undefined') {
    return defaultLocale;
  }

  // Read from localStorage
  const saved = localStorage.getItem('locale') as Locale;
  if (saved && locales.includes(saved)) {
    return saved;
  }

  // Detect from browser language
  const browserLang = navigator.language || (navigator as any).userLanguage;
  if (browserLang.startsWith('zh')) {
    // If it's Chinese, check if it's Traditional
    if (browserLang.includes('TW') || browserLang.includes('HK')) {
      return 'zh-TW';
    }
    // Simplified Chinese also uses Traditional (if no Simplified version available)
    return 'zh-TW';
  }

  return defaultLocale;
}

// Set language
export function setLocale(locale: Locale) {
  if (typeof window === 'undefined') {
    return;
  }
  localStorage.setItem('locale', locale);
  // Trigger custom event to notify components to update
  window.dispatchEvent(new CustomEvent('localechange', { detail: locale }));
}

// Translation function (synchronous version, requires pre-loading)
export function t(
  translations: Record<string, any>,
  key: string,
  params?: Record<string, string | number>
): string {
  const keys = key.split('.');
  let value: any = translations;

  for (const k of keys) {
    if (value && typeof value === 'object' && k in value) {
      value = value[k];
    } else {
      // If translation not found, return key
      return key;
    }
  }

  if (typeof value !== 'string') {
    return key;
  }

  // Replace parameters
  if (params) {
    return value.replace(/\{(\w+)\}/g, (match, paramKey) => {
      return params[paramKey]?.toString() || match;
    });
  }

  return value;
}

// React Hook for using translations in components
export function useTranslations(locale: Locale) {
  const [translations, setTranslations] = React.useState<Record<string, any>>({});
  const [loading, setLoading] = React.useState(true);
  const [currentLocale, setCurrentLocale] = React.useState<Locale>(locale);

  React.useEffect(() => {
    let mounted = true;

    const load = async () => {
      const data = await loadLocale(currentLocale);
      if (mounted) {
        setTranslations(data);
        setLoading(false);
      }
    };

    load();

    // Listen for language changes
    const handleLocaleChange = (event: any) => {
      const newLocale = event.detail || getLocale();
      setCurrentLocale(newLocale);
      loadLocale(newLocale).then((data) => {
        if (mounted) {
          setTranslations(data);
        }
      });
    };

    window.addEventListener('localechange', handleLocaleChange);

    return () => {
      mounted = false;
      window.removeEventListener('localechange', handleLocaleChange);
    };
  }, [currentLocale]);

  const translate = React.useCallback(
    (key: string, params?: Record<string, string | number>) => {
      return translations ? t(translations, key, params) : key;
    },
    [translations]
  );

  return { t: translate, loading, locale: currentLocale };
}


