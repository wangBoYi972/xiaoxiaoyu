import api from '../../../api';
import React, { useState, useEffect } from 'react';

const isWeb = !(window as any).electronAPI;
import { Typography, Card, Row, Col, Tag, Button, Space, message, Spin, Empty, Badge } from 'antd';
import {
  RobotOutlined, ThunderboltOutlined, PictureOutlined, CloudServerOutlined,
  FireOutlined, StarFilled, BulbOutlined, AppstoreOutlined,
  DownloadOutlined, CloudDownloadOutlined, ReloadOutlined, CheckCircleFilled,
  LaptopOutlined,
} from '@ant-design/icons';
import { useModelStore } from '../../stores/model-store';
import { useSettingsStore } from '../../stores/settings-store';
import { InputArea } from './InputArea';

const { Title, Text, Paragraph } = Typography;

interface SkillItem {
  id: string; name: string; description: string; icon: string;
  category: string; systemPrompt: string; temperature?: number; version?: string; author?: string; downloadUrl?: string;
}

const GREETINGS = ['你好！有什么可以帮你的？','今天想聊点什么？','小小榆随时为你效劳','选一个模型，开始探索吧'];

export function WelcomeView() {
  const { providers, ollamaReady, activeProviderId, setActiveProvider } = useModelStore();
  const { toggleSettings } = useSettingsStore();

  // 检测手机屏幕
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const enabledCount = providers.filter(p => p.enabled && p.hasApiKey).length;
  const colSpan = isMobile ? 24 : 8;       // 免费卡片：1列/3列
  const skillColSpan = isMobile ? 12 : 6;   // 技能：2列/4列
  const dColSpan = isMobile ? 24 : 8;       // 下载卡片：1列/3列
  const modelColSpan = isMobile ? 8 : 4;    // 模型按钮：3列/6列
  const [greeting, setGreeting] = useState(GREETINGS[0]);
  const [allSkills, setAllSkills] = useState<SkillItem[]>([]);
  const [remoteSkills, setRemoteSkills] = useState<SkillItem[]>([]);
  const [showAllSkills, setShowAllSkills] = useState(false);
  const [loadingRemote, setLoadingRemote] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setGreeting(GREETINGS[Math.floor(Math.random() * GREETINGS.length)]), 8000);
    return () => clearInterval(t);
  }, []);

  // 加载本地技能
  useEffect(() => {
    api.listSkills().then((list: SkillItem[]) => setAllSkills(list || [])).catch(() => {});
  }, []);

  // 加载远程技能
  const loadRemoteSkills = async () => {
    setLoadingRemote(true);
    try {
      const result = await api.remoteSkillCatalog();
      if (result.success && result.skills) {
        setRemoteSkills(result.skills);
        if (result.skills.length > 0) message.success(`发现 ${result.skills.length} 个可下载技能`);
      } else {
        message.info(result.error || '暂无可下载技能');
      }
    } catch { message.error('获取技能市场失败'); }
    setLoadingRemote(false);
  };

  useEffect(() => { loadRemoteSkills(); }, []);

  const handleInstall = async (skill: SkillItem) => {
    try {
      const result = await api.installSkill({ skill });
      if (result.success) {
        message.success(`「${skill.name}」已安装`);
        setAllSkills((prev) => [...prev, skill]);
        setRemoteSkills((prev) => prev.filter((s) => s.id !== skill.id));
      } else {
        message.error(result.error || '安装失败');
      }
    } catch { message.error('安装失败'); }
  };

  const installedIds = new Set(allSkills.map((s) => s.id));
  const displaySkills = showAllSkills ? allSkills : allSkills.slice(0, 8);

  const freeCards = [
    { id: 'ollama', icon: <CloudServerOutlined style={{ fontSize: 28 }} />, label: 'Ollama 本地', tag: '免费 · 本地运行', bgColor: 'linear-gradient(135deg, #f6ffed, #d9f7be)', iconColor: '#52c41a', ready: ollamaReady },
    { id: 'glm', icon: <FireOutlined style={{ fontSize: 28 }} />, label: '智谱 GLM', tag: 'GLM-4-Flash 免费', bgColor: 'linear-gradient(135deg, #e6f4ff, #bae0ff)', iconColor: '#1677ff', ready: providers.find((p: any) => p.id === 'glm')?.hasApiKey },
    { id: 'gemini', icon: <StarFilled style={{ fontSize: 28 }} />, label: 'Gemini', tag: '免费额度可用', bgColor: 'linear-gradient(135deg, #f9f0ff, #d3adf7)', iconColor: '#722ed1', ready: providers.find((p: any) => p.id === 'gemini')?.hasApiKey },
  ];

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: isMobile ? '16px 10px 0' : '36px 24px 0', overflow: 'auto' }}>
      {/* ===== 问候语区 ===== */}
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{ width: 64, height: 64, margin: '0 auto 14px', borderRadius: 20,
          overflow: 'hidden',
          boxShadow: '0 8px 28px rgba(22,119,255,0.22)' }}>
          <img src="./logo.png" alt="小小榆" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
        <Title level={2} style={{ margin: 0, fontWeight: 700, fontSize: 22,
          background: 'linear-gradient(135deg, #1677ff, #0ea5e9), linear-gradient(135deg, #1677ff, #0ea5e9)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          backgroundClip: 'text' }}>小小榆</Title>
        <Text key={greeting} type="secondary" style={{ fontSize: 14, opacity: 0.6, display: 'inline-block', animation: 'fadeInUp 0.5s ease-out' }}>{greeting}</Text>
      </div>

      {/* ===== 无 API Key 提示 ===== */}
      {enabledCount === 0 && (
        <Card style={{ maxWidth: 740, width: '100%', marginBottom: 18, borderRadius: 14, background: 'rgba(22,119,255,0.04)', border: '1px solid rgba(22,119,255,0.15)' }}
          styles={{ body: { padding: '14px 18px' } }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <Text strong style={{ fontSize: 14 }}>  尚未配置模型</Text>
              <br />
              <Text type="secondary" style={{ fontSize: 12 }}>请先配置至少一个模型的 API Key 才能开始对话</Text>
            </div>
            <Button type="primary" size="small" onClick={toggleSettings} style={{ borderRadius: 10 }}>
              去配置
            </Button>
          </div>
        </Card>
      )}

      {/* ===== 技能市场 ===== */}
      <div style={{ maxWidth: 740, width: '100%', marginBottom: 20 }}>
        {/* 已安装技能 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <Text strong style={{ fontSize: 14 }}>
            <img src="./logo.png" alt="" style={{ width: 16, height: 16, borderRadius: 4, objectFit: 'cover', marginRight: 6, verticalAlign: 'middle' }} />已安装技能
            <Text type="secondary" style={{ fontSize: 11, marginLeft: 6, fontWeight: 400 }}>{allSkills.length}个</Text>
          </Text>
          <Space size={6}>
            <Text type="secondary" style={{ fontSize: 11 }}>聊天框输入「技能列表」查看 | 「安装技能 名字」安装</Text>
          </Space>
        </div>
        {allSkills.length === 0 ? (
          <Empty description="暂无技能" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <Row gutter={[8, 8]}>
            {displaySkills.map((skill) => (
              <Col span={skillColSpan} key={skill.id}>
                <Card size="small" hoverable className="glass-card"
                  style={{ borderRadius: 14, textAlign: 'center', border: '1px solid rgba(255,255,255,0.3)' }}
                  styles={{ body: { padding: '14px 8px' } }}>
                  <div style={{ fontSize: 26, marginBottom: 4 }}>{skill.icon}</div>
                  <Text strong style={{ fontSize: 11, display: 'block', marginBottom: 2 }}>{skill.name}</Text>
                  <Text type="secondary" style={{ fontSize: 10, display: 'block', lineHeight: 1.2 }} ellipsis={{ rows: 2 }}>
                    {skill.description}
                  </Text>
                </Card>
              </Col>
            ))}
          </Row>
        )}
        {allSkills.length > 8 && (
          <Button type="link" size="small" onClick={() => setShowAllSkills(!showAllSkills)} style={{ marginTop: 4, fontSize: 11 }}>
            {showAllSkills ? '收起' : `查看全部 ${allSkills.length} 个技能`}
          </Button>
        )}

        {/* 远程技能市场 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 18, marginBottom: 10 }}>
          <Text strong style={{ fontSize: 14 }}>
            <CloudDownloadOutlined style={{ color: '#722ed1', marginRight: 6 }} />技能市场
            <Badge count={remoteSkills.length} size="small" style={{ backgroundColor: '#722ed1', marginLeft: 4 }} />
          </Text>
          <Button size="small" icon={<ReloadOutlined />} onClick={loadRemoteSkills} loading={loadingRemote}
            style={{ borderRadius: 8, fontSize: 11 }}>刷新</Button>
        </div>
        {loadingRemote ? (
          <div style={{ textAlign: 'center', padding: 20 }}><Spin /><br /><Text type="secondary" style={{ fontSize: 11 }}>正在获取技能市场...</Text></div>
        ) : remoteSkills.length === 0 ? (
          <Card size="small" style={{ borderRadius: 14, textAlign: 'center', background: 'rgba(0,0,0,0.02)' }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {allSkills.length >= 8 ? '技能已全部安装！🎉' : '暂无可下载技能，点击刷新检查更新'}
            </Text>
          </Card>
        ) : (
          <Row gutter={[8, 8]}>
            {remoteSkills.slice(0, 8).map((skill) => (
              <Col span={skillColSpan} key={skill.id}>
                <Card size="small" hoverable className="glass-card"
                  style={{ borderRadius: 14, textAlign: 'center', border: '1px dashed rgba(114,46,209,0.25)', background: 'rgba(114,46,209,0.02)' }}
                  styles={{ body: { padding: '14px 8px' } }}>
                  <div style={{ fontSize: 26, marginBottom: 4 }}>{skill.icon}</div>
                  <Text strong style={{ fontSize: 11, display: 'block', marginBottom: 2 }}>{skill.name}</Text>
                  <Text type="secondary" style={{ fontSize: 10, display: 'block', marginBottom: 10, lineHeight: 1.2 }} ellipsis={{ rows: 1 }}>
                    {skill.description}
                  </Text>
                  {skill.author && <Text type="secondary" style={{ fontSize: 9 }}>@{skill.author}</Text>}
                  <Button size="small" icon={<DownloadOutlined />}
                    onClick={(e) => { e.stopPropagation(); handleInstall(skill); }}
                    style={{ borderRadius: 8, fontSize: 11, height: 28, width: '100%', marginTop: 6,
                      background: 'linear-gradient(135deg, #722ed1, #b37feb)', color: '#fff', border: 'none', fontWeight: 500 }}>
                    安装
                  </Button>
                </Card>
              </Col>
            ))}
          </Row>
        )}
      </div>

      {/* ===== 模型选择 ===== */}
      <div style={{ maxWidth: 740, width: '100%', marginBottom: 18 }}>
        <Text style={{ fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: 1.2, color: 'rgba(0,0,0,0.35)', display: 'block', marginBottom: 8 }}>快速开始</Text>
        <Row gutter={[10, 10]}>
          {freeCards.map((card) => {
            const isActive = activeProviderId === card.id;
            return (
                            <Col span={colSpan} key={card.id}>
                <Card size="small" hoverable onClick={() => {
                  if (!card.ready) { message.info('请先点击右上角设置 → 模型服务 → 配置 API Key'); toggleSettings(); } else setActiveProvider(card.id);
                }} className="glass-card"
                  style={{ borderRadius: 14, textAlign: 'center', cursor: 'pointer', overflow: 'hidden',
                    border: isActive ? '2px solid #1677ff' : '1px solid rgba(255,255,255,0.4)',
                    transform: isActive ? 'translateY(-2px)' : 'none', transition: 'all 0.3s ease' }}
                  styles={{ body: { padding: '16px 10px' } }}>
                  <div style={{ width: 44, height: 44, borderRadius: 12, background: card.bgColor, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 8px', color: card.iconColor }}>{card.icon}</div>
                  <Text strong style={{ fontSize: 12, display: 'block' }}>{card.label}</Text>
                  <Tag color={card.ready ? 'green' : 'orange'} style={{ borderRadius: 6, fontSize: 10, marginTop: 4 }}>{card.ready ? '已就绪' : '免费可用'}</Tag>
                  {isActive && <div style={{ position:'absolute', top:0, left:0, right:0, height:2, background:'linear-gradient(90deg, #1677ff, #722ed1)' }} />}
                </Card>
              </Col>
            );
          })}
        </Row>
        <Row gutter={[5, 5]} style={{ marginTop: 6 }}>
          {['deepseek','openai','qwen','anthropic','moonshot','ernie'].map((id) => {
            const p = providers.find((x: any) => x.id === id);
            return (
              <Col span={modelColSpan} key={id}>
                <Button block size="small" type={activeProviderId === id ? 'primary' : 'default'}
                  onClick={() => setActiveProvider(id)}
                  style={{ borderRadius: 10, height: 32, fontSize: 10, fontWeight: activeProviderId === id ? 600 : 400, opacity: p?.hasApiKey ? 1 : 0.45 }}>
                  {p?.name || id.charAt(0).toUpperCase() + id.slice(1)}
                </Button>
              </Col>
            );
          })}
        </Row>
      </div>

      {!ollamaReady && activeProviderId === 'ollama' && (
        <Card style={{ maxWidth: 740, width: '100%', marginBottom: 14, borderRadius: 12, background: 'rgba(255,241,184,0.2)', border: '1px solid rgba(250,173,20,0.12)' }}
          styles={{ body: { padding: '10px 14px' } }}>
          <Text>  Ollama 未检测到</Text>
          <Text type="secondary" style={{ fontSize: 11, marginLeft: 8 }}>
            请先 <a href="https://ollama.com">安装</a>，运行 <Text code style={{ fontSize: 10 }}>ollama pull qwen2.5:7b</Text>
            ，或切换到智谱GLM/Gemini免费模型
          </Text>
        </Card>
      )}

      {/* ===== Web 端：桌面版下载（Win + Mac）+ 配置导入 ===== */}
      {isWeb && (
        <div style={{ maxWidth: 740, width: '100%', marginBottom: 14 }}>
          <Row gutter={[10, 10]}>
            <Col span={dColSpan}>
              <Card size="small" hoverable className="glass-card"
                style={{ borderRadius: 14, border: '1px solid rgba(22,119,255,0.18)', background: 'linear-gradient(135deg, rgba(22,119,255,0.06), rgba(64,150,255,0.02))' }}
                styles={{ body: { padding: '14px 14px' } }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 10, background: 'linear-gradient(135deg, #1677ff, #4096ff)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ color: '#fff', fontSize: 15, fontWeight: 700 }}>⊞</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Text strong style={{ fontSize: 12 }}>Windows</Text>
                    <Text type="secondary" style={{ fontSize: 10, display: 'block' }}>Win10/11 · 471MB (含本地AI)</Text>
                  </div>
                  <Button type="primary" size="small"
                    onClick={() => window.open('/api/download?platform=win', '_blank')}
                    style={{ borderRadius: 10, fontSize: 11, height: 28 }}>下载</Button>
                </div>
              </Card>
            </Col>
            <Col span={dColSpan}>
              <Card size="small" hoverable className="glass-card"
                style={{ borderRadius: 14, border: '1px solid rgba(0,0,0,0.10)', background: 'linear-gradient(135deg, rgba(0,0,0,0.03), rgba(255,255,255,0.5))' }}
                styles={{ body: { padding: '14px 14px' } }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 10, background: 'linear-gradient(135deg, #333, #666)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ color: '#fff', fontSize: 15, fontWeight: 700 }}></span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Text strong style={{ fontSize: 12 }}>macOS</Text>
                    <Text type="secondary" style={{ fontSize: 10, display: 'block' }}>macOS 13+ · 源码包</Text>
                  </div>
                  <Button size="small"
                    onClick={() => window.open('/api/download?platform=mac', '_blank')}
                    style={{ borderRadius: 10, fontSize: 11, height: 28 }}>下载</Button>
                </div>
              </Card>
            </Col>
            <Col span={dColSpan}>
              <Card size="small" hoverable className="glass-card"
                style={{ borderRadius: 14, border: '1px solid rgba(114,46,209,0.15)', background: 'linear-gradient(135deg, rgba(114,46,209,0.04), rgba(22,119,255,0.02))' }}
                styles={{ body: { padding: '14px 14px' } }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 10, background: 'linear-gradient(135deg, #722ed1, #b37feb)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <DownloadOutlined style={{ color: '#fff', fontSize: 14 }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Text strong style={{ fontSize: 12 }}>导入配置</Text>
                    <Text type="secondary" style={{ fontSize: 10, display: 'block' }}>同步桌面版 API Key</Text>
                  </div>
                  <Button size="small"
                    onClick={async () => {
                      try {
                        const res = await fetch('/api/import-desktop-config');
                        const data = await res.json();
                        if (data.success) {
                          message.success(`已导入 ${data.imported} 个配置` + (data.note ? `（${data.note}）` : ''));
                          window.location.reload();
                        } else { message.error(data.error || '导入失败'); }
                      } catch { message.error('导入失败'); }
                    }}
                    style={{ borderRadius: 10, fontSize: 11, height: 28 }}>导入</Button>
                </div>
              </Card>
            </Col>
          </Row>
        </div>
      )}

      <div style={{ width: '100%', maxWidth: 740 }}>
        <InputArea />
      </div>
    </div>
  );
}
