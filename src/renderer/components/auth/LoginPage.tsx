// 登录/注册页面 — 深海鱼主题 · 高级质感 · 大厂风格
// 认证方式：QQ 邮箱 + 密码登录 / QQ 邮箱 + 邮箱验证码注册 / 邮箱验证码重置密码
import api from '../../../api';
import type { AuthResult } from '../../../api/transport';
import React, { useState, useEffect, useRef } from 'react';
import { Button, Input, Card, Typography, message, Space, Tabs, Checkbox, Select, Tooltip, Modal, Progress, Tag, Alert } from 'antd';
import {
  MailOutlined, LockOutlined, SafetyCertificateOutlined,
  MinusOutlined, BorderOutlined, CloseOutlined,
  TranslationOutlined, FontSizeOutlined,
} from '@ant-design/icons';
import { useSettingsStore } from '../../stores/settings-store';

const { Title, Text } = Typography;
const isElectron = !!(window as any).electronAPI;
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform || '');
const isMobile = window.innerWidth < 768;

/** QQ 邮箱：QQ 号 5-11 位、不以 0 开头（与后端 shared/email-code.ts 保持一致） */
const QQ_EMAIL_RE = /^[1-9]\d{4,10}@qq\.com$/i;
const isQQEmail = (v: string) => QQ_EMAIL_RE.test((v || '').trim());
/** 登录账号：QQ 邮箱或历史用户名（如初始管理员 admin） */
const isValidLoginAccount = (v: string) => {
  const t = (v || '').trim();
  if (!t) return false;
  return t.includes('@') ? isQQEmail(t) : /^[a-zA-Z0-9_-]{3,32}$/.test(t);
};

interface LoginPageProps {
  onLogin: (user: { id: number; username: string; role: string }) => void;
}

