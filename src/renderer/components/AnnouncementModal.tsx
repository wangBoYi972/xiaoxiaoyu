import React, { useCallback, useEffect, useState } from 'react';
import { Modal, Tag } from 'antd';

interface Announcement {
  id: string;
  title: string;
  content: string;
  level?: 'info' | 'warning' | 'important';
}

/**
 * 公告弹窗。
 *
 * 主进程（auto-updater.ts）启动时推送 announcement:show，这里订阅并展示。
 * 关闭即标记为已读（写进 settings 表），下次启动不再弹出。
 * 换版本时公告 id 变新 → 旧公告自然隐藏、新公告弹一次。
 */
export function AnnouncementModal() {
  const [ann, setAnn] = useState<Announcement | null>(null);

  useEffect(() => {
    const api = (window as any).electronAPI;
    if (!api?.onAnnouncement) return;
    const off = api.onAnnouncement((a: Announcement) => {
      if (a?.id && a?.title) setAnn(a);
    });
    // 补发：主进程 2s 后推送，若那时 React 还没订阅上就会丢，这里主动要一次
    // （主进程侧只推未读的，已读不会重复弹）
    const timer = setTimeout(() => {
      try { api.showAnnouncements?.(); } catch {}
    }, 1200);
    return () => {
      clearTimeout(timer);
      try { off?.(); } catch {}
    };
  }, []);

  const close = useCallback(() => {
    const api = (window as any).electronAPI;
    if (ann?.id) {
      try { api?.markAnnouncementRead?.(ann.id); } catch {}
    }
    setAnn(null);
  }, [ann]);

  if (!ann) return null;

  const levelTag =
    ann.level === 'warning' ? (
      <Tag color="orange" style={{ marginInlineStart: 8 }}>注意</Tag>
    ) : ann.level === 'important' ? (
      <Tag color="blue" style={{ marginInlineStart: 8 }}>重要</Tag>
    ) : null;

  return (
    <Modal
      open
      onCancel={close}
      footer={null}
      width={520}
      centered
      className="ann-modal"
      title={
        <span style={{ fontSize: 15, fontWeight: 600 }}>
          {ann.title}
          {levelTag}
        </span>
      }
    >
      <div className="ann-body">
        {(ann.content || '').split('\n').map((line, i) => (
          <div
            key={i}
            className={line.trim().startsWith('•') ? 'ann-line ann-bullet' : 'ann-line'}
          >
            {line || ' '}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
        <button className="g-chip primary" onClick={close}>
          我知道了
        </button>
      </div>
    </Modal>
  );
}
