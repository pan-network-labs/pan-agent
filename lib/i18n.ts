/**
 * 多语言支持工具
 * 支持英文（en）和繁体中文（zh-TW）
 */

import React from 'react';

export type Locale = 'en' | 'zh-TW';

export const defaultLocale: Locale = 'en';
export const locales: Locale[] = ['en', 'zh-TW'];

// 语言显示名称
export const localeNames: Record<Locale, string> = {
  'en': 'English',
  'zh-TW': '繁體中文',
};

// 加载语言文件
async function loadLocale(locale: Locale): Promise<Record<string, any>> {
  try {
    const module = await import(`../locales/${locale}.json`);
    return module.default || module;
  } catch (error) {
    console.error(`Failed to load locale ${locale}:`, error);
    // 如果加载失败，尝试加载默认语言
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

// 获取当前语言（从 localStorage 或浏览器语言）
export function getLocale(): Locale {
  if (typeof window === 'undefined') {
    return defaultLocale;
  }

  // 从 localStorage 读取
  const saved = localStorage.getItem('locale') as Locale;
  if (saved && locales.includes(saved)) {
    return saved;
  }

  // 从浏览器语言检测
  const browserLang = navigator.language || (navigator as any).userLanguage;
  if (browserLang.startsWith('zh')) {
    // 如果是中文，检查是否是繁体
    if (browserLang.includes('TW') || browserLang.includes('HK')) {
      return 'zh-TW';
    }
    // 简体中文也使用繁体（如果没有简体版本）
    return 'zh-TW';
  }

  return defaultLocale;
}

// 设置语言
export function setLocale(locale: Locale) {
  if (typeof window === 'undefined') {
    return;
  }
  localStorage.setItem('locale', locale);
  // 触发自定义事件，通知组件更新
  window.dispatchEvent(new CustomEvent('localechange', { detail: locale }));
}

// 翻译函数（同步版本，需要预先加载）
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
      // 如果找不到翻译，返回 key
      return key;
    }
  }

  if (typeof value !== 'string') {
    return key;
  }

  // 替换参数
  if (params) {
    return value.replace(/\{(\w+)\}/g, (match, paramKey) => {
      return params[paramKey]?.toString() || match;
    });
  }

  return value;
}

// React Hook 用于在组件中使用翻译
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

    // 监听语言变化
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