// 记住登录态 — 只存储认证 token 而非密码明文
function getRemembered(): { username: string; password: string } | null {
  try {
    const raw = sessionStorage.getItem('remembered_login');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}
function saveRemembered(username: string, password: string): void {
  // 仅当前会话缓存，不持久化密码到磁盘
  sessionStorage.setItem('remembered_login', JSON.stringify({ username, password }));
}
function clearRemembered(): void { sessionStorage.removeItem('remembered_login'); }

// ============ 深海气泡粒子 ============
function BubbleParticles() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const resize = () => { canvas.width = canvas.parentElement!.clientWidth; canvas.height = canvas.parentElement!.clientHeight; };
    resize(); window.addEventListener('resize', resize);
    const bubbles: Array<{x:number;y:number;r:number;vx:number;vy:number;alpha:number;speed:number}> = [];
    for (let i = 0; i < 30; i++) {
      bubbles.push({ x: Math.random() * canvas.width, y: Math.random() * canvas.height, r: Math.random() * 3 + 1,
        vx: (Math.random() - 0.5) * 0.3, vy: -(Math.random() * 0.4 + 0.1), alpha: Math.random() * 0.25 + 0.04, speed: Math.random() * 0.5 + 0.1 });
    }
    let animId: number;
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const b of bubbles) {
        b.x += b.vx; b.y += b.vy * b.speed;
        if (b.y < -10) { b.y = canvas.height + 10; b.x = Math.random() * canvas.width; }
        if (b.x < -10) b.x = canvas.width + 10; if (b.x > canvas.width + 10) b.x = -10;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${b.alpha})`; ctx.fill();
      }
      animId = requestAnimationFrame(animate);
    };
    animate();
    return () => { cancelAnimationFrame(animId); window.removeEventListener('resize', resize); };
  }, []);
  return <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0 }} />;
}

// ============ 游动的鱼装饰 ============
function SwimmingFish() {
  const fishRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = fishRef.current; if (!el) return;
    let x = Math.random() * 200, y = Math.random() * 300;
    let vx = 0.3 + Math.random() * 0.5, vy = 0.15 + Math.random() * 0.3;
    const maxX = 280, maxY = 380;
    const move = () => {
      x += vx; y += vy;
      if (x > maxX || x < 0) { vx = -vx; el.style.transform = `scaleX(${vx > 0 ? 1 : -1})`; }
      if (y > maxY || y < 0) vy = -vy;
      el.style.left = x + 'px'; el.style.top = y + 'px';
    };
    const interval = setInterval(move, 40); move();
    return () => clearInterval(interval);
  }, []);
  return <div ref={fishRef} style={{ position: 'absolute', fontSize: 48, opacity: 0.12, zIndex: 0, pointerEvents: 'none' }}>🐟</div>;
}

// ============ 窗口控制按钮 ============
function WinBtn({ icon, color, hoverColor, onClick, title }: {
  icon: React.ReactNode; color: string; hoverColor: string; onClick: () => void; title: string;
}) {
  const [hovered, setHovered] = React.useState(false);
  return (
    <Tooltip title={title}>
      <div onClick={onClick} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
        style={{ width: 28, height: 28, borderRadius: 9, cursor: 'pointer', display: 'flex', alignItems: 'center',
          justifyContent: 'center', background: hovered ? hoverColor : 'transparent',
          color: hovered ? '#fff' : color, transition: 'all 0.2s', fontSize: 13 }}>{icon}</div>
    </Tooltip>
  );
}

// ============ 主组件 ============
export function LoginPage({ onLogin }: LoginPageProps) {
  const [mode, setMode] = useState<'login' | 'register' | 'reset'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [code, setCode] = useState('');
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [smtpConfigured, setSmtpConfigured] = useState<boolean | null>(null);
  /** 首账号引导：还没有任何账号时，首个注册免验证码并自动成为管理员 */
  const [firstAccount, setFirstAccount] = useState(false);

  const { language, fontSize, setLanguage, setFontSize, loadSettings } = useSettingsStore();

  useEffect(() => { loadSettings().catch(() => {}); }, [loadSettings]);
  useEffect(() => {
    const saved = getRemembered();
    if (saved) { setEmail(saved.username); setPassword(saved.password); setRemember(true); }
  }, []);

  // 发件邮箱是否已配置：没配就发不出验证码，提前提示而不是等报错
  useEffect(() => {
    api.getSmtpStatus?.()
      .then(s => setSmtpConfigured(!!s?.configured))
      .catch(() => setSmtpConfigured(null));
  }, []);

  // 是否处于「首账号引导」状态
  useEffect(() => {
    api.getRegistrationMode?.()
      .then(m => setFirstAccount(!!m?.firstAccount))
      .catch(() => {});
  }, []);

  // 60 秒重发倒计时
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => setCountdown(c => (c <= 1 ? 0 : c - 1)), 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  // ====== Ollama 本地模型弹窗（登录页 + 聊天页双监听） ======
  const [ollamaModal, setOllamaModal] = useState(false);
  const [ollamaMini, setOllamaMini] = useState(false);
  const [ollamaStage, setOllamaStage] = useState('');
  const [ollamaMsg, setOllamaMsg] = useState('');
  const [ollamaPct, setOllamaPct] = useState(0);
  const [ollamaDone, setOllamaDone] = useState(false);
  const stageRef = useRef({ done: false });

  useEffect(() => {
    if (!isElectron) return;
    const api = (window as any).electronAPI;
    if (!api) return;

    const sHandler = (s: any) => {
      if (stageRef.current.done) return;
      if (s.modelReady) {
        stageRef.current.done = true;
        setOllamaDone(true); setOllamaPct(100);
        setOllamaMsg('本地 AI 已就绪');
        setOllamaModal(true);
        setTimeout(() => { setOllamaModal(false); setOllamaMini(false); }, 2500);
      } else if (s.installed) {
        setOllamaModal(true); setOllamaStage('init');
        setOllamaMsg('正在准备 AI 模型...');
      }
    };
    const pHandler = (p: any) => {
      if (stageRef.current.done) return;
      setOllamaModal(true); setOllamaMini(false);
      setOllamaStage(p.stage || ''); setOllamaMsg(p.message || '');
      if (typeof p.percent === 'number') setOllamaPct(p.percent);
    };

    api.onOllamaStatus?.(sHandler);
    api.onOllamaProgress?.(pHandler);

    // 主动查询（含 inProgress 后台状态）
    api.checkOllamaStatus?.().then((s: any) => {
      if (!s || stageRef.current.done) return;
      if (s.modelReady) {
        stageRef.current.done = true;
        setOllamaDone(true); setOllamaPct(100); setOllamaMsg('本地 AI 已就绪');
        setOllamaModal(true);
        setTimeout(() => { setOllamaModal(false); setOllamaMini(false); }, 2500);
      } else if (s.inProgress) {
        // 后台正在执行 → 直接显示弹窗
        setOllamaModal(true);
        setOllamaStage(s.stage || '');
        setOllamaMsg(s.message || '');
        setOllamaPct(s.percent || 0);
      } else if (s.installed) {
        setOllamaModal(true); setOllamaStage('init');
        setOllamaMsg(s.running ? 'Ollama 已启动，正在下载模型...' : 'Ollama 已安装');
      }
    }).catch(() => {});

    return () => {
      api.offOllamaStatus?.(sHandler);
      api.offOllamaProgress?.(pHandler);
    };
  }, []);

  const switchMode = (next: 'login' | 'register' | 'reset') => {
    setMode(next);
    setCode('');
    setConfirmPassword('');
  };

  /** 发送邮箱验证码（注册 / 重置密码共用） */
  const handleSendCode = async () => {
    const addr = email.trim();
    if (!isQQEmail(addr)) {
      message.warning('请输入正确的 QQ 邮箱（例如 123456789@qq.com）');
      return;
    }
    setSending(true);
    try {
      const res = await api.sendVerificationCode(addr, mode === 'reset' ? 'reset' : 'register');
      if (res?.ok) {
        message.success(res.message || '验证码已发送，请查收 QQ 邮箱');
        setCountdown(60);
      } else {
        message.error(res?.error || '验证码发送失败');
        if (res?.code === 'SMTP_NOT_CONFIGURED') setSmtpConfigured(false);
      }
    } catch {
      message.error('验证码发送失败，请稍后再试');
    } finally {
      setSending(false);
    }
  };

  const handleSubmit = async () => {
    const addr = email.trim();
    if (!addr || !password.trim()) { message.warning('请填写账号和密码'); return; }
    if (!isValidLoginAccount(addr)) { message.warning('账号格式不正确（QQ 邮箱或用户名）'); return; }

    if (mode !== 'login') {
      if (password.length < 6) { message.warning('密码至少 6 位'); return; }
      if (password !== confirmPassword) { message.warning('两次输入的密码不一致'); return; }
      if ((mode === 'reset' || !firstAccount) && !code.trim()) { message.warning('请输入邮箱验证码'); return; }
    }

    setLoading(true);
    try {
      const res: AuthResult = mode === 'login'
        ? await api.authLogin({ username: addr, password })
        : mode === 'register'
          ? await api.authRegister({ username: addr, password, code: firstAccount && !code.trim() ? undefined : code.trim() })
          : await api.resetPassword({ email: addr, code: code.trim(), newPassword: password });

      if (!res?.ok) {
        message.error(res?.error || '操作失败');
        return;
      }

      // 重置密码：不登录，回到登录页
      if (mode === 'reset') {
        message.success(res.message || '密码已重置，请使用新密码登录');
        setCode('');
        setPassword('');
        setConfirmPassword('');
        setMode('login');
        return;
      }

      const user = res.user;
      if (!user) { message.error('服务端未返回用户信息'); return; }

      if (remember) saveRemembered(addr, password); else clearRemembered();
      // 保留本地 token，兼容旧版本读取逻辑。
      if (res.token) localStorage.setItem('auth_token', res.token);
      localStorage.setItem('auth_user', JSON.stringify(user));
      if (isElectron) localStorage.setItem('desktop_user', JSON.stringify(user));

      message.success(mode === 'login' ? '🐟 欢迎回来！' : '🐟 注册成功！');
      setTimeout(() => onLogin(user), 400);
    } catch {
      message.error('连接服务器失败，请检查网络后重试');
    } finally {
      setLoading(false);
    }
  };

  const isDark = document.body.classList.contains('dark-theme');

  // 输入框通用样式
  const inputStyle: React.CSSProperties = {
    height: 46, fontSize: 15, borderRadius: 14,
    background: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(10,37,64,0.03)',
    borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(10,37,64,0.1)',
  };

  return (
    <div style={{
      position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100vh', width: '100vw', overflow: 'auto',
      flexDirection: isMobile ? 'column' : 'row',
      gap: isMobile ? 16 : 0,
      minHeight: '-webkit-fill-available',
      background: isDark
        ? 'linear-gradient(160deg, #0a1628 0%, #0d2137 25%, #0c1d3b 50%, #0a2540 75%, #091c35 100%)'
        : 'linear-gradient(160deg, #e8f4f8 0%, #d4ecf4 20%, #c5e3f0 40%, #b8dff0 60%, #d0eaf8 80%, #eaf6fb 100%)',
    }}>
      {/* 装饰 */}
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle, rgba(22,119,255,0.05) 1px, transparent 1px)', backgroundSize: '40px 40px', zIndex: 0 }} />
      <BubbleParticles />
      <SwimmingFish />
      <div style={{ position: 'absolute', right: 60, top: 80, fontSize: 36, opacity: 0.08, zIndex: 0, pointerEvents: 'none' }}>🐠</div>
      <div style={{ position: 'absolute', left: 80, bottom: 120, fontSize: 28, opacity: 0.06, zIndex: 0, pointerEvents: 'none' }}>🐡</div>

      {/* 桌面端标题栏 — Mac 使用原生 traffic lights，不显示自定义按钮 */}
      {isElectron && !isMac && (
        <div className="titlebar-drag" style={{
          position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
          height: 38, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 10px 0 16px',
        }}>
          <Text style={{ fontSize: 12, color: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(10,37,64,0.3)' }}>小小榆 v3.0.0</Text>
          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }} className="titlebar-no-drag">
            <WinBtn icon={<MinusOutlined />} color={isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.35)'}
              hoverColor="#f5a623" onClick={() => api.minimizeWindow()} title="最小化" />
            <WinBtn icon={<BorderOutlined />} color={isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.35)'}
              hoverColor="#52c41a" onClick={() => api.maximizeWindow()} title="最大化/还原" />
            <WinBtn icon={<CloseOutlined />} color={isDark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.35)'}
              hoverColor="#ff4d4f" onClick={() => api.closeWindow()} title="关闭窗口" />
          </div>
        </div>
      )}

      {/* 登录页左侧品牌区，手机端隐藏 */}
      {!isElectron && !isMobile && (
        <div style={{ position: 'relative', zIndex: 2, width: 420, padding: '0 60px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
            <img src="./logo-56.png" alt="小小榆" style={{ width: 52, height: 52, borderRadius: 16, objectFit: 'cover', boxShadow: '0 8px 32px rgba(22,119,255,0.25)' }} />
            <div>
              <Title level={2} style={{ margin: 0, color: isDark ? '#e8f4f8' : '#0a2540', fontWeight: 800, letterSpacing: 2 }}>小小榆</Title>
              <Text style={{ color: isDark ? 'rgba(255,255,255,0.45)' : 'rgba(10,37,64,0.5)', fontSize: 14 }}>深海 · AI 智能助手</Text>
            </div>
          </div>
          <div style={{ padding: '32px 0', borderTop: '1px solid ' + (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(10,37,64,0.08)'), borderBottom: '1px solid ' + (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(10,37,64,0.08)'), marginBottom: 28 }}>
            {[
              { emoji: '🌊', title: '多模型支持', desc: 'DeepSeek · Ollama · Anthropic · Gemini' },
              { emoji: '🐟', title: '本地优先', desc: '数据安全存储，隐私无忧' },
              { emoji: '💎', title: '极速响应', desc: '流式输出，即问即答' },
            ].map((item, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: i < 2 ? 20 : 0 }}>
                <span style={{ fontSize: 22, flexShrink: 0, marginTop: 2 }}>{item.emoji}</span>
                <div>
                  <Text strong style={{ color: isDark ? '#e8f4f8' : '#0a2540', fontSize: 14 }}>{item.title}</Text><br />
                  <Text style={{ color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(10,37,64,0.45)', fontSize: 13 }}>{item.desc}</Text>
                </div>
              </div>
            ))}
          </div>
          <Text style={{ color: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(10,37,64,0.3)', fontSize: 11 }}>© 2025 小小榆 v3.0.0 · 如鱼得水，智在必得</Text>
        </div>
      )}

      {/* 登录卡片 */}
      <Card style={{
        position: 'relative', zIndex: 2, width: isMobile ? '92vw' : 420, borderRadius: 24, maxWidth: 420,
        border: '1px solid ' + (isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.6)'),
        background: isDark ? 'rgba(15,30,55,0.7)' : 'rgba(255,255,255,0.65)',
        backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        boxShadow: isDark ? '0 20px 60px rgba(0,0,0,0.4)' : '0 20px 60px rgba(10,37,64,0.1)',
        textAlign: 'center',
      }} styles={{ body: { padding: isMobile ? '18px 16px' : '28px 32px' } }}>
        {/* Logo 区域 */}
        {isElectron && (
          <div style={{ marginBottom: 18, marginTop: 8 }}>
            <img src="./logo-56.png" alt="小小榆" style={{ width: 56, height: 56, borderRadius: 18, objectFit: 'cover', boxShadow: '0 8px 32px rgba(22,119,255,0.2)', marginBottom: 10 }} />
            <Title level={3} style={{ margin: 0, fontWeight: 800, background: 'linear-gradient(135deg, #1677ff 0%, #0ea5e9 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', letterSpacing: 3 }}>小小榆</Title>
            <Text style={{ color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(10,37,64,0.4)', fontSize: 13 }}>深海 · AI 桌面助手</Text>
          </div>
        )}
        {!isElectron && (
          <div style={{ marginBottom: 20 }}>
            <Title level={4} style={{ margin: 0, color: isDark ? '#e8f4f8' : '#0a2540', fontWeight: 700 }}>
              {mode === 'login' ? '欢迎回来' : mode === 'register' ? '创建账号' : '重置密码'}
            </Title>
            <Text style={{ color: isDark ? 'rgba(255,255,255,0.4)' : 'rgba(10,37,64,0.4)', fontSize: 13 }}>
              {mode === 'login' ? '潜入深蓝，继续你的探索'
                : mode === 'register' ? '用 QQ 邮箱注册，加入我们探索 AI 的无限可能'
                  : '验证码将发送到你的 QQ 邮箱'}
            </Text>
          </div>
        )}

        {/* 登录 / 注册 切换（重置密码模式隐藏） */}
        {mode === 'reset' ? (
          <div style={{ marginBottom: 18 }} />
        ) : (
          <Tabs activeKey={mode} onChange={(k) => switchMode(k as 'login' | 'register')}
            centered size="small"
            items={[{ key: 'login', label: '登录' }, { key: 'register', label: '注册' }]}
            style={{ marginBottom: 20 }}
            tabBarStyle={{ borderBottom: '1px solid ' + (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(10,37,64,0.06)') }} />
        )}

        {/* 服务端未配置发件邮箱时，注册/重置走不通，提前告知 */}
        {mode !== 'login' && smtpConfigured === false && (
          <Alert
            type="warning" showIcon style={{ marginBottom: 14, borderRadius: 12, textAlign: 'left' }}
            message="发件邮箱未配置"
            description="当前服务端还没有配置 QQ 邮箱 SMTP，暂时无法发送验证码。请先配置 smtp_user / smtp_pass。"
          />
        )}

        <Space direction="vertical" style={{ width: '100%' }} size={14}>
          {/* QQ 邮箱 */}
          <Input
            prefix={<MailOutlined style={{ color: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(10,37,64,0.3)' }} />}
            placeholder="QQ 邮箱或用户名"
            value={email}
            onChange={e => setEmail(e.target.value)}
            size="large"
            style={inputStyle}
            allowClear
            autoComplete="username"
          />

          {/* 密码 / 新密码 */}
          <Input.Password
            prefix={<LockOutlined style={{ color: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(10,37,64,0.3)' }} />}
            placeholder={mode === 'login' ? '密码' : '密码（至少 6 位）'}
            value={password}
            onChange={e => setPassword(e.target.value)}
            onPressEnter={mode === 'login' ? handleSubmit : undefined}
            size="large"
            style={inputStyle}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          />

          {/* 确认密码 — 注册 / 重置 */}
          {mode !== 'login' && (
            <Input.Password
              prefix={<LockOutlined style={{ color: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(10,37,64,0.3)' }} />}
              placeholder="确认密码"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              size="large"
              style={inputStyle}
              autoComplete="new-password"
            />
          )}

          {/* 首账号引导提示 */}
          {mode === 'register' && firstAccount && (
            <Alert
              type="info" showIcon style={{ marginBottom: 14, borderRadius: 12, textAlign: 'left' }}
              message="首次使用 · 初始化管理员账号"
              description="检测到还没有任何账号：现在注册的账号将自动成为管理员，无需邮箱验证码。"
            />
          )}

          {/* 邮箱验证码 — 注册（非首账号）/ 重置 */}
          {(mode === 'reset' || (mode === 'register' && !firstAccount)) && (
            <div style={{ display: 'flex', gap: 10 }}>
              <Input
                prefix={<SafetyCertificateOutlined style={{ color: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(10,37,64,0.3)' }} />}
                placeholder="邮箱验证码（6 位数字）"
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                onPressEnter={handleSubmit}
                size="large"
                style={{ ...inputStyle, flex: 1 }}
                maxLength={6}
              />
              <Button size="large" onClick={handleSendCode} loading={sending} disabled={countdown > 0}
                style={{
                  borderRadius: 14, height: 46, flexShrink: 0, minWidth: 116, fontSize: 13, fontWeight: 500,
                  background: countdown > 0 ? undefined : (isDark ? 'rgba(22,119,255,0.14)' : 'rgba(22,119,255,0.08)'),
                  borderColor: isDark ? 'rgba(22,119,255,0.35)' : 'rgba(22,119,255,0.25)',
                  color: countdown > 0 ? undefined : '#1677ff',
                }}>
                {countdown > 0 ? `${countdown} 秒后重发` : (sending ? '发送中' : '获取验证码')}
              </Button>
            </div>
          )}

          {/* 记住密码 / 忘记密码 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Checkbox checked={remember} onChange={e => setRemember(e.target.checked)}>
              <Text style={{ fontSize: 13, color: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(10,37,64,0.5)' }}>记住密码</Text>
            </Checkbox>
            {mode === 'reset' ? (
              <Text style={{ fontSize: 13, color: '#1677ff', cursor: 'pointer', fontWeight: 500 }} onClick={() => switchMode('login')}>返回登录</Text>
            ) : (
              <Text style={{ fontSize: 13, color: '#1677ff', cursor: 'pointer', fontWeight: 500 }} onClick={() => switchMode('reset')}>忘记密码？</Text>
            )}
          </div>

          {/* 主按钮 */}
          <Button type="primary" block size="large" loading={loading} onClick={handleSubmit}
            style={{
              borderRadius: 14, height: 48, fontSize: 16, fontWeight: 600, letterSpacing: 2,
              background: 'linear-gradient(135deg, #1677ff 0%, #0ea5e9 50%, #06b6d4 100%)', border: 'none',
              boxShadow: '0 6px 24px rgba(22,119,255,0.35)',
            }}>
            {mode === 'login' ? '🐟 潜入深蓝' : mode === 'register' ? '🐠 开始探索' : '🔑 重置密码'}
          </Button>

        </Space>

        {/* 语言 / 字体设置 */}
        <div style={{
          marginTop: 20, paddingTop: 16,
          borderTop: '1px solid ' + (isDark ? 'rgba(255,255,255,0.06)' : 'rgba(10,37,64,0.06)'),
          display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'center',
        }}>
          <TranslationOutlined style={{ color: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(10,37,64,0.3)', fontSize: 14 }} />
          <Select value={language} onChange={setLanguage} size="small" variant="borderless" popupMatchSelectWidth={false}
            style={{ minWidth: 70, fontSize: 12 }}
            options={[{ value: 'zh-CN', label: ' 中文' }, { value: 'en-US', label: ' English' }]} />
          <div style={{ width: 1, height: 14, background: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(10,37,64,0.1)', borderRadius: 1 }} />
          <FontSizeOutlined style={{ color: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(10,37,64,0.3)', fontSize: 14 }} />
          <Select value={fontSize} onChange={setFontSize} size="small" variant="borderless" popupMatchSelectWidth={false}
            style={{ minWidth: 60, fontSize: 12 }}
            options={[
              { value: 12, label: '小' }, { value: 14, label: '中' }, { value: 16, label: '大' }, { value: 18, label: '超大' },
            ]} />
        </div>

        {/* 底部 */}
        <div style={{ marginTop: 14 }}>
          <Text style={{ fontSize: 12, color: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(10,37,64,0.3)' }}>
            {!isElectron && mode !== 'reset' && (mode === 'login' ? '还没有账号？' : '已经有账号了？')}
          </Text>
          {!isElectron && mode !== 'reset' && (
            <Button type="link" size="small" style={{ fontSize: 12, fontWeight: 600, padding: '0 4px' }}
              onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}>
              {mode === 'login' ? '用 QQ 邮箱注册' : '去登录'}
            </Button>
          )}
          {isElectron && mode === 'login' && (
            <div style={{ marginTop: 4 }}>
              <Text style={{ fontSize: 11, color: isDark ? 'rgba(255,255,255,0.3)' : 'rgba(10,37,64,0.3)' }}>
                初始管理员账号：admin / admin123（登录后可在设置里配置邮箱服务并注册自己的账号）
              </Text>
            </div>
          )}
        </div>
      </Card>

      {/* ====== Ollama 弹窗登录页 ====== */}
      {isElectron && (
        <>
          <Modal title={<div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span style={{ fontSize: 22 }}>🐟</span><span style={{ fontWeight: 700 }}>正在准备本地 AI</span>{ollamaDone && <Tag color="success" style={{ marginLeft: 8 }}>就绪</Tag>}</div>} open={ollamaModal && !ollamaMini} onCancel={() => setOllamaMini(true)} closable={ollamaDone} maskClosable={false} keyboard={false} width={440}
            footer={ollamaDone ? [<Button key="ok" type="primary" onClick={() => { setOllamaModal(false); setOllamaMini(false); }} style={{ borderRadius: 10 }}>开始使用</Button>] : [<Button key="min" onClick={() => setOllamaMini(true)} style={{ borderRadius: 10 }}>📌 缩小到角落</Button>]} >
            <div style={{ textAlign: 'center', padding: '12px 0' }}>
              <Progress type="circle" percent={ollamaPct} size={110} strokeColor={{ '0%': '#52c41a', '50%': '#1677ff', '100%': '#722ed1' }} />
              <div style={{ marginTop: 14 }}><Text strong style={{ fontSize: 15 }}>{ollamaStage === 'downloading' ? '下载 Ollama' : ollamaStage === 'installing' ? '安装 Ollama' : ollamaStage === 'pulling' ? '下载 AI 模型' : '准备中'}</Text></div>
              <Text type="secondary" style={{ fontSize: 13, display: 'block', marginTop: 4 }}>{ollamaMsg}</Text>
              {!ollamaDone && <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 8 }}>💡 首次需下载约 1GB AI 模型，完成后可离线使用</Text>}
            </div>
          </Modal>
          {/* 缩小浮动条 */}
          {ollamaMini && !ollamaDone && (
            <div onClick={() => setOllamaMini(false)} style={{ position: 'fixed', bottom: 24, left: 24, zIndex: 3000, width: 250, padding: '12px 16px', borderRadius: 14, background: 'rgba(10,37,64,0.92)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.15)', boxShadow: '0 8px 32px rgba(0,0,0,0.3)', cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text style={{ color: '#fff', fontSize: 12, fontWeight: 600 }}>🐟 {ollamaStage === 'downloading' ? '下载Ollama' : ollamaStage === 'pulling' ? '下载AI模型' : '准备中'}</Text>
                <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>{ollamaPct}%</Text>
              </div>
              <Progress percent={ollamaPct} showInfo={false} size="small" strokeColor={{ '0%': '#52c41a', '50%': '#1677ff', '100%': '#722ed1' }} trailColor="rgba(255,255,255,0.1)" />
              <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 10, display: 'block', marginTop: 4 }}>{ollamaMsg}</Text>
            </div>
          )}
        </>
      )}
    </div>
  );
}
