import React, { useEffect, useRef, useState } from 'react';
import { message, Slider, Switch } from 'antd';
import {
  BgColorsOutlined,
  DeleteOutlined,
  PictureOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import type { WallpaperConfig } from '../layout/Wallpaper';

/**
 * 外观设置面板 — 壁纸自定义 + 主题
 * 持久化策略：
 *   1. 优先走主进程 settings（跨会话保留）
 *   2. 兜底写 localStorage（Web 预览模式）
 */

const STORAGE_KEY = 'xiaoxiaoyu_wallpaper_v1';

/** 内置壁纸（纯 CSS 渐变预设，不占空间） */
const PRESETS: Array<{ id: string; label: string; css: string }> = [
  { id: 'aurora', label: '极光', css: 'linear-gradient(135deg,#0f172a 0%,#1e1b4b 35%,#312e81 60%,#0e7490 100%)' },
  { id: 'midnight', label: '午夜', css: 'linear-gradient(160deg,#020617 0%,#0b1120 50%,#111827 100%)' },
  { id: 'ember', label: '余烬', css: 'linear-gradient(150deg,#18181b 0%,#3f1d1d 45%,#7c2d12 100%)' },
  { id: 'forest', label: '深林', css: 'linear-gradient(150deg,#052e16 0%,#064e3b 45%,#0f172a 100%)' },
  { id: 'rose', label: '玫瑰', css: 'linear-gradient(140deg,#2e1065 0%,#831843 55%,#4c1d95 100%)' },
  { id: 'paper', label: '素纸', css: 'linear-gradient(160deg,#f8fafc 0%,#eef2ff 50%,#e0e7ff 100%)' },
];

interface Props {
  config: WallpaperConfig;
  onChange: (cfg: WallpaperConfig) => void;
}

const AppearanceSettings: React.FC<Props> = ({ config, onChange }) => {
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const patch = (p: Partial<WallpaperConfig>) => onChange({ ...config, ...p });

  /** 选择本地图片 → 优先让主进程读成 dataURL（避免 file:// 被安全策略拦） */
  const pickImage = async () => {
    setBusy(true);
    try {
      const api = (window as any).electronAPI;
      // 主进程通道存在则走原生对话框
      if (api?.wallpaper?.pick) {
        const res = await api.wallpaper.pick();
        if (res?.success && res.dataUrl) {
          patch({ src: res.dataUrl, enabled: true, dim: config.dim ?? 0.42 });
          message.success('壁纸已应用');
        } else if (res?.canceled) {
          /* 用户取消，静默 */
        } else if (res?.error) {
          message.error(res.error);
        }
      } else {
        // 兜底：浏览器文件选择，转 dataURL
        fileRef.current?.click();
      }
    } catch (e: any) {
      message.error('选择图片失败：' + (e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  const onFileFallback = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 12 * 1024 * 1024) {
      message.warning('图片过大（>12MB），换一张小一点的吧');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      patch({ src: String(reader.result), enabled: true, dim: config.dim ?? 0.42 });
      message.success('壁纸已应用');
    };
    reader.readAsDataURL(f);
    e.target.value = '';
  };

  const applyPreset = (css: string) => {
    // 预设用渐变实现，不需要遮罩压暗
    patch({ src: `__preset__:${css}`, enabled: true, dim: 0 });
  };

  const clear = () => {
    patch({ src: '', enabled: false });
    message.info('已恢复默认背景');
  };

  return (
    <div style={{ padding: '4px 2px' }}>
      <div className="g-label" style={{ marginTop: 0 }}>壁纸</div>

      {/* 当前壁纸预览 */}
      <div
        className="wp-preview"
        style={{
          height: 108,
          borderRadius: 'var(--r-md)',
          border: '1px solid var(--g-stroke)',
          background: config.enabled && config.src
            ? config.src.startsWith('__preset__:')
              ? config.src.replace('__preset__:', '')
              : `center/cover no-repeat url("${config.src}")`
            : 'var(--fallback-bg-active)',
          marginBottom: 10,
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div className="wp-preview-scrim" />
        <span className="wp-preview-tag">
          {config.src ? '当前壁纸' : '默认背景'}
        </span>
      </div>

      {/* 操作按钮 */}
      <div style={{ display: 'flex', gap: 7, marginBottom: 14 }}>
        <button className="g-chip" onClick={pickImage} disabled={busy} style={{ height: 30 }}>
          <PictureOutlined /> {busy ? '处理中…' : '选择图片'}
        </button>
        <button className="g-chip" onClick={clear} style={{ height: 30 }}>
          <ReloadOutlined /> 重置
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={onFileFallback}
        />
      </div>

      {/* 内置预设 */}
      <div className="g-label">内置配色</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {PRESETS.map((p) => {
          const active = config.enabled && config.src === `__preset__:${p.css}`;
          return (
            <button
              key={p.id}
              className={`wp-swatch ${active ? 'on' : ''}`}
              title={p.label}
              onClick={() => applyPreset(p.css)}
              style={{ background: p.css }}
            />
          );
        })}
      </div>

      {/* 参数调节 */}
      {config.enabled && !!config.src && (
        <>
          <div className="g-label">模糊</div>
          <Slider
            min={0} max={40} value={config.blur ?? 0}
            onChange={(v) => patch({ blur: v })}
            tooltip={{ formatter: (v) => `${v}px` }}
          />

          <div className="g-label">遮罩浓度</div>
          <Slider
            min={0} max={0.85} step={0.01} value={config.dim ?? 0.42}
            onChange={(v) => patch({ dim: v })}
            tooltip={{ formatter: (v) => `${Math.round((v ?? 0) * 100)}%` }}
          />
          <div style={{ fontSize: 11.5, color: 'var(--text-quaternary)', marginTop: -4, marginBottom: 12, lineHeight: 1.6 }}>
            调高可让文字更清晰，调低壁纸更通透
          </div>
        </>
      )}

      <div className="g-divider" />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2px 0' }}>
        <div>
          <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>启用壁纸</div>
          <div style={{ fontSize: 11.5, color: 'var(--text-quaternary)', marginTop: 2 }}>
            关闭后使用默认深色渐变
          </div>
        </div>
        <Switch
          size="small"
          checked={config.enabled ?? true}
          onChange={(v) => patch({ enabled: v })}
        />
      </div>
    </div>
  );
};

/* ---------------- 持久化辅助（供 store 调用） ---------------- */
export function loadWallpaperConfig(): WallpaperConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { enabled: false, blur: 0, dim: 0.42 };
}

export function saveWallpaperConfig(cfg: WallpaperConfig) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg)); } catch {}
}

export { STORAGE_KEY, PRESETS };
export default AppearanceSettings;
