import React, { useEffect, useState } from 'react';
import { ConfigProvider, theme, App as AntApp } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import enUS from 'antd/locale/en_US';
import { HashRouter, Routes, Route } from 'react-router-dom';
import WorkspaceLayout from './components/workspace/WorkspaceLayout';
import { LoginPage } from './components/auth/LoginPage';
import { Wallpaper } from './components/layout/Wallpaper';
import { useSettingsStore } from './stores/settings-store';
import { useModelStore } from './stores/model-store';
import { useAuthStore } from './stores/auth-store';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AnnouncementModal } from './components/AnnouncementModal';

const isElectron = !!(window as any).electronAPI;

export function App() {
  const { theme: themeMode } = useSettingsStore();
  const { language, fontSize, loadSettings } = useSettingsStore();
  const { loadProviders, setActiveProvider } = useModelStore();
  const [ollamaReady, setOllamaReady] = useState(false);
  const [ollamaSetupProgress, setOllamaSetupProgress] = useState<string>('');

  // 全局字号应用
  useEffect(() => {
    document.documentElement.style.fontSize = fontSize + 'px';
  }, [fontSize]);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  useEffect(() => {
    loadProviders();
  }, [loadProviders]);

  // 监听 Ollama 状态（桌面端 IPC）
  useEffect(() => {
    if (!isElectron) return;
    const api = (window as any).electronAPI;

    const onStatus = (status: any) => {
      if (status.modelReady) {
        setOllamaReady(true);
        setOllamaSetupProgress('');
        setActiveProvider('ollama');
      } else if (status.installed && !status.modelReady) {
        setOllamaSetupProgress('正在准备 AI 模型...');
      }
    };

    const onProgress = (p: any) => {
      if (p.percent !== undefined) {
        setOllamaSetupProgress(`${p.message} ${p.percent}%`);
      } else {
        setOllamaSetupProgress(p.message);
      }
    };

    try {
      api.onOllamaStatus?.(onStatus);
      api.onOllamaProgress?.(onProgress);
    } catch {}

    return () => {
      try {
        api.offOllamaStatus?.(onStatus);
        api.offOllamaProgress?.(onProgress);
      } catch {}
    };
  }, [setActiveProvider]);

  // 首次启动自动检测 Ollama 状态
  useEffect(() => {
    if (!isElectron) return;
    const api = (window as any).electronAPI;
    api.checkOllamaStatus?.().then((s: any) => {
      if (s?.modelReady) {
        setOllamaReady(true);
        setActiveProvider('ollama');
      }
    }).catch(() => {});
  }, [setActiveProvider]);

  // 系统主题
  const [systemIsDark, setSystemIsDark] = useState(
    () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
  );
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setSystemIsDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const isDark = themeMode === 'dark' || (themeMode === 'system' && systemIsDark);

  // 登录门：账号状态唯一真源在 auth-store（桌面端免登录，Web 端必须登录）
  const needLogin = useAuthStore(s => s.loginVisible);
  const signIn = useAuthStore(s => s.signIn);
  useEffect(() => { useAuthStore.getState().init(); }, []);
  useEffect(() => {
    document.body.classList.toggle('dark-theme', isDark);
    // 玻璃设计系统主题类：glass.css 依此切换两套变量
    const root = document.documentElement;
    root.classList.toggle('theme-dark', isDark);
    root.classList.toggle('theme-light', !isDark);
    root.setAttribute('data-theme', isDark ? 'dark' : 'light');
    root.style.colorScheme = isDark ? 'dark' : 'light';
  }, [isDark]);

  const algorithm = isDark ? [theme.darkAlgorithm] : [theme.defaultAlgorithm];
  const locale = language === 'en-US' ? enUS : zhCN;

  return (
    <ConfigProvider
      locale={locale}
      theme={{
        algorithm,
        token: {
          // —— 与 glass.css 的设计 Token 对齐 ——
          colorPrimary: isDark ? '#7c9dff' : '#4f7cff',
          colorInfo: isDark ? '#7c9dff' : '#4f7cff',
          colorSuccess: isDark ? '#4ade80' : '#22c55e',
          colorWarning: isDark ? '#fbbf24' : '#f59e0b',
          colorError: isDark ? '#f87171' : '#ef4444',
          colorBgBase: isDark ? '#0b0e16' : '#f2f5fb',
          colorTextBase: isDark ? '#e7ebf3' : '#0f172a',
          borderRadius: 12,
          fontSize: fontSize,
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'PingFang SC', 'Microsoft YaHei', 'Segoe UI', Roboto, sans-serif",
          // 玻璃浮层：让 antd 弹层本身也半透明，配合 .glass-overlay 类
          colorBgElevated: isDark ? 'rgba(20, 23, 33, 0.86)' : 'rgba(255, 255, 255, 0.86)',
          boxShadowSecondary: isDark
            ? '0 18px 56px rgba(0, 0, 0, 0.46)'
            : '0 18px 56px rgba(30, 41, 59, 0.18)',
          controlHeight: 34,
        },
        components: {
          Modal: {
            contentBg: 'transparent',
            headerBg: 'transparent',
          },
          Drawer: { colorBgElevated: 'transparent' },
          Card: { borderRadiusLG: 16 },
          Button: { borderRadius: 10, borderRadiusLG: 12 },
        },
      }}
    >
      <AntApp>
        {/* 壁纸层（最底层，所有玻璃面板透出它） */}
        <Wallpaper />
        <div className="app-layer">
          <AnnouncementModal />
          {needLogin ? (
            <LoginPage
              onLogin={signIn}
            />
          ) : (
            <ErrorBoundary>
              <HashRouter>
                <Routes>
                  <Route path="/*" element={<WorkspaceLayout />} />
                </Routes>
              </HashRouter>
            </ErrorBoundary>
          )}
        </div>
      </AntApp>
    </ConfigProvider>
  );
}
