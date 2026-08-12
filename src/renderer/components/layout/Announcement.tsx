// 发布公告组件 - 登录后弹出
import React, { useState, useEffect } from 'react';
import { Modal, Typography, Tag, Space, Timeline } from 'antd';
import { RocketOutlined, BugOutlined, StarFilled, LockOutlined, CloudServerOutlined } from '@ant-design/icons';

const { Title, Text, Paragraph } = Typography;

const CHANGELOG = [
  { version: 'v3.0.0 🐟', date: '2026-07-10', type: 'major', items: [
    { icon: <RocketOutlined style={{ color: '#52c41a' }} />, text: '  内置 Ollama 本地 AI — 安装即用，零配置！自动安装 Ollama + qwen2.5 模型，完全离线运行' },
    { icon: <LockOutlined style={{ color: '#722ed1' }} />, text: '免登录模式 — 本地 AI 无需注册、无需 API Key、无需网络，打开即聊' },
    { icon: <BugOutlined style={{ color: '#ff4d4f' }} />, text: '修复桌面端登录/注册失败 — users 表 must_change_pwd 列在 INSERT 之后添加导致异常' },
    { icon: <BugOutlined style={{ color: '#faad14' }} />, text: '安装包文件名改为英文 — 修复非中文Windows上无法运行的问题，异步加载 NSIS Unicode' },
  ]},
  { version: 'v2.0.2 (Hotfix)', date: '2026-07-10', type: 'major', items: [
    { icon: <BugOutlined style={{ color: '#ff4d4f' }} />, text: '紧急修复模型连接测试失败 — 加密密钥不一致导致每次重启后API Key全部损坏，现已修复并重新上线' },
    { icon: <CloudServerOutlined style={{ color: '#1677ff' }} />, text: '云服务器同步部署 — 代码+安装包完整同步至云服务器，Web端下载功能已恢复' },
    { icon: <BugOutlined style={{ color: '#faad14' }} />, text: '修复Web端下载安装包404 — 项目根路径计算错误，release目录无法被找到，已修正' },
  ]},
  { version: 'v2.0.2', date: '2026-07-10', type: 'major', items: [
    { icon: <LockOutlined style={{ color: '#722ed1' }} />, text: '  安全大升级 — 修复18个严重漏洞：PBKDF2密码哈希、加密密钥随机化、路径穿越防护、登录速率限制、SSE数据完整、跨账号隔离、工具调用修复' },
    { icon: <BugOutlined style={{ color: '#ff4d4f' }} />, text: '修复6个核心Bug — secretKey保存、禁用Provider误删Key、双Checkbox、流式状态、验证码复用、密码存储安全' },
    { icon: <CloudServerOutlined style={{ color: '#1677ff' }} />, text: '后端加固 — CORS白名单、安全响应头、API速率限制、请求超时保护、ERNIE竞态修复' },
    { icon: <RocketOutlined style={{ color: '#52c41a' }} />, text: '暗色主题全面优化 — 60+条CSS覆盖规则，所有组件在暗色模式下的文字、按钮、表单、表格完美显示' },
  ]},
  { version: 'v2.0.1', date: '2026-07-10', type: 'major', items: [
    { icon: <StarFilled style={{ color: '#faad14' }} />, text: '  全新品牌升级 — 深海鱼主题，高级质感 UI，全新登录页设计' },
    { icon: <CloudServerOutlined style={{ color: '#1677ff' }} />, text: '安全升级 — 桌面版每次启动均需登录，支持退出登录' },
    { icon: <RocketOutlined style={{ color: '#52c41a' }} />, text: 'Web 端双栏布局 — 左侧品牌展示 + 右侧登录表单，大厂风格' },
    { icon: <BugOutlined style={{ color: '#ff4d4f' }} />, text: '修复多处细节 — 气泡粒子动画、游鱼装饰、玻璃拟态效果' },
  ]},
  { version: 'v2.0.0', date: '2026-07-09', type: 'major', items: [
    { icon: <LockOutlined style={{ color: '#722ed1' }} />, text: '全新多用户登录注册系统 — 每人独立账号，数据完全隔离' },
    { icon: <CloudServerOutlined style={{ color: '#1677ff' }} />, text: 'Web 服务器部署 — 局域网/公网均可访问，手机平板全支持' },
    { icon: <StarFilled style={{ color: '#faad14' }} />, text: '桌面版同步升级 — 应用内同样需登录，安全性全面提升' },
  ]},
  { version: 'v1.5.0', date: '2026-07-09', type: 'feature', items: [
    { icon: <RocketOutlined style={{ color: '#52c41a' }} />, text: '性能大优化 — 流式响应不卡死，数据库批量写入，React.memo 防重渲染' },
    { icon: <BugOutlined style={{ color: '#ff4d4f' }} />, text: '修复窗口无法打开/卡死问题 — 单实例锁机制重写，幽灵锁自动清理' },
    { icon: <RocketOutlined style={{ color: '#1677ff' }} />, text: 'Web 端代码分割 + Gzip 压缩 — 首屏加载体积减少 70%' },
    { icon: <CloudServerOutlined style={{ color: '#1677ff' }} />, text: '内建下载桌面版 + 导入桌面配置 — Web 页面一键操作' },
  ]},
  { version: 'v1.4.0', date: '2026-07-08', type: 'feature', items: [
    { icon: <StarFilled style={{ color: '#52c41a' }} />, text: '支持 9 大模型提供商 — Claude / OpenAI / DeepSeek / Gemini / GLM / 通义千问 / Kimi / 文心一言 / Ollama' },
    { icon: <RocketOutlined style={{ color: '#722ed1' }} />, text: '技能系统 — 28+ 内置技能，聊天框输入指令即可安装' },
    { icon: <StarFilled style={{ color: '#faad14' }} />, text: 'Windows 安装包 + 自动更新 + 系统托盘 + 全局快捷键' },
  ]},
];

