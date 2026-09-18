import React, { useEffect, useMemo, useRef, useState } from 'react';
import type * as MonacoNS from 'monaco-editor';
import {
  CheckOutlined,
  CloseOutlined,
  LoadingOutlined,
  DiffOutlined,
} from '@ant-design/icons';
import {
  ensureMonaco,
  detectLanguage,
  THEME_DARK,
  THEME_LIGHT,
} from '../../editor/monaco-setup';

/**
 * 改动审核视图 — Monaco DiffEditor
 * ────────────────────────────────────────────────────────────
 * Agent 提出文件改动后，用它并排展示「原文件 vs 改后」，由用户决定接受还是拒绝。
 * 这是 Codex / Claude Code 图形端最核心的一个交互原语。
 *
 * 用法可以是内联在聊天流里（给一个固定高度），
 * 也可以占满整个标签页（height 传 '100%'）。
 */

export interface FileDiffViewProps {
  filePath: string;
  original: string;
  modified: string;
  /** 高度，默认 360；占满容器传 '100%' */
  height?: number | string;
  /** 只读预览（不显示接受/拒绝按钮） */
  readOnly?: boolean;
  onAccept?: () => void;
  onReject?: () => void;
}

/** 统计增删行数（简易逐行比对，仅用于展示「+N −M」） */
function countChanges(original: string, modified: string) {
  const a = (original ?? '').split('\n');
  const b = (modified ?? '').split('\n');
  const setB = new Set(b);
  const setA = new Set(a);
  let added = 0;
  let removed = 0;
  for (const line of b) if (!setA.has(line)) added++;
  for (const line of a) if (!setB.has(line)) removed++;
  return { added, removed };
}

const FileDiffView: React.FC<FileDiffViewProps> = ({
  filePath,
  original,
  modified,
  height = 360,
  readOnly = false,
  onAccept,
  onReject,
}) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const diffRef = useRef<MonacoNS.editor.IStandaloneDiffEditor | null>(null);
  const monacoRef = useRef<typeof MonacoNS | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const stats = useMemo(() => countChanges(original, modified), [original, modified]);
  const fileName = filePath.split(/[\\/]/).pop() || filePath;

  const applyTheme = () => {
    const monaco = monacoRef.current;
    if (!monaco) return;
    const root = document.documentElement;
    monaco.editor.setTheme(
      root.classList.contains('theme-light') ? THEME_LIGHT : THEME_DARK
    );
  };

  useEffect(() => {
    const root = document.documentElement;
    const obs = new MutationObserver(applyTheme);
    obs.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    let originalModel: MonacoNS.editor.ITextModel | null = null;
    let modifiedModel: MonacoNS.editor.ITextModel | null = null;

    (async () => {
      try {
        const monaco = await ensureMonaco();
        if (cancelled || !hostRef.current) return;
        monacoRef.current = monaco;

        const lang = detectLanguage(monaco, filePath);
        originalModel = monaco.editor.createModel(original ?? '', lang);
        modifiedModel = monaco.editor.createModel(modified ?? '', lang);

        const diff = monaco.editor.createDiffEditor(hostRef.current, {
          theme: document.documentElement.classList.contains('theme-light')
            ? THEME_LIGHT
            : THEME_DARK,
          automaticLayout: true,
          readOnly: true,
          originalEditable: false,
          renderSideBySide: true,
          ignoreTrimWhitespace: false,
          renderOverviewRuler: false,
          minimap: { enabled: false },
          fontFamily:
            "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace",
          fontSize: 12.5,
          lineHeight: 1.6,
          scrollBeyondLastLine: false,
          smoothScrolling: true,
          folding: false,
          padding: { top: 8, bottom: 20 },
          scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10, useShadows: false },
          renderLineHighlight: 'none',
          stickyScroll: { enabled: false },
        });

        diff.setModel({ original: originalModel, modified: modifiedModel });
        diffRef.current = diff;
        setReady(true);
      } catch (err: any) {
        console.error('[FileDiffView] 初始化失败:', err);
        if (!cancelled) setFailed(err?.message || String(err));
      }
    })();

    return () => {
      cancelled = true;
      diffRef.current?.dispose();
      diffRef.current = null;
      originalModel?.dispose();
      modifiedModel?.dispose();
    };
  }, [filePath, original, modified]);

  const hasChanges = stats.added > 0 || stats.removed > 0;

  return (
    <div className="ws-diff">
      <div className="ws-diff-bar">
        <DiffOutlined className="ws-editor-bar-icon" />
        <span className="ws-editor-crumb" title={filePath}>
          <span className="ws-editor-crumb-last">{fileName}</span>
        </span>
        <span className="ws-diff-stat">
          <span className="ws-diff-add">+{stats.added}</span>
          <span className="ws-diff-del">−{stats.removed}</span>
        </span>

        <span className="ws-editor-spacer" />

        {!readOnly && (
          <>
            <button className="g-chip primary" onClick={onAccept} disabled={!onAccept} title={onAccept ? undefined : '暂无可用操作'}>
              <CheckOutlined /> 接受
            </button>
            <button className="g-chip" onClick={onReject} disabled={!onReject} title={onReject ? undefined : '暂无可用操作'}>
              <CloseOutlined /> 拒绝
            </button>
          </>
        )}
      </div>

      <div className="ws-diff-body" style={{ height }}>
        {!ready && !failed && (
          <div className="ws-editor-loading">
            <LoadingOutlined /> 正在加载改动…
          </div>
        )}
        {failed && (
          <div className="ws-editor-blocked">
            <div>改动视图加载失败</div>
            <div className="ws-editor-blocked-sub">{failed}</div>
          </div>
        )}
        {!hasChanges && ready && (
          <div className="ws-diff-empty">这个文件没有实质改动</div>
        )}
        <div ref={hostRef} className="ws-diff-host" style={{ display: ready ? 'block' : 'none' }} />
      </div>
    </div>
  );
};

export default FileDiffView;
