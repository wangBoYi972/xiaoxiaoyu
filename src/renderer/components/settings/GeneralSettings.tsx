import api from '../../../api';
import React, { useEffect, useRef, useState } from 'react';
import { Select, Slider, Switch, Typography, Card, Space, Button, Image, Input, message } from 'antd';
import {
  TranslationOutlined, BgColorsOutlined, FontSizeOutlined,
  SendOutlined, RocketOutlined, PictureOutlined, DeleteOutlined, EyeOutlined,
  UserOutlined, MailOutlined, SafetyOutlined,
} from '@ant-design/icons';
import { useSettingsStore } from '../../stores/settings-store';
import { useAuthStore } from '../../stores/auth-store';
import { isAdminAccount } from '../../../shared/admin-config';

const { Text } = Typography;

/** 大图降采样 + 转 JPEG：背景图只做视觉装饰，画质损失可接受 */
function compressImage(dataUrl: string, maxEdge = 1920, quality = 0.82): Promise<string> {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      } catch {
        resolve(dataUrl); // 画布失败（如跨域污染）就退回原图
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

interface SettingCardProps {
  icon: React.ReactNode; title: string; description?: string; children: React.ReactNode;
}

function SettingCard({ icon, title, description, children }: SettingCardProps) {
  return (
    <Card size="small" className="glass-card"
      style={{ marginBottom: 12 }}
      styles={{ body: { padding: '16px 20px' } }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="glass-card-icon">
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
  const authUser = useAuthStore(s => s.user);
  // 邮件服务是系统级配置：仅管理员可见可改（role=admin 或白名单邮箱）
  const isAdmin = !!authUser && (authUser.role === 'admin' || isAdminAccount(authUser.username));
  const [smtpStatus, setSmtpStatus] = useState<{ configured: boolean; smtpUser?: string } | null>(null);
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPass, setSmtpPass] = useState('');
  const [savingSmtp, setSavingSmtp] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    api.getSmtpStatus?.().then((s) => {
      setSmtpStatus(s);
      setSmtpUser(s?.smtpUser || '');
    }).catch(() => {});
  }, [isAdmin]);

  const saveSmtp = async () => {
    const addr = smtpUser.trim();
    if (!/^[1-9]\d{4,10}@qq\.com$/i.test(addr)) { message.warning('请输入正确的 QQ 邮箱'); return; }
    if (!smtpPass.trim()) { message.warning('请输入 SMTP 授权码（不是 QQ 密码）'); return; }
    setSavingSmtp(true);
    try {
      const r = await api.setSmtpConfig({ user: addr, pass: smtpPass.trim() });
      if (r.ok) {
        message.success('邮件服务已配置，验证码可以正常发送了');
        setSmtpPass('');
        const s = await api.getSmtpStatus();
        setSmtpStatus(s);
      } else {
        message.error(r.error || '保存失败');
      }
    } catch {
      message.error('保存失败');
    } finally {
      setSavingSmtp(false);
    }
  };
  const { theme, language, fontSize, autoLaunch, sendWithEnter, bgImage, bgOpacity,
    setTheme, setLanguage, setFontSize, setAutoLaunch, setSendWithEnter, setBgImage, setBgOpacity } = useSettingsStore();

  const handleUploadBg = async () => {
    const files = await api.openFileDialog({ filters: [{ name: '图片', extensions: ['png','jpg','jpeg','webp','bmp'] }] });
    if (!files.length) return;
    try {
      const fd = await api.readFile(files[0]);
      if (fd.mimeType.startsWith('image/')) {
        const base64 = `data:${fd.mimeType};base64,${fd.data}`;
        // 大图先压缩（localStorage 存不下原图，5MB 配额很容易爆）
        if (base64.length > 1.5 * 1024 * 1024) {
          const compressed = await compressImage(base64);
          setBgImage(compressed || base64);
        } else {
          setBgImage(base64);
        }
      }
    } catch {}
  };

  const handleRemoveBg = () => setBgImage('');

  return (
    <div>
      {isAdmin && (
      <>
      <Text type="secondary" style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12, display: 'block' }}>
        邮件服务（注册 / 找回密码的发件邮箱 · 仅管理员可见）
      </Text>

      <Card size="small" className="glass-card" style={{ marginBottom: 12 }} styles={{ body: { padding: '16px 20px' } }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="glass-card-icon"><MailOutlined /></div>
            <div>
              <Text strong style={{ fontSize: 14 }}>SMTP 发件配置</Text>
              <div>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  {smtpStatus?.configured ? `已配置：${smtpStatus.smtpUser || ''}` : '未配置 —— 注册 / 找回密码的验证码无法发送'}
                </Text>
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
          <Input
            placeholder="发件 QQ 邮箱（如 123456789@qq.com）"
            value={smtpUser}
            onChange={(e) => setSmtpUser(e.target.value)}
            size="large"
          />
          <Input.Password
            placeholder="SMTP 授权码（16 位，不是 QQ 密码）"
            value={smtpPass}
            onChange={(e) => setSmtpPass(e.target.value)}
            size="large"
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <Text type="secondary" style={{ fontSize: 11, lineHeight: 1.7 }}>
            获取授权码：QQ 邮箱网页版 → 设置 → 账号 → 开启「IMAP/SMTP 服务」→ 生成授权码
          </Text>
          <Button type="primary" size="small" loading={savingSmtp} onClick={saveSmtp}>保存配置</Button>
        </div>
      </Card>
      </>
      )}

      <Text type="secondary" style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12, display: 'block' }}>
        账号
      </Text>

      <SettingCard
        icon={<UserOutlined />}
        title={authUser ? authUser.username : '未登录（游客模式）'}
        description={authUser ? '已登录，数据保存在本机' : '登录后可在多端同步使用，数据仍保存在本机'}
      >
        {authUser ? (
          <Button size="small" danger onClick={() => useAuthStore.getState().logout()}>退出登录</Button>
        ) : (
          <Button size="small" type="primary" onClick={() => useAuthStore.getState().openLogin()}>登录账号</Button>
        )}
      </SettingCard>

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
      <Card size="small" className="glass-card"
        style={{ marginBottom: 12 }}
        styles={{ body: { padding: '16px 20px' } }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="glass-card-icon">
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
              <Text style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>透明度:</Text>
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
