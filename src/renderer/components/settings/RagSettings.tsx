// 知识库 / RAG 设置：嵌入后端、切块参数、索引管理、检索测试
import React, { useEffect, useState } from 'react';
import {
  Button, Card, Divider, Input, Select, Slider, Space, Switch, Tag, Typography, Progress, message,
} from 'antd';
import {
  DatabaseOutlined, ReloadOutlined, DeleteOutlined, SearchOutlined,
  CloudDownloadOutlined, ExperimentOutlined,
} from '@ant-design/icons';
import { useRagStore } from '../../stores/rag-store';
import { useWorkspaceStore } from '../../stores/workspace-store';

const { Text, Paragraph } = Typography;

const BACKEND_OPTIONS = [
  { value: 'auto', label: '自动（Ollama → 兼容端点 → 本地哈希）' },
  { value: 'ollama', label: 'Ollama 本地模型' },
  { value: 'openai', label: 'OpenAI 兼容端点（中转 / 网关 / vLLM）' },
  { value: 'local', label: '本地哈希向量（离线，无需模型）' },
];

export function RagSettings() {
  const workspace = useWorkspaceStore((s) => s.workspace);
  const {
    available, status, progress, busy, config, backendLabel,
    ollamaModels, hits, lastQuery,
    init, buildIndex, cancel, clear, search, updateConfig, probe, pullModel,
  } = useRagStore();

  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<any>(null);

  useEffect(() => {
    if (workspace?.path) init(workspace.path);
  }, [workspace?.path, init]);

  useEffect(() => {
    if (config) setDraft(config);
  }, [config]);

  if (!available) {
    return (
      <div style={{ padding: '32px 8px', textAlign: 'center' }}>
        <DatabaseOutlined style={{ fontSize: 32, color: 'var(--text-tertiary)' }} />
        <Paragraph style={{ marginTop: 12, color: 'var(--text-tertiary)', fontSize: 12 }}>
          向量检索需要桌面端主进程支持，浏览器预览模式下不可用。
        </Paragraph>
      </div>
    );
  }

  const cfg = draft || config;
  if (!cfg) return <div style={{ padding: 24 }}>加载中…</div>;

  const patch = async (p: Record<string, unknown>) => {
    const next = { ...cfg, ...p };
    setDraft(next);
    await updateConfig(p);
  };

  const percent = progress && progress.total > 0
    ? Math.min(100, Math.round((progress.done / progress.total) * 100))
    : busy ? 100 : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* 索引状态 */}
      <Card size="small" className="glass-card" title={<Space><DatabaseOutlined />代码库索引</Space>}>
        <Space direction="vertical" style={{ width: '100%' }} size={10}>
          <Space wrap size={8}>
            <Tag color={status.chunks > 0 ? 'green' : 'default'}>
              {status.chunks > 0 ? `${status.chunks} 个向量块` : '未建立索引'}
            </Tag>
            <Tag>{status.files} 个文件</Tag>
            {status.model && <Tag color="blue">{status.model}</Tag>}
            {backendLabel && <Tag color="purple">当前后端：{backendLabel}</Tag>}
          </Space>

          <Text style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
            {workspace?.path ? workspace.path : '未打开工作区，无法索引'}
          </Text>

          {(busy || (progress && progress.phase !== 'done')) && (
            <div>
              <Progress
                percent={percent}
                status={progress?.phase === 'error' ? 'exception' : progress?.phase === 'done' ? 'success' : 'active'}
                size="small"
              />
              <Text style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                {progress?.message || ''}
                {progress?.current ? ` · ${progress.current}` : ''}
              </Text>
            </div>
          )}

          <Space wrap>
            <Button
              size="small" type="primary" icon={<ReloadOutlined />}
              disabled={!workspace?.path || busy}
              onClick={() => buildIndex(false)}
            >
              {status.chunks > 0 ? '更新索引' : '建立索引'}
            </Button>
            <Button size="small" disabled={!workspace?.path || busy} onClick={() => buildIndex(true)}>
              强制重建
            </Button>
            {busy ? (
              <Button size="small" danger onClick={cancel}>取消</Button>
            ) : (
              <Button size="small" icon={<DeleteOutlined />} disabled={!workspace?.path} onClick={async () => {
                await clear();
                message.success('索引已清除');
              }}>清除</Button>
            )}
          </Space>
        </Space>
      </Card>

      {/* 嵌入后端 */}
      <Card size="small" className="glass-card" title={<Space><ExperimentOutlined />嵌入后端</Space>}>
        <Space direction="vertical" style={{ width: '100%' }} size={10}>
          <div>
            <Text style={{ fontSize: 12 }}>选择方式</Text>
            <Select
              size="small" style={{ width: '100%', marginTop: 4 }}
              value={cfg.backend}
              options={BACKEND_OPTIONS}
              onChange={(v) => patch({ backend: v })}
            />
          </div>

          {(cfg.backend === 'auto' || cfg.backend === 'ollama') && (
            <>
              <div>
                <Text style={{ fontSize: 12 }}>Ollama 地址</Text>
                <Input
                  size="small" style={{ marginTop: 4 }} value={cfg.ollamaUrl || ''}
                  placeholder="http://127.0.0.1:11434"
                  onChange={(e) => setDraft({ ...cfg, ollamaUrl: e.target.value })}
                  onBlur={(e) => patch({ ollamaUrl: e.target.value })}
                />
              </div>
              <div>
                <Text style={{ fontSize: 12 }}>Embedding 模型</Text>
                <Input
                  size="small" style={{ marginTop: 4 }} value={cfg.ollamaModel || ''}
                  placeholder="nomic-embed-text"
                  onChange={(e) => setDraft({ ...cfg, ollamaModel: e.target.value })}
                  onBlur={(e) => patch({ ollamaModel: e.target.value })}
                />
                {ollamaModels.length > 0 && (
                  <div style={{ marginTop: 6 }}>
                    <Text style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>本机已装：</Text>
                    <Space size={4} wrap style={{ marginTop: 4 }}>
                      {ollamaModels.slice(0, 12).map((m) => (
                        <Tag
                          key={m} style={{ cursor: 'pointer', fontSize: 10 }}
                          color={m === cfg.ollamaModel ? 'blue' : 'default'}
                          onClick={() => patch({ ollamaModel: m })}
                        >{m}</Tag>
                      ))}
                    </Space>
                  </div>
                )}
                <Button
                  size="small" icon={<CloudDownloadOutlined />} style={{ marginTop: 8 }}
                  loading={busy && progress?.phase === 'pull'}
                  onClick={async () => {
                    await pullModel(cfg.ollamaModel);
                    message.info('模型拉取完成，可重新建立索引');
                  }}
                >
                  拉取模型（{cfg.ollamaModel || 'nomic-embed-text'}）
                </Button>
              </div>
            </>
          )}

          {(cfg.backend === 'auto' || cfg.backend === 'openai') && (
            <>
              <Divider style={{ margin: '4px 0' }} />
              <div>
                <Text style={{ fontSize: 12 }}>兼容端点 Base URL</Text>
                <Input
                  size="small" style={{ marginTop: 4 }} value={cfg.endpoint || ''}
                  placeholder="https://api.openai.com/v1"
                  onChange={(e) => setDraft({ ...cfg, endpoint: e.target.value })}
                  onBlur={(e) => patch({ endpoint: e.target.value })}
                />
              </div>
              <div>
                <Text style={{ fontSize: 12 }}>API Key</Text>
                <Input.Password
                  size="small" style={{ marginTop: 4 }} value={cfg.apiKey || ''}
                  placeholder="sk-..."
                  onChange={(e) => setDraft({ ...cfg, apiKey: e.target.value })}
                  onBlur={(e) => patch({ apiKey: e.target.value })}
                />
              </div>
              <div>
                <Text style={{ fontSize: 12 }}>Embedding 模型 ID</Text>
                <Input
                  size="small" style={{ marginTop: 4 }} value={cfg.model || ''}
                  placeholder="text-embedding-3-small"
                  onChange={(e) => setDraft({ ...cfg, model: e.target.value })}
                  onBlur={(e) => patch({ model: e.target.value })}
                />
              </div>
            </>
          )}

          <Button size="small" onClick={() => probe()}>重新检测后端</Button>
        </Space>
      </Card>

      {/* 检索参数 */}
      <Card size="small" className="glass-card" title="检索参数">
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <div>
            <Text style={{ fontSize: 12 }}>块大小：{cfg.chunkSize} 字符</Text>
            <Slider
              min={300} max={3000} step={100} value={cfg.chunkSize}
              onChange={(v) => setDraft({ ...cfg, chunkSize: v as number })}
              onChangeComplete={(v) => patch({ chunkSize: v as number })}
            />
          </div>
          <div>
            <Text style={{ fontSize: 12 }}>块重叠：{cfg.chunkOverlap} 字符</Text>
            <Slider
              min={0} max={600} step={50} value={cfg.chunkOverlap}
              onChange={(v) => setDraft({ ...cfg, chunkOverlap: v as number })}
              onChangeComplete={(v) => patch({ chunkOverlap: v as number })}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: 12 }}>对话时自动检索并注入上下文</Text>
            <Switch size="small" checked={cfg.autoInject} onChange={(v) => patch({ autoInject: v })} />
          </div>
          <div>
            <Text style={{ fontSize: 12 }}>注入片段数：{cfg.topK}</Text>
            <Slider
              min={1} max={12} step={1} value={cfg.topK}
              onChange={(v) => setDraft({ ...cfg, topK: v as number })}
              onChangeComplete={(v) => patch({ topK: v as number })}
            />
          </div>
        </Space>
      </Card>

      {/* 检索测试 */}
      <Card size="small" className="glass-card" title={<Space><SearchOutlined />检索测试</Space>}>
        <Space direction="vertical" style={{ width: '100%' }} size={8}>
          <Space.Compact style={{ width: '100%' }}>
            <Input
              size="small" value={query} placeholder="例如：登录态在哪里校验"
              onChange={(e) => setQuery(e.target.value)}
              onPressEnter={() => search(query)}
            />
            <Button
              size="small" type="primary" icon={<SearchOutlined />}
              disabled={!workspace?.path} onClick={() => search(query)}
            >检索</Button>
          </Space.Compact>

          {hits.length > 0 && (
            <Text style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
              「{lastQuery}」命中 {hits.length} 段
            </Text>
          )}

          <div style={{ maxHeight: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {hits.map((h) => (
              <div
                key={h.id}
                style={{
                  border: '1px solid var(--g-stroke)',
                  borderRadius: 10,
                  padding: '8px 10px',
                  background: 'var(--g-panel-light)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <Text style={{ fontSize: 11, fontFamily: 'var(--font-mono, monospace)' }} ellipsis>
                    {h.path}:{h.startLine}-{h.endLine}
                  </Text>
                  <Tag color="blue" style={{ fontSize: 10, margin: 0 }}>{h.score.toFixed(3)}</Tag>
                </div>
                <pre
                  style={{
                    margin: '6px 0 0', fontSize: 11, lineHeight: 1.5,
                    whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                    maxHeight: 140, overflow: 'hidden', color: 'var(--text-secondary)',
                  }}
                >
                  {h.content.slice(0, 600)}
                </pre>
              </div>
            ))}
            {hits.length === 0 && lastQuery && (
              <Text style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>没有命中，先建立索引试试。</Text>
            )}
          </div>
        </Space>
      </Card>
    </div>
  );
}
