import React from 'react';
import { Button } from 'antd';
import { SafetyCertificateOutlined, WarningOutlined } from '@ant-design/icons';

/**
 * 权限确认卡片 — Agent 要执行副作用操作（写文件 / 跑命令）时弹出，等用户逐项批准。
 * 交互：
 *   - 允许一次 / 拒绝
 *   - 180s 无响应自动拒绝（主进程侧兜底，这里只做倒计时展示）
 */

export interface PermissionRequest {
  id: string;
  /** 工具名 */
  tool: string;
  /** 人类可读描述，如「写入文件 src/app.ts」 */
  description: string;
  /** 具体命令或参数 */
  detail?: string;
  /** 风险等级：low 普通写文件 / high 执行命令、删除 */
  risk?: 'low' | 'high';
  /** 过期时间戳 ms */
  expiresAt?: number;
}

interface Props {
  request: PermissionRequest;
  onRespond: (id: string, decision: 'allow' | 'deny') => void;
}

const PermissionCard: React.FC<Props> = ({ request, onRespond }) => {
  const [left, setLeft] = React.useState<number>(() =>
    request.expiresAt ? Math.max(0, Math.ceil((request.expiresAt - Date.now()) / 1000)) : 0
  );
  const [done, setDone] = React.useState(false);

  React.useEffect(() => {
    if (!request.expiresAt || done) return;
    const t = setInterval(() => {
      const s = Math.max(0, Math.ceil((request.expiresAt! - Date.now()) / 1000));
      setLeft(s);
      if (s <= 0) { clearInterval(t); respond('deny'); }
    }, 1000);
    return () => clearInterval(t);
  }, [request.expiresAt, done]);

  const respond = (d: 'allow' | 'deny') => {
    if (done) return;
    setDone(true);
    onRespond(request.id, d);
  };

  const isFileChange = request.tool === 'edit_file' || request.tool === 'write_file';
  const high = request.risk === 'high';

  return (
    <div className={`perm-card ${high ? 'risk-high' : ''}`}>
      <div className="perm-title">
        {high
          ? <WarningOutlined style={{ color: 'var(--danger)' }} />
          : <SafetyCertificateOutlined style={{ color: 'var(--warn)' }} />}
        需要你的授权
        {!!request.expiresAt && left > 0 && (
          <span className="perm-countdown">
            {left}s
          </span>
        )}
      </div>

      <div className="perm-desc">
        {request.description}
        {high && <span className="perm-risk-tag">· 高风险操作</span>}
      </div>

      {request.detail && <div className={isFileChange ? 'perm-diff' : 'perm-cmd'}>{request.detail}</div>}

      {done ? (
        <div className="perm-done">已处理，等待 Agent 继续…</div>
      ) : (
        <div className="perm-actions">
          <Button type="primary" size="small" onClick={() => respond('allow')}>允许一次</Button>
          <Button size="small" danger onClick={() => respond('deny')}>拒绝</Button>
        </div>
      )}
    </div>
  );
};

export default PermissionCard;
