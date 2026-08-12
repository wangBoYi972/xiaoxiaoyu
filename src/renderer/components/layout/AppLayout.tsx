import api from '../../../api';
import React, { useState, useEffect } from 'react';
import { Layout, Modal, Button, Progress, Typography, Space, notification, Card, Empty, Badge, Tag } from 'antd';
import { CloudDownloadOutlined, BellOutlined, SoundOutlined, PushpinOutlined, BulbOutlined, RightOutlined } from '@ant-design/icons';
import { TitleBar } from './TitleBar';
import { Sidebar } from './Sidebar';
import { ChatView } from '../chat/ChatView';
import { WelcomeView } from '../chat/WelcomeView';
import { FinetuneView } from '../finetune/FinetuneView';
import { useChatStore } from '../../stores/chat-store';
import { SettingsDrawer } from '../settings/SettingsDrawer';
import { useSettingsStore } from '../../stores/settings-store';
import { Announcement } from './Announcement';

const { Sider, Content } = Layout;
const { Text, Paragraph, Title } = Typography;

interface AnnounceItem {
  id: string; title: string; content: string; level: 'info' | 'warning' | 'important'; time?: string;
}

const CHANGELOG: AnnounceItem[] = [
  { id:'v3.0.0-release', title:'  v3.0.0 离线AI大升级', level:'important', time:'v3.0.0',
    content:'  内置AI模型 · 安装即用\n\n  零下载体验\n• 安装包内置 qwen2.5:0.5b 模型（470MB）\n• 安装完 App 直接对话，无需联网下载\n• 模型导入失败时自动 fallback 网络下载\n\n  免登录游客模式\n• Ollama 就绪后可直接使用，无需注册\n• 登录页新增"免登录直接使用"入口\n\n  用户体验优化\n• Ollama 下载/导入显示实时进度条\n• 模型下载框可缩小到角落不阻塞操作\n• 启动时自动检测 Ollama 安装状态\n\n  Bug 修复\n• 修复 Ollama 模型列表为空导致对话报错\n• 修复旧版本锁文件残留问题\n• IPC 通信稳定性提升' },
  { id:'v2.0.2-security', title:'  v2.0.2 安全大升级', level:'important', time:'v2.0.2',
    content:'  18个H级漏洞 + 6个核心Bug全部修复\n\n  密码安全\n• PBKDF2-SHA256 10万轮迭代 + 随机盐\n• 加密密钥由固定盐改为随机持久化文件\n• 旧密码自动升级，兼容老版本\n\n  接口安全\n• JWT密钥/加密密钥不再可通过API泄露\n• 登录接口 5次/分钟速率限制\n• CORS白名单 + XSS/Frame安全头\n• 技能路由路径穿越防护\n\n  数据安全\n• 停止生成按用户隔离，A不能停B\n• 适配器缓存按ApiKey区分，跨账号不混用\n• 验证码一次性消耗，防重放\n\n  适配器修复\n• ERNIE OAuth竞态保护\n• OpenAI tool_calls增量合并\n• 120s请求超时\n• SSE流buffer残留数据不丢失\n\n  暗色主题\n• 全部60+组件暗色适配' },
  { id:'v2.0.1-release', title:'  小小榆 2.0.1 正式发布', level:'important', time:'v2.0.1',
    content:'  深海鱼主题 · 全新品牌升级\n\n  全新视觉设计\n• 深海渐变背景 + 气泡粒子动画 + 游鱼装饰\n• 玻璃拟态登录卡片，左侧品牌展示 + 右侧登录表单（Web 双栏布局）\n• 全新品牌 Logo，如鱼得水\n\n  安全升级\n• 桌面版每次启动均需登录验证\n• 新增退出登录功能，侧边栏一键退出\n• 记住密码加密存储\n\n  下载与更新\n• 桌面版安装包已更新至 v2.0.1\n• Web 端自动适配暗色/亮色模式' },
  { id:'v1.5-skills', title:'技能市场正式上线', level:'important', time:'v1.5',
    content:'🏪 技能市场\n\n直接在主页浏览和安装各种AI技能，28个技能覆盖编程、写作、创意、分析、生活等各个领域。\n\n📥 三种安装方式\n• 主页点击"安装"按钮\n• 聊天框输入"技能列表"查看全部\n• 输入"安装技能 XXX"一键安装\n\n🌐 远程仓库自动同步\n启动时自动拉取最新技能目录，社区技能持续更新。' },
  { id:'v1.5-winctrl', title:'窗口控制创意升级', level:'info', time:'v1.5',
    content:'🎨 窗口按钮重新设计\n\n• 最小化 — 悬停变为橙色\n• 最大化 — 悬停变为绿色\n• 关闭 — 悬停变为红色\n\n每个按钮独立圆角设计，悬停有微动画和颜色反馈，告别单调的灰色图标。' },
  { id:'v1.5-dark', title:'深色主题全面覆盖', level:'info', time:'v1.5',
    content:'🌙 暗色模式完美适配\n\n• 所有玻璃组件暗色重绘\n• 弹窗、下拉框、消息提示全部适配\n• 代码块、引用块、表格暗色优化\n• 滚动条暗色样式\n• 设置卡片暗色背景\n\n跟随系统自动切换或手动选择。' },
  { id:'v1.5-home', title:'首页全新设计', level:'info', time:'v1.5',
    content:'🏠 首页焕然一新\n\n• Logo渐变图标 + 品牌名\n• 轮换问候语\n• 功能亮点标签展示\n• 免费模型三卡片快速切换\n• 更多模型入口\n• Ollama未安装友好引导\n\n整体字号放大，间距优化，阅读更舒适。' },
  { id:'v1.5-chatbar', title:'对话信息栏', level:'info', time:'v1.5',
    content:'💬 聊天页面新增顶部信息栏\n\n• 显示当前对话标题\n• 显示正在使用的模型名称\n• 显示消息计数\n• 渐变色AI图标\n\n让对话更有上下文，不再迷失在消息中。' },
  { id:'v1.5-model', title:'默认免费模型优化', level:'info', time:'v1.5',
    content:'🆓 零配置免费使用\n\n• Ollama 自动检测，可用即启用\n• 智谱 GLM-4-Flash 完全免费\n• Gemini 免费额度\n\n无需填写任何 API Key 即可体验 AI 对话（需自行安装配置对应服务）。' },
];