export function Announcement() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // 检查是否已看过
    const seen = localStorage.getItem('announcement_v3_0_1');
    if (!seen) {
      setVisible(true);
    }
  }, []);

  const handleClose = () => {
    localStorage.setItem('announcement_v3_0_1', '1');
    setVisible(false);
  };

  return (
    <Modal
      open={visible}
      onCancel={handleClose}
      width={600}
      centered
      closable
      title={null}
      footer={
        <div style={{ textAlign: 'center' }}>
          <button
            onClick={handleClose}
            style={{
              padding: '10px 48px', borderRadius: 12, border: 'none', cursor: 'pointer',
              background: 'linear-gradient(135deg, #1677ff, #4096ff)', color: '#fff',
              fontSize: 15, fontWeight: 600, letterSpacing: 1,
              boxShadow: '0 4px 16px rgba(22,119,255,0.3)',
            }}
          >
            我知道了
          </button>
        </div>
      }
    >
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{
          width: 56, height: 56, borderRadius: 16, margin: '0 auto 12px',
          background: 'linear-gradient(135deg, #1677ff, #722ed1, #f5222d)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 8px 24px rgba(22,119,255,0.2)',
        }}>
          <RocketOutlined style={{ color: '#fff', fontSize: 28 }} />
        </div>
        <Title level={3} style={{ margin: 0 }}>小小榆 更新日志</Title>
        <Text type="secondary">重大版本升级，请仔细阅读以下内容</Text>
      </div>

      {CHANGELOG.map((release) => (
        <div key={release.version} style={{ marginBottom: 20 }}>
          <Space style={{ marginBottom: 6 }}>
            <Text strong style={{ fontSize: 16 }}>{release.version}</Text>
            <Tag color={release.type === 'major' ? 'red' : 'blue'}>
              {release.type === 'major' ? '重大更新' : '功能更新'}
            </Tag>
            <Text type="secondary" style={{ fontSize: 12 }}>{release.date}</Text>
          </Space>

          <Timeline
            items={release.items.map((item, i) => ({
              dot: item.icon,
              children: <Text style={{ fontSize: 13 }}>{item.text}</Text>,
              key: i,
            }))}
          />
        </div>
      ))}

      <div style={{ textAlign: 'center', marginTop: 8 }}>
        <Text type="secondary" style={{ fontSize: 11 }}>
          桌面版下载和 Web 访问地址请查看首页
        </Text>
      </div>
    </Modal>
  );
}
