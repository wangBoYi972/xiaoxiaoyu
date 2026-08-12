import api from '../../../api';
import React from 'react';
import { Tooltip } from 'antd';
import {
  MinusOutlined, BorderOutlined, CloseOutlined,
  MenuFoldOutlined, MenuUnfoldOutlined,
  SettingOutlined, BellOutlined, ThunderboltOutlined,
} from '@ant-design/icons';

const isMac = typeof navigator !== 'undefined' && navigator.platform?.toLowerCase().includes('mac');
const isWeb = !(window as any).electronAPI;

interface TitleBarProps {
  onSettingsClick: () => void;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  onAnnouncementClick: () => void;
}

// 创意窗口控点
function WinBtn({ icon, color, hoverColor, onClick, title }: {
  icon: React.ReactNode; color: string; hoverColor: string; onClick: () => void; title: string;
}) {
  const [hovered, setHovered] = React.useState(false);
  return (
    <Tooltip title={title}>
      <div className="titlebar-no-drag"
        onClick={onClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          width: 28, height: 28, borderRadius: 9,
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: hovered ? hoverColor : 'transparent',
          color: hovered ? '#fff' : color,
          transition: 'all 0.2s cubic-bezier(0.4,0,0.2,1)',
          fontSize: 13,
        }}
      >
        {icon}
      </div>
    </Tooltip>
  );
}

// 图标按钮
function IconBtn({ icon, onClick, title }: { icon: React.ReactNode; onClick: () => void; title: string }) {
  const [hovered, setHovered] = React.useState(false);
  return (
    <Tooltip title={title}>
      <div className="titlebar-no-drag"
        onClick={onClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          width: 30, height: 30, borderRadius: 10,
          cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: hovered ? 'rgba(22,119,255,0.08)' : 'transparent',
          color: hovered ? '#1677ff' : 'rgba(0,0,0,0.45)',
          transition: 'all 0.2s ease',
          fontSize: 16,
        }}
      >
        {icon}
      </div>
    </Tooltip>
  );
}

export function TitleBar({ onSettingsClick, sidebarCollapsed, onToggleSidebar, onAnnouncementClick }: TitleBarProps) {
  return (
    <div className="titlebar-drag"
      style={{
        height: 42, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        paddingLeft: isMac ? 80 : 14, paddingRight: 8, flexShrink: 0,
        background: 'rgba(255,255,255,0.55)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(0,0,0,0.05)',
      }}
    >
      {/* 左侧 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* 折叠 */}
        <IconBtn
          icon={sidebarCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          onClick={onToggleSidebar} title="折叠菜单"
        />

        {/* Logo */}
        <div className="titlebar-no-drag" style={{
          width: 28, height: 28, borderRadius: 10,
          overflow: 'hidden',
          boxShadow: '0 3px 10px rgba(22,119,255,0.30)',
        }}>
          <img src="./logo.png" alt="小小榆" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>

        <span style={{
          fontSize: 15, fontWeight: 700, letterSpacing: 0.5,
          background: 'linear-gradient(135deg, #1677ff 0%, #0ea5e9 100%)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        }}>
          小小榆
        </span>
      </div>

      {/* 右侧 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <IconBtn icon={<BellOutlined />} onClick={onAnnouncementClick} title="公告消息" />
        <IconBtn icon={<SettingOutlined />} onClick={onSettingsClick} title="设置中心" />

        {!isMac && !isWeb && (
          <>
            <div style={{ width: 1, height: 16, background: 'rgba(0,0,0,0.08)', margin: '0 6px', borderRadius: 1 }} />

            <WinBtn icon={<MinusOutlined />} color="rgba(0,0,0,0.4)" hoverColor="#f5a623" onClick={() => api.minimizeWindow()} title="最小化" />
            <WinBtn icon={<BorderOutlined />} color="rgba(0,0,0,0.4)" hoverColor="#52c41a" onClick={() => api.maximizeWindow()} title="最大化/还原" />
            <WinBtn icon={<CloseOutlined />} color="rgba(0,0,0,0.4)" hoverColor="#ff4d4f" onClick={() => api.closeWindow()} title="关闭窗口" />
          </>
        )}
      </div>
    </div>
  );
}
