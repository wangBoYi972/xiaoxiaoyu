import api from '../../../api';
import React, { useRef } from 'react';
import { Select, Slider, Switch, Typography, Card, Space, Button, Image } from 'antd';
import {
  TranslationOutlined, BgColorsOutlined, FontSizeOutlined,
  SendOutlined, RocketOutlined, PictureOutlined, DeleteOutlined, EyeOutlined,
} from '@ant-design/icons';
import { useSettingsStore } from '../../stores/settings-store';

const { Text } = Typography;

interface SettingCardProps {
  icon: React.ReactNode; title: string; description?: string; children: React.ReactNode;
}

function SettingCard({ icon, title, description, children }: SettingCardProps) {
  return (
    <Card size="small" className="settings-card"
      style={{ marginBottom: 12, borderRadius: 14, border: '1px solid rgba(0,0,0,0.06)', background: 'rgba(255,255,255,0.45)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', transition: 'all 0.2s ease' }}
      styles={{ body: { padding: '16px 20px' } }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 38, height: 38, borderRadius: 12, background: 'linear-gradient(135deg, rgba(22,119,255,0.1), rgba(114,46,209,0.1))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1677ff', fontSize: 18 }}>
            {icon}
          </div>
          <div>
            <Text strong style={{ fontSize: 14 }}>{title}</Text>
            {description && <div><Text type="secondary" style={{ fontSize: 11 }}>{description}</Text></div>}
          </div>
        </div>
        {children}
      </div>
    </Card>
  );
}

export function GeneralSettings() {
  const fileRef = useRef<HTMLInputElement>(null);
  const { theme, language, fontSize, autoLaunch, sendWithEnter, bgImage, bgOpacity,
    setTheme, setLanguage, setFontSize, setAutoLaunch, setSendWithEnter, setBgImage, setBgOpacity } = useSettingsStore();

  const handleUploadBg = async () => {
    const files = await api.openFileDialog({ filters: [{ name: '图片', extensions: ['png','jpg','jpeg','webp','bmp'] }] });
    if (!files.length) return;
    try {
      const fd = await api.readFile(files[0]);
      if (fd.mimeType.startsWith('image/')) {
        const base64 = `data:${fd.mimeType};base64,${fd.data}`;
        // 压缩大图：超过 2MB 警告
        if (base64.length > 2 * 1024 * 1024) {
          setBgImage(base64);
        } else {
          setBgImage(base64);
        }
      }
    } catch {}
  };

  const handleRemoveBg = () => setBgImage('');

  return (
    <div>
      <Text type="secondary" style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12, display: 'block' }}>
        外观与语言
      </Text>

      <SettingCard icon={<TranslationOutlined />} title="界面语言">
        <Select size="small" value={language} onChange={setLanguage} style={{ width: 120, borderRadius: 8 }}
          options={[{ label: '简体中文', value: 'zh-CN' }, { label: 'English', value: 'en-US' }]} />
      </SettingCard>

      <SettingCard icon={<BgColorsOutlined />} title="主题模式">
        <Select size="small" value={theme} onChange={setTheme} style={{ width: 120, borderRadius: 8 }}
          options={[{ label: '跟随系统', value: 'system' }, { label: '浅色', value: 'light' }, { label: '深色', value: 'dark' }]} />
      </SettingCard>

      <SettingCard icon={<FontSizeOutlined />} title={`字体大小: ${fontSize}px`}>
        <div style={{ width: 140 }}><Slider min={12} max={20} value={fontSize} onChange={setFontSize} tooltip={{ formatter: (v) => `${v}px` }} /></div>
      </SettingCard>

      {/* 自定义背景 */}
      <Card size="small" className="settings-card"
        style={{ marginBottom: 12, borderRadius: 14, border: '1px solid rgba(0,0,0,0.06)', background: 'rgba(255,255,255,0.45)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)' }}
        styles={{ body: { padding: '16px 20px' } }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 38, height: 38, borderRadius: 12, background: 'linear-gradient(135deg, rgba(22,119,255,0.1), rgba(114,46,209,0.1))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1677ff', fontSize: 18 }}>
              <PictureOutlined />
            </div>
            <div>
              <Text strong style={{ fontSize: 14 }}>自定义背景</Text>
              <div><Text type="secondary" style={{ fontSize: 11 }}>上传图片作为聊天背景</Text></div>
            </div>
          </div>
          <Space size={4}>
            {bgImage && (
              <Button size="small" danger icon={<DeleteOutlined />} onClick={handleRemoveBg} style={{ borderRadius: 8 }}>清除</Button>
            )}
            <Button size="small" icon={<PictureOutlined />} onClick={handleUploadBg} style={{ borderRadius: 8 }}>选择图片</Button>
          </Space>
        </div>
        {/* 预览 */}
        {bgImage && (
          <div style={{ marginTop: 12 }}>
            <Image src={bgImage} width="100%" height={80} style={{ borderRadius: 10, objectFit: 'cover', opacity: bgOpacity }} preview={{ mask: <span><EyeOutlined /> 预览</span> }} />
            <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: 11, color: '#999' }}>透明度:</Text>
              <Slider min={0.05} max={0.8} step={0.05} value={bgOpacity} onChange={setBgOpacity}
                style={{ flex: 1 }} tooltip={{ formatter: (v) => `${Math.round((v as number) * 100)}%` }} />
            </div>
          </div>
        )}
      </Card>

      <Text type="secondary" style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12, marginTop: 8, display: 'block' }}>
        交互
      </Text>

      <SettingCard icon={<SendOutlined />} title="发送方式" description="选择用哪个键发送消息">
        <Switch checked={sendWithEnter} onChange={setSendWithEnter}
          checkedChildren={<span style={{ fontSize: 11 }}>Enter</span>}
          unCheckedChildren={<span style={{ fontSize: 11 }}>Ctrl+Enter</span>} style={{ minWidth: 80 }} />
      </SettingCard>

      <SettingCard icon={<RocketOutlined />} title="开机自启" description="启动系统时自动运行小小榆">
        <Switch checked={autoLaunch} onChange={setAutoLaunch}
          checkedChildren={<span style={{ fontSize: 11 }}>开</span>} unCheckedChildren={<span style={{ fontSize: 11 }}>关</span>} />
      </SettingCard>
    </div>
  );
}