export function AppLayout() {
  const { messages } = useChatStore();
  const { settingsOpen, toggleSettings, bgImage, bgOpacity } = useSettingsStore();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(window.innerWidth < 768);
  const [currentView, setCurrentView] = useState<'chat' | 'finetune'>('chat');
  const [updateModal, setUpdateModal] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<any>(null);
  const [updateProgress, setUpdateProgress] = useState<any>(null);
  const [updating, setUpdating] = useState(false);
  const [announceModal, setAnnounceModal] = useState(false);
  const [selectedAnnounce, setSelectedAnnounce] = useState<AnnounceItem | null>(null);
  const [announceList, setAnnounceList] = useState<AnnounceItem[]>(CHANGELOG);

  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  useEffect(() => {
    const onResize = () => {
      const m = window.innerWidth < 768;
      setIsMobile(m);
      if (m) setSidebarCollapsed(true);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // ============ Ollama 本地模型状态 ============
  const [ollamaModal, setOllamaModal] = useState(false);
  const [ollamaMinimized, setOllamaMinimized] = useState(false);
  const [ollamaStage, setOllamaStage] = useState<string>('');
  const [ollamaMsg, setOllamaMsg] = useState('');
  const [ollamaPercent, setOllamaPercent] = useState(0);
  const [ollamaDone, setOllamaDone] = useState(false);
  const ollamaDoneRef = React.useRef(false);

  // 监听 Ollama 初始化进度（来自 main 进程）
  useEffect(() => {
    if (!(window as any).electronAPI) return;
    const api = (window as any).electronAPI;

    const handleStatus = (s: any) => {
      if (ollamaDoneRef.current) return;
      if (s.modelReady) {
        ollamaDoneRef.current = true;
        setOllamaDone(true);
        setOllamaStage('pulling');
        setOllamaMsg('本地 AI 已就绪');
        setOllamaPercent(100);
        setOllamaModal(true);
        setTimeout(() => { setOllamaModal(false); setOllamaMinimized(false); }, 2500);
      } else if (s.installed && !s.modelReady) {
        setOllamaStage('pulling');
        setOllamaMsg('正在准备 AI 模型...');
        setOllamaPercent(s.running ? 5 : 0);
        setOllamaModal(true);
      }
    };

    const handleProgress = (p: any) => {
      if (ollamaDoneRef.current) return;
      setOllamaStage(p.stage || '');
      setOllamaMsg(p.message || '');
      if (typeof p.percent === 'number') setOllamaPercent(p.percent);
      setOllamaModal(true);
    };

    api.onOllamaStatus?.(handleStatus);
    api.onOllamaProgress?.(handleProgress);

    // 主动查询：登录时 Ollama 可能已开始下载
    api.checkOllamaStatus?.().then((s: any) => {
      if (!s || ollamaDoneRef.current) return;
      if (s.modelReady) {
        ollamaDoneRef.current = true;
        setOllamaDone(true);
        setOllamaMsg('本地 AI 已就绪');
        setOllamaPercent(100);
        setOllamaModal(true);
        setTimeout(() => { setOllamaModal(false); setOllamaMinimized(false); }, 2500);
      } else if (s.inProgress) {
        setOllamaModal(true);
        setOllamaStage(s.stage || '');
        setOllamaMsg(s.message || '');
        setOllamaPercent(s.percent || 0);
      } else if (s.installed) {
        setOllamaStage('starting');
        setOllamaMsg('正在准备 Ollama...');
        setOllamaPercent(s.running ? 10 : 0);
        setOllamaModal(true);
      }
    }).catch(() => {});

    return () => {
      api.offOllamaStatus?.(handleStatus);
      api.offOllamaProgress?.(handleProgress);
    };
  }, []);

  const ollamaStageName = (stage: string) => {
    switch (stage) {
      case 'downloading': return '下载 Ollama';
      case 'installing': return '安装 Ollama';
      case 'starting': return '启动服务';
      case 'importing': return '导入 AI 模型';
      case 'pulling': return '下载 AI 模型';
      default: return '准备中';
    }
  };

  useEffect(() => {
    const offA = api.onAnnouncement((ann: any) => {
      const exists = announceList.find((a) => a.id === ann.id);
      if (!exists) {
        const item: AnnounceItem = { id: ann.id, title: ann.title, content: ann.content, level: ann.level, time: '' };
        setAnnounceList((prev) => [item, ...prev]);
        setSelectedAnnounce(item);
        setAnnounceModal(true);
      }
    });
    const off1 = api.onUpdateAvailable((info) => { setUpdateInfo(info); setUpdateModal(true); });
    const off2 = api.onUpdateProgress((p) => { setUpdateProgress(p); if (p.stage === 'done') { setUpdateModal(false); setUpdating(false); } });
    const off3 = api.onUpdateError((err) => { notification.error({ message: '更新失败', description: err.message }); setUpdating(false); });
    return () => { offA(); off1(); off2(); off3(); };
  }, []);

  const handleShowAnnouncements = () => {
    setSelectedAnnounce(null);
    setAnnounceModal(true);
  };

  const handleAnnounceClose = () => {
    setAnnounceModal(false);
    setSelectedAnnounce(null);
  };

  const handleUpdate = async () => { if (!updateInfo?.downloadUrl) return; setUpdating(true); setUpdateProgress({ stage: 'downloading', percent: 0 }); try { await api.installUpdate(updateInfo.downloadUrl); } catch { setUpdating(false); } };

  const hasMessages = messages.length > 0;

  // 背景样式
  const bgStyle: React.CSSProperties = bgImage ? {
    backgroundImage: `url(${bgImage})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
    backgroundAttachment: 'fixed',
  } : {
    background: 'var(--bg-gradient)',
    backgroundSize: '400% 400%',
  };

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', ...bgStyle, animation: bgImage ? 'none' : 'gradientShift 20s ease infinite', position: 'relative' }}>
      {/* 半透明遮罩层（自定义背景时） */}
      {bgImage && (
        <div style={{ position: 'absolute', inset: 0, background: `rgba(255,255,255,${1 - bgOpacity})`, zIndex: 0, pointerEvents: 'none' }} />
      )}

      {!bgImage && <style>{`@keyframes gradientShift { 0% {background-position:0% 50%} 50% {background-position:100% 50%} 100% {background-position:0% 50%} }`}</style>}

      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
        <TitleBar onSettingsClick={toggleSettings} sidebarCollapsed={sidebarCollapsed} onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)} onAnnouncementClick={handleShowAnnouncements} />
        <Layout style={{ flex: 1, overflow: 'hidden', background: 'transparent', position: 'relative' }}>
          {/* 手机端：浮动侧边栏 */}
          {isMobile && !sidebarCollapsed && (
            <div
              style={{
                position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(0,0,0,0.35)',
              }}
              onClick={() => setSidebarCollapsed(true)}
            />
          )}
          {isMobile ? (
            !sidebarCollapsed && (
              <div style={{
                position: 'fixed', left: 0, top: 0, bottom: 0, zIndex: 1000,
                width: 280, maxWidth: '85vw',
                background: 'var(--glass-bg, rgba(255,255,255,0.95))',
                backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
                boxShadow: '4px 0 30px rgba(0,0,0,0.15)',
              }}>
                <Sidebar onCollapse={() => setSidebarCollapsed(true)} />
              </div>
            )
          ) : (
            <Sider width={260} collapsedWidth={0} collapsed={sidebarCollapsed} style={{ background: 'transparent' }} trigger={null}>
              <Sidebar onCollapse={() => setSidebarCollapsed(true)} />
            </Sider>
          )}
          <Content style={{ display: 'flex', flexDirection: 'column', background: 'transparent', width: isMobile ? '100%' : undefined }}>
            {currentView === 'finetune' ? <FinetuneView /> : (hasMessages ? <ChatView /> : <WelcomeView />)}
          </Content>
        </Layout>
        <SettingsDrawer open={settingsOpen} onClose={toggleSettings} onViewChange={setCurrentView} />

        {/* 发布公告（首次登录弹出） */}
        <Announcement />
      </div>

      {/* ====== 公告浏览弹窗 ====== */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <BellOutlined style={{ fontSize: 20, color: '#1677ff' }} />
            <span style={{ fontWeight: 700, fontSize: 17 }}>
              {selectedAnnounce ? selectedAnnounce.title : '更新公告'}
            </span>
            {!selectedAnnounce && <Badge count={announceList.length} style={{ backgroundColor: '#1677ff' }} />}
          </div>
        }
        open={announceModal}
        onCancel={handleAnnounceClose}
        width={selectedAnnounce ? 540 : 660}
        footer={selectedAnnounce
          ? [<Button key="back" onClick={() => setSelectedAnnounce(null)} style={{ borderRadius: 10 }}>← 返回列表</Button>,
             <Button key="ok" type="primary" onClick={handleAnnounceClose} style={{ borderRadius: 10 }}>我知道了</Button>]
          : [<Button key="close" type="primary" onClick={handleAnnounceClose} style={{ borderRadius: 10 }}>关闭</Button>]
        }
      >
        {selectedAnnounce ? (
          /* ====== 单个公告详情 ====== */
          <div style={{ padding: '8px 0' }}>
            <Space style={{ marginBottom: 16 }}>
              <Tag color={selectedAnnounce.level === 'important' ? 'red' : selectedAnnounce.level === 'warning' ? 'orange' : 'blue'}
                style={{ borderRadius: 8, fontSize: 12, padding: '2px 10px' }}>
                {selectedAnnounce.level === 'important' ? '  重要' : selectedAnnounce.level === 'warning' ? '⚠️ 提醒' : '  资讯'}
              </Tag>
              {selectedAnnounce.time && <Text type="secondary" style={{ fontSize: 12 }}>{selectedAnnounce.time}</Text>}
            </Space>
            <Paragraph style={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.9, color: 'rgba(0,0,0,0.75)' }}>
              {selectedAnnounce.content}
            </Paragraph>
          </div>
        ) : (
          /* ====== 公告卡片列表 ====== */
          <div style={{ maxHeight: 460, overflow: 'auto', padding: '4px 0' }}>
            <Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 14 }}>
              点击卡片查看详细内容。更新说明涵盖 v1.5 所有改动。
            </Paragraph>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
              {announceList.map((item) => {
                const colors: Record<string, { bg: string; border: string; icon: React.ReactNode }> = {
                  important: { bg: 'rgba(255,77,79,0.04)', border: 'rgba(255,77,79,0.2)', icon: <PushpinOutlined style={{ color: '#ff4d4f' }} /> },
                  warning: { bg: 'rgba(250,173,20,0.04)', border: 'rgba(250,173,20,0.2)', icon: <SoundOutlined style={{ color: '#faad14' }} /> },
                  info: { bg: 'rgba(22,119,255,0.03)', border: 'rgba(22,119,255,0.12)', icon: <BulbOutlined style={{ color: '#1677ff' }} /> },
                };
                const c = colors[item.level] || colors.info;
                return (
                  <Card key={item.id} size="small" hoverable
                    onClick={() => setSelectedAnnounce(item)}
                    style={{
                      borderRadius: 14, cursor: 'pointer',
                      background: c.bg, border: `1px solid ${c.border}`,
                      transition: 'all 0.2s ease',
                    }}
                    styles={{ body: { padding: '14px 16px' } }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      <div style={{ marginTop: 2, flexShrink: 0 }}>{c.icon}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Text strong style={{ fontSize: 14, display: 'block', marginBottom: 4 }}>{item.title}</Text>
                        <Text type="secondary" style={{ fontSize: 11, lineHeight: 1.5 }} ellipsis={{ rows: 2 }}>
                          {item.content.split('\n').filter((l: string) => !l.startsWith('•') && !l.startsWith('1.') && !l.startsWith('2.') && !l.startsWith('3.') && l.trim()).slice(0, 2).join(' ')}
                        </Text>
                        <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Tag color={item.level === 'important' ? 'red' : 'blue'} style={{ borderRadius: 6, fontSize: 10, padding: '0 6px' }}>
                            {item.level === 'important' ? '重要' : '更新'}
                          </Tag>
                          <RightOutlined style={{ fontSize: 10, color: 'rgba(0,0,0,0.25)' }} />
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
            {announceList.length === 0 && <Empty description="暂无公告" />}
          </div>
        )}
      </Modal>

      {/* 更新弹窗 */}
      <Modal title={<><CloudDownloadOutlined /> 发现新版本</>} open={updateModal} onCancel={() => setUpdateModal(false)}
        footer={updating ? null : [<Button key="cancel" onClick={() => setUpdateModal(false)}>稍后提醒</Button>, <Button key="update" type="primary" onClick={handleUpdate} icon={<CloudDownloadOutlined />}>立即更新</Button>]} closable={!updating}>
        {updateInfo && !updating && (
          <div>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Text>当前版本: <Text type="secondary">{updateInfo.currentVersion}</Text></Text>
              <Text>最新版本: <Text strong style={{ color: '#1677ff', fontSize: 16 }}>{updateInfo.version}</Text></Text>
              {updateInfo.releaseNotes && <Paragraph style={{ background: 'rgba(0,0,0,0.03)', padding: 12, borderRadius: 8, marginTop: 8, maxHeight: 200, overflow: 'auto', whiteSpace: 'pre-wrap', fontSize: 13 }}>{updateInfo.releaseNotes}</Paragraph>}
            </Space>
          </div>
        )}
        {updating && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <Progress type="circle" percent={updateProgress?.percent || 0} size={80} />
            <Paragraph style={{ marginTop: 12 }}>{updateProgress?.stage === 'downloading' ? '正在下载更新...' : updateProgress?.stage === 'extracting' ? '正在解压...' : updateProgress?.stage === 'installing' ? '正在安装...' : '更新中...'}</Paragraph>
          </div>
        )}
      </Modal>

      {/* ====== Ollama 本地AI 初始化弹窗 ====== */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 24 }}>🐟</span>
            <span style={{ fontWeight: 700, fontSize: 17 }}>正在准备本地 AI</span>
            {ollamaDone && <Tag color="success">已就绪</Tag>}
          </div>
        }
        open={ollamaModal && !ollamaMinimized}
        onCancel={() => setOllamaMinimized(true)}
        closable={ollamaDone}
        maskClosable={false}
        keyboard={false}
        width={460}
        footer={
          ollamaDone
            ? [<Button key="ok" type="primary" onClick={() => { setOllamaModal(false); setOllamaMinimized(false); }} style={{ borderRadius: 10 }}>开始使用</Button>]
            : [<Button key="min" onClick={() => setOllamaMinimized(true)} style={{ borderRadius: 10, fontSize: 12 }}>
                <span style={{ marginRight: 4 }}>📌</span>缩小到角落
              </Button>]
        }
      >
        <div style={{ textAlign: 'center', padding: '16px 0' }}>
          <Progress
            type="circle"
            percent={ollamaPercent}
            size={120}
            strokeColor={{
              '0%': '#52c41a',
              '50%': '#1677ff',
              '100%': '#722ed1',
            }}
          />
          <div style={{ marginTop: 16 }}>
            <Text style={{ fontSize: 15, fontWeight: 500, display: 'block' }}>
              {ollamaStageName(ollamaStage)}
            </Text>
            <Text type="secondary" style={{ fontSize: 13, display: 'block', marginTop: 4 }}>
              {ollamaMsg}
            </Text>
            {ollamaStage === 'pulling' && (
              <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 8 }}>
                💡 首次需下载约 400MB AI 模型，后续使用无需网络
              </Text>
            )}
            {ollamaStage === 'importing' && (
              <Text type="secondary" style={{ fontSize: 11, display: 'block', marginTop: 8 }}>
                💡 正在从安装包导入 AI 模型，秒级完成无需联网
              </Text>
            )}
          </div>
        </div>
      </Modal>

      {/* ====== Ollama 缩小进度条（左下角浮动） ====== */}
      {ollamaMinimized && ollamaModal && !ollamaDone && (
        <div
          onClick={() => setOllamaMinimized(false)}
          style={{
            position: 'fixed', bottom: 24, left: 24, zIndex: 2000,
            width: 260, padding: '14px 18px',
            borderRadius: 16,
            background: 'rgba(10,37,64,0.92)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255,255,255,0.15)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
            cursor: 'pointer',
            transition: 'all 0.3s ease',
          }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 18 }}>🐟</span>
              <Text style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>
                {ollamaStageName(ollamaStage)}
              </Text>
            </div>
            <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>{ollamaPercent}%</Text>
          </div>
          <Progress
            percent={ollamaPercent}
            showInfo={false}
            size="small"
            strokeColor={{
              '0%': '#52c41a',
              '50%': '#1677ff',
              '100%': '#722ed1',
            }}
            trailColor="rgba(255,255,255,0.1)"
          />
          <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, display: 'block', marginTop: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {ollamaMsg}
          </Text>
        </div>
      )}
    </div>
  );
}
