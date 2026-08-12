import React, { useEffect, useState } from 'react';
import { ConfigProvider, theme, App as AntApp } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import enUS from 'antd/locale/en_US';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { LoginPage } from './components/auth/LoginPage';
import { useSettingsStore } from './stores/settings-store';
import { useModelStore } from './stores/model-store';

const isElectron = !!(window as any).electronAPI;

interface AuthUser { id: number; username: string; role: string; }

function getStoredUser(): AuthUser | null {
  try {
    if (isElectron) return null;
    const raw = localStorage.getItem('auth_user');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function App() {
  const { theme: themeMode } = useSettingsStore();
  const { language, fontSize, loadSettings } = useSettingsStore();
  const { loadProviders, setActiveProvider } = useModelStore();
  const [authUser, setAuthUser] = useState<AuthUser | null>(getStoredUser());
  const [ollamaReady, setOllamaReady] = useState(false);
  const [ollamaSetupProgress, setOllamaSetupProgress] = useState<string>('');
  const [guestMode, setGuestMode] = useState(false);

  // 全局字号应用
  useEffect(() => {
    document.documentElement.style.fontSize = fontSize + 'px';
  }, [fontSize]);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  useEffect(() => {
    if (authUser || guestMode) loadProviders();
  }, [authUser, guestMode, loadProviders]);

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

  // 免登录进入游客模式
  const handleGuestMode = () => {
    setGuestMode(true);
    setActiveProvider('ollama');
  };

  const handleLogin = (user: AuthUser) => {
    const key = isElectron ? 'desktop_user' : 'auth_user';
    localStorage.setItem(key, JSON.stringify(user));
    setAuthUser(user);
  };

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
  useEffect(() => { document.body.classList.toggle('dark-theme', isDark); }, [isDark]);

  const algorithm = isDark ? [theme.darkAlgorithm] : [theme.defaultAlgorithm];
  const locale = language === 'en-US' ? enUS : zhCN;

  // 未登录 + 非游客 → 显示登录/注册页
  if (!authUser && !guestMode) {
    return (
      <ConfigProvider locale={locale} theme={{ algorithm, token: { colorPrimary: '#1677ff', colorPrimaryBg: '#e6f4ff', borderRadius: 8, colorTextBase: '#0a2540' } }}>
        <AntApp>
          <LoginPage
            onLogin={handleLogin}
            ollamaReady={ollamaReady}
            ollamaSetupProgress={ollamaSetupProgress}
            onGuestMode={handleGuestMode}
          />
        </AntApp>
      </ConfigProvider>
    );
  }

  return (
    <ConfigProvider
      locale={locale}
      theme={{
        algorithm,
        token: {
          colorPrimary: '#1677ff',
          colorPrimaryBg: '#e6f4ff',
          borderRadius: 8,
          fontSize: fontSize,
          colorTextBase: '#0a2540',
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'PingFang SC', 'Microsoft YaHei', sans-serif",
        },
      }}
    >
      <AntApp>
        <HashRouter>
          <Routes>
            <Route path="/*" element={<AppLayout />} />
          </Routes>
        </HashRouter>
      </AntApp>
    </ConfigProvider>
  );
}
