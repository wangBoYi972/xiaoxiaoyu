import React, { useEffect, useState } from 'react';
import { Drawer, Tabs, Typography } from 'antd';
import {
  SettingOutlined,
  ApiOutlined,
  CloudServerOutlined,
  InfoCircleOutlined,
  ThunderboltOutlined,
  BgColorsOutlined,
  DatabaseOutlined,
} from '@ant-design/icons';
import { RagSettings } from './RagSettings';
import { GeneralSettings } from './GeneralSettings';
import { ModelSettings } from './ModelSettings';
import { McpSettings } from './McpSettings';
import { SkillsSettings } from './SkillsSettings';
import { AboutPanel } from './AboutPanel';
import AppearanceSettings, {
  loadWallpaperConfig,
  saveWallpaperConfig,
} from './AppearanceSettings';
import type { WallpaperConfig } from '../layout/Wallpaper';
import { useSettingsStore } from '../../stores/settings-store';

const { Text } = Typography;

interface SettingsDrawerProps {
  open: boolean;
  onClose: () => void;
  onViewChange?: (view: 'chat' | 'finetune') => void;
}

export function SettingsDrawer({ open, onClose, onViewChange }: SettingsDrawerProps) {
  const bgImage = useSettingsStore((s) => s.bgImage);
  const bgOpacity = useSettingsStore((s) => s.bgOpacity);
  const setBgImage = useSettingsStore((s) => s.setBgImage);
  const setBgOpacity = useSettingsStore((s) => s.setBgOpacity);
  // 外部可指定默认页签（例如从「知识库」chip 跳进来）
  const requestedTab = useSettingsStore((s) => s.settingsTab);
  const clearSettingsTab = useSettingsStore((s) => s.clearSettingsTab);
  const [activeTab, setActiveTab] = useState('appearance');

  // 外部指定页签时跳过去，并立即清掉标记，避免后续手动切换被锁死
  useEffect(() => {
    if (requestedTab) {
      setActiveTab(requestedTab);
      clearSettingsTab();
    }
  }, [requestedTab, clearSettingsTab]);

  // 壁纸配置：以 settings-store 为准，localStorage 存模糊等附加参数
  const [wallpaper, setWallpaper] = useState<WallpaperConfig>(() => {
    const saved = loadWallpaperConfig();
    return { ...saved, src: saved.src || bgImage };
  });

  const handleWallpaperChange = (cfg: WallpaperConfig) => {
    setWallpaper(cfg);
    saveWallpaperConfig(cfg);
    // 同步到 settings-store（跨会话持久化 + 供 Wallpaper 层读取）。
    // 预设壁纸 src 形如 "__preset__:linear-gradient(...)"，去掉前缀存纯渐变，
    // 让 Wallpaper 层据此区分「渐变」与「图片 dataURL」；关闭开关则清空壁纸。
    const src = cfg.src?.startsWith('__preset__:')
      ? cfg.src.slice('__preset__:'.length)
      : (cfg.src || '');
    setBgImage(cfg.enabled === false ? '' : src);
    if (cfg.dim !== undefined) {
      // dim 越大越暗 → 面板不透明度反向换算
      setBgOpacity(Math.max(0.1, Math.min(1, 0.75 - cfg.dim)));
    }
  };

  const tabContent = (node: React.ReactNode) => (
    <div className="settings-tab-body g-scroll">{node}</div>
  );

  return (
    <Drawer
      className="glass-drawer"
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <SettingOutlined style={{ fontSize: 18, color: 'var(--accent)' }} />
          <span
            style={{
              fontSize: 17,
              fontWeight: 600,
              background: 'linear-gradient(135deg, #4f7cff, #7c9dff)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            设置
          </span>
        </div>
      }
      placement="right"
      width={520}
      onClose={onClose}
      open={open}
      styles={{
        body: { padding: 0 },
      }}
    >
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        tabPosition="top"
        centered
        size="large"
        className="settings-tabs"
        items={[
          {
            key: 'appearance',
            label: (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <BgColorsOutlined /> 外观
              </span>
            ),
            children: tabContent(
              <AppearanceSettings config={wallpaper} onChange={handleWallpaperChange} />
            ),
          },
          {
            key: 'general',
            label: (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <SettingOutlined /> 通用
              </span>
            ),
            children: tabContent(<GeneralSettings />),
          },
          {
            key: 'models',
            label: (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <ApiOutlined /> 模型
              </span>
            ),
            children: tabContent(<ModelSettings />),
          },
          {
            key: 'rag',
            label: (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <DatabaseOutlined /> 知识库
              </span>
            ),
            children: tabContent(<RagSettings />),
          },
          {
            key: 'skills',
            label: (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <ThunderboltOutlined /> 技能
              </span>
            ),
            children: tabContent(<SkillsSettings />),
          },
          {
            key: 'mcp',
            label: (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <CloudServerOutlined /> MCP
              </span>
            ),
            children: tabContent(<McpSettings />),
          },
          {
            key: 'about',
            label: (
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <InfoCircleOutlined /> 关于
              </span>
            ),
            children: tabContent(<AboutPanel />),
          },
        ]}
      />
    </Drawer>
  );
}
