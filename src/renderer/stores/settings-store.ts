import { create } from 'zustand';
import api from '../../api';

interface SettingsStore {
  theme: 'light' | 'dark' | 'system';
  language: 'zh-CN' | 'en-US';
  fontSize: number;
  autoLaunch: boolean;
  sendWithEnter: boolean;
  streamEnabled: boolean;
  bgImage: string;          // base64 data URL 或空
  bgOpacity: number;        // 背景透明度 (0.1 ~ 1.0)
  settingsOpen: boolean;
  /** 打开设置时默认落在哪个页签（如 'rag'），用完由抽屉自行清空 */
  settingsTab: string;

  loadSettings: () => Promise<void>;
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  setLanguage: (lang: 'zh-CN' | 'en-US') => void;
  setFontSize: (size: number) => void;
  setAutoLaunch: (val: boolean) => void;
  setSendWithEnter: (val: boolean) => void;
  setStreamEnabled: (val: boolean) => void;
  setBgImage: (base64: string) => void;
  setBgOpacity: (opacity: number) => void;
  toggleSettings: () => void;
  openSettingsTab: (tab: string) => void;
  clearSettingsTab: () => void;
  saveSetting: (key: string, value: string) => Promise<void>;
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  theme: 'system',
  language: 'zh-CN',
  fontSize: 14,
  autoLaunch: false,
  sendWithEnter: true,
  streamEnabled: true,
  bgImage: '',
  bgOpacity: 0.35,
  settingsOpen: false,
  settingsTab: '',

  loadSettings: async () => {
    try {
      const settings = await api.getAllSettings();
      set({
        theme: (settings.theme as SettingsStore['theme']) || 'system',
        language: (settings.language as SettingsStore['language']) || 'zh-CN',
        fontSize: parseInt(settings.fontSize || '14'),
        autoLaunch: settings.autoLaunch === 'true',
        sendWithEnter: settings.sendWithEnter !== 'false',
        streamEnabled: settings.streamEnabled !== 'false',
        bgImage: settings.bgImage || '',
        bgOpacity: parseFloat(settings.bgOpacity || '0.35'),
      });
    } catch {
      // default
    }
  },

  setTheme: (theme) => { set({ theme }); get().saveSetting('theme', theme); },
  setLanguage: (language) => { set({ language }); get().saveSetting('language', language); },
  setFontSize: (fontSize) => { set({ fontSize }); get().saveSetting('fontSize', String(fontSize)); },
  setAutoLaunch: (autoLaunch) => { set({ autoLaunch }); get().saveSetting('autoLaunch', String(autoLaunch)); },
  setSendWithEnter: (sendWithEnter) => { set({ sendWithEnter }); get().saveSetting('sendWithEnter', String(sendWithEnter)); },
  setStreamEnabled: (streamEnabled) => { set({ streamEnabled }); get().saveSetting('streamEnabled', String(streamEnabled)); },

  setBgImage: (base64) => {
    set({ bgImage: base64 });
    get().saveSetting('bgImage', base64);
  },

  setBgOpacity: (opacity) => {
    set({ bgOpacity: opacity });
    get().saveSetting('bgOpacity', String(opacity));
  },

  toggleSettings: () => set((s) => ({ settingsOpen: !s.settingsOpen })),
  openSettingsTab: (tab) => set({ settingsOpen: true, settingsTab: tab }),
  clearSettingsTab: () => set({ settingsTab: '' }),

  saveSetting: async (key, value) => {
    try { await api.setSetting(key, value); } catch {}
  },
}));
