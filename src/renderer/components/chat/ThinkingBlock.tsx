import React, { useEffect, useRef, useState } from 'react';
import { BulbOutlined, DownOutlined, LoadingOutlined } from '@ant-design/icons';

interface ThinkingBlockProps {
  content: string;
  /** 是否仍在思考（流式中），显示脉冲动画并默认展开 */
  active?: boolean;
}

/**
 * 思考块 — 玻璃质感
 * 折叠展示模型的思考过程，流式时自动展开并显示脉冲指示。
 */
export function ThinkingBlock({ content, active = false }: ThinkingBlockProps) {
  const [open, setOpen] = useState(active);
  const bodyRef = useRef<HTMLDivElement>(null);
  const wasActive = useRef(active);

  // 思考开始时自动展开；结束后自动收起（保留用户手动展开的意图）
  useEffect(() => {
    if (active && !wasActive.current) setOpen(true);
    wasActive.current = active;
  }, [active]);

  // 展开状态下跟随内容滚动
  useEffect(() => {
    if (open && active && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [content, open, active]);

  if (!content) return null;

  return (
    <div className={`think-block ${active ? 'active' : ''}`}>
      <div className="think-head" onClick={() => setOpen((v) => !v)}>
        <span className="think-icon">
          {active ? <LoadingOutlined spin /> : <BulbOutlined />}
        </span>
        <span className="think-title">{active ? '思考中…' : '思考过程'}</span>
        <span className="think-lines">{content.length} 字</span>
        <DownOutlined className={`think-arrow ${open ? 'open' : ''}`} />
      </div>
      {open && (
        <div ref={bodyRef} className="think-body g-scroll">
          {content}
        </div>
      )}
    </div>
  );
}

export default ThinkingBlock;
