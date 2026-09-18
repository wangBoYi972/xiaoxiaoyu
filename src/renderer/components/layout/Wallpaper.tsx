import React, { useEffect } from 'react';
import { useSettingsStore } from '../../stores/settings-store';

/**
 * 壁纸层 — 铺在整个应用最底部，所有玻璃面板浮在它之上。
 *
 * 关键点：
 *  - 壁纸图片来自 settings-store 的 bgImage（dataURL / file:// / http(s)://）
 *  - 模糊度 / 遮罩浓度通过 CSS 变量注入，避免整树重渲染
 *  - 不做任何 UI，纯展示层；未设置壁纸时回退到内置氛围渐变
 */

export interface WallpaperConfig {
  /** 图片来源：dataURL / file:// / http(s):// ；为空则用默认渐变 */
  src?: string;
  /** 模糊像素，0-40 */
  blur?: number;
  /** 遮罩浓度 0-0.9，越大越暗越清晰 */
  dim?: number;
  /** 是否启用（关闭则回退默认渐变） */
  enabled?: boolean;
}

interface Props {
  /** 可选：外部显式传入配置；不传则从 settings-store 读取 */
  config?: WallpaperConfig;
}

const Wallpaper: React.FC<Props> = ({ config }) => {
  const bgImage = useSettingsStore((s) => s.bgImage);
  const bgOpacity = useSettingsStore((s) => s.bgOpacity);

  const src = config?.src !== undefined ? config.src : bgImage;
  const enabled = config?.enabled ?? true;
  const blur = config?.blur ?? 0;

  // 预设壁纸存的是纯 CSS 渐变（如 linear-gradient(...)），图片则存 dataURL / URL。
  // 渐变要直接作为 backgroundImage 值，不能包进 url("...")。
  const isGradient = src ? /^(linear|radial|conic)-gradient\(/i.test(src) : false;

  // bgOpacity 语义：面板不透明度（0.35 默认）。转成遮罩浓度保证文字可读。
  const dim = config?.dim ?? Math.max(0, Math.min(0.9, 0.75 - bgOpacity));

  // 把模糊度 / 遮罩实时写进 CSS 变量
  // 注意：这里写的是「浓度」，遮罩的「颜色方向」由 CSS 按主题决定
  //      （深色主题向黑压、浅色主题向白压）
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--wallpaper-blur', `${blur}px`);
    root.style.setProperty('--wallpaper-dim', String(dim));
    return () => {
      root.style.removeProperty('--wallpaper-blur');
      root.style.removeProperty('--wallpaper-dim');
    };
  }, [blur, dim]);

  const showImage = enabled && !!src;

  return (
    <div className="wp-root" aria-hidden="true">
      {showImage && (
        <div
          className="wp-image"
          style={{ backgroundImage: isGradient ? src : `url("${src}")` }}
        />
      )}
      {/* 遮罩：有图时压暗，保证前景文字对比度 */}
      {showImage && <div className="wp-dim" />}
      <div className="wp-glow" />
    </div>
  );
};

export default Wallpaper;
export { Wallpaper };
