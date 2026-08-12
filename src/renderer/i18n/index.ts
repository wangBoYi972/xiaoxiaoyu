import zhCN from './zh-CN.json';

// 简化版 i18n，不需要 i18next 依赖
// 后续可以接入 i18next/react-i18next

type TranslationValue = string | { [key: string]: TranslationValue };

const translations: Record<string, Record<string, TranslationValue>> = {
  'zh-CN': zhCN as unknown as Record<string, TranslationValue>,
};

export function t(key: string, lang: string = 'zh-CN'): string {
  const keys = key.split('.');
  let value: TranslationValue = translations[lang] || translations['zh-CN'];

  for (const k of keys) {
    if (typeof value === 'object' && value !== null && k in value) {
      value = (value as Record<string, TranslationValue>)[k];
    } else {
      return key;
    }
  }

  return typeof value === 'string' ? value : key;
}

export function useI18n(lang: string = 'zh-CN') {
  return {
    t: (key: string) => t(key, lang),
    lang,
  };
}
