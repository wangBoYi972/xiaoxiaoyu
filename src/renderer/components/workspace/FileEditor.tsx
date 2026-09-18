import React, { useCallback, useEffect, useRef, useState } from 'react';
import type * as MonacoNS from 'monaco-editor';
import {
  SaveOutlined,
  UndoOutlined,
  LoadingOutlined,
  FileOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { message } from 'antd';
import { useSettingsStore } from '../../stores/settings-store';
import { useWorkspaceStore } from '../../stores/workspace-store';
import {
  ensureMonaco,
  detectLanguage,
  looksBinary,
  THEME_DARK,
  THEME_LIGHT,
} from '../../editor/monaco-setup';
import {
  registerModel,
  unregisterModel,
  getSavedAltVersionId,
  setSavedAltVersionId,
} from '../../editor/editor-registry';

/**
 * 文件编辑器 — Monaco 版
 * ────────────────────────────────────────────────────────────
 * 相比原来的 `<Input.TextArea>` + 手写行号列：
 *   - 行号和正文由 Monaco 统一管理，不会滚动错位
 *   - 90+ 语言语法高亮、代码折叠、括号配对/缩进参考线
 *   - 多光标、多选、查找替换（Ctrl/Cmd+F、Ctrl/Cmd+H）
 *   - minimap、当前行高亮、Ctrl/Cmd+滚轮缩放
 *   - 每个文件一个 model → 切标签页保留撤销历史
 *
 * 主题跟随 <html> 上的 .theme-dark / .theme-light（App.tsx 挂的），
 * 用 MutationObserver 监听，不依赖 store 的订阅时机。
 */

interface FileEditorProps {
  tabId: string;
  filePath: string;
  initialContent: string;
}

const FileEditor: React.FC<FileEditorProps> = ({ tabId, filePath, initialContent }) => {
  const { updateTab } = useWorkspaceStore();
  const isDark = useSettingsStore((s) => s.theme) !== 'light';

  const hostRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<MonacoNS.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof MonacoNS | null>(null);

  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const binary = looksBinary(filePath);
  const fileName = filePath.split(/[\\/]/).pop() || filePath;

  /* ---------- 主题：跟随 <html> 的类名 ---------- */
  const applyTheme = useCallback(() => {
    const monaco = monacoRef.current;
    const editor = editorRef.current;
    if (!monaco || !editor) return;
    const root = document.documentElement;
    const dark =
      root.classList.contains('theme-dark') ||
      (!root.classList.contains('theme-light') && isDark);
    monaco.editor.setTheme(dark ? THEME_DARK : THEME_LIGHT);
  }, [isDark]);

  useEffect(() => {
    const root = document.documentElement;
    const obs = new MutationObserver(applyTheme);
    obs.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, [applyTheme]);

  useEffect(() => {
    applyTheme();
  }, [applyTheme]);

  /* ---------- 保存 ---------- */
  const saveRef = useRef<() => Promise<void>>(async () => {});

  // initialContent 只在「首次创建 model」时用一次。
  // 用 ref 持有，避免它进 effect 依赖导致每次存盘都重建编辑器。
  const initialContentRef = useRef(initialContent);
  initialContentRef.current = initialContent;

  saveRef.current = async () => {
    const editor = editorRef.current;
    if (!editor) return;
    const model = editor.getModel();
    if (!model) return;
    const value = model.getValue();

    setSaving(true);
    try {
      const result = await window.electronAPI.file.write(filePath, value);
      if (result.success) {
        setSavedAltVersionId(filePath, model.getAlternativeVersionId());
        setDirty(false);
        updateTab(tabId, { unsaved: false, content: value });
        message.success('已保存');
      } else {
        message.error(result.error || '保存失败');
      }
    } catch (err: any) {
      message.error(err?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  /* ---------- 挂载 Monaco ---------- */
  useEffect(() => {
    if (binary) return;
    let cancelled = false;
    let contentSub: MonacoNS.IDisposable | null = null;

    (async () => {
      try {
        const monaco = await ensureMonaco();
        if (cancelled || !hostRef.current) return;
        monacoRef.current = monaco;

        // 同一个文件复用已有 model（保留撤销历史 / 未保存内容）
        const uri = monaco.Uri.file(filePath);
        let model = monaco.editor.getModel(uri);
        if (!model) {
          model = monaco.editor.createModel(
            initialContentRef.current ?? '',
            detectLanguage(monaco, filePath),
            uri
          );
          // 首次创建：把这个版本记为「已保存」
          setSavedAltVersionId(filePath, model.getAlternativeVersionId());
        }
        // 语言可能因文件改名/推断变化，兜底对齐一次
        const lang = detectLanguage(monaco, filePath);
        if (model.getLanguageId() !== lang) monaco.editor.setModelLanguage(model, lang);

        const saved = getSavedAltVersionId(filePath);
        setDirty(saved !== undefined && model.getAlternativeVersionId() !== saved);

        const editor = monaco.editor.create(hostRef.current, {
          model,
          theme: document.documentElement.classList.contains('theme-light')
            ? THEME_LIGHT
            : THEME_DARK,
          automaticLayout: true,          // 面板缩放/拖拽时自动重排
          fontFamily:
            "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace",
          fontSize: 13,
          lineHeight: 1.6,
          fontLigatures: true,
          minimap: { enabled: true, renderCharacters: false, maxColumn: 90 },
          scrollBeyondLastLine: false,
          smoothScrolling: true,
          cursorBlinking: 'smooth',
          cursorSmoothCaretAnimation: 'on',
          renderLineHighlight: 'all',
          renderWhitespace: 'selection',
          bracketPairColorization: { enabled: true },
          guides: { bracketPairs: true, indentation: true, highlightActiveIndentation: true },
          folding: true,
          foldingHighlight: true,
          showFoldingControls: 'mouseover',
          tabSize: 2,
          padding: { top: 10, bottom: 60 },
          wordWrap: 'off',
          scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10, useShadows: false },
          overviewRulerBorder: false,
          stickyScroll: { enabled: true },
          links: true,
          contextmenu: true,
          quickSuggestions: true,
          suggestOnTriggerCharacters: true,
        });
        editorRef.current = editor;

        // Ctrl/Cmd+S 保存
        editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
          void saveRef.current();
        });

        // 内容变化 → 脏标记 + 同步到标签（让 TabBar 显示圆点）
        contentSub = editor.onDidChangeModelContent(() => {
          const m = editor.getModel();
          if (!m) return;
          const s = getSavedAltVersionId(filePath);
          const isDirty = s === undefined || m.getAlternativeVersionId() !== s;
          setDirty(isDirty);
          updateTab(tabId, { unsaved: isDirty });
        });

        registerModel(filePath, () => {
          contentSub?.dispose();
          editor.dispose();
          model.dispose();
        });

        setReady(true);
      } catch (err: any) {
        console.error('[FileEditor] Monaco 初始化失败:', err);
        if (!cancelled) setFailed(err?.message || String(err));
      }
    })();

    return () => {
      cancelled = true;
      // 注意：不销毁 model（切标签要保留撤销历史），只销毁 editor 实例。
      // model 的销毁交给「关标签页」时调用的 disposeModelFor()。
      contentSub?.dispose();
      editorRef.current?.dispose();
      editorRef.current = null;
      unregisterModel(filePath);
    };
  }, [filePath, binary, tabId, updateTab]);

  /* ---------- 还原到上次保存的内容 ---------- */
  const handleRevert = () => {
    const editor = editorRef.current;
    if (!editor) return;
    const model = editor.getModel();
    if (!model) return;
    // 标签里的 content 就是「上次读盘 / 上次保存」的内容，
    // 用 setValue 回滚（会清空撤销栈，这正是 revert 的预期语义）
    model.setValue(initialContent ?? '');
    setSavedAltVersionId(filePath, model.getAlternativeVersionId());
    setDirty(false);
    updateTab(tabId, { unsaved: false });
  };

  /* ---------- 二进制文件 ---------- */
  if (binary) {
    return (
      <div className="ws-editor">
        <div className="ws-editor-bar">
          <FileOutlined className="ws-editor-bar-icon" />
          <span className="ws-editor-name">{fileName}</span>
        </div>
        <div className="ws-editor-blocked">
          <WarningOutlined />
          <div>这是二进制文件，不能用文本编辑器打开</div>
          <div className="ws-editor-blocked-sub">{filePath}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="ws-editor">
      {/* 顶栏：面包屑 + 操作 */}
      <div className="ws-editor-bar">
        <FileOutlined className="ws-editor-bar-icon" />
        <span className="ws-editor-crumb" title={filePath}>
          {filePath.split(/[\\/]/).filter(Boolean).map((seg, i, arr) => (
            <React.Fragment key={i}>
              <span className={i === arr.length - 1 ? 'ws-editor-crumb-last' : ''}>{seg}</span>
              {i < arr.length - 1 && <span className="ws-editor-crumb-sep">›</span>}
            </React.Fragment>
          ))}
        </span>

        {dirty && <span className="ws-editor-dot" title="有未保存的修改" />}

        <span className="ws-editor-spacer" />

        {dirty && (
          <>
            <button className="g-chip primary" onClick={() => void saveRef.current()} disabled={saving}>
              {saving ? <LoadingOutlined /> : <SaveOutlined />} {saving ? '保存中' : '保存'}
            </button>
            <button className="g-chip" onClick={handleRevert}>
              <UndoOutlined /> 还原
            </button>
          </>
        )}
      </div>

      {/* 编辑区 */}
      <div className="ws-editor-body">
        {!ready && !failed && (
          <div className="ws-editor-loading">
            <LoadingOutlined /> 正在加载编辑器…
          </div>
        )}
        {failed && (
          <div className="ws-editor-blocked">
            <WarningOutlined />
            <div>编辑器加载失败</div>
            <div className="ws-editor-blocked-sub">{failed}</div>
          </div>
        )}
        <div ref={hostRef} className="ws-editor-host" style={{ display: ready ? 'block' : 'none' }} />
      </div>
    </div>
  );
};

export default FileEditor;
