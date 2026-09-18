import type * as MonacoNS from 'monaco-editor';

/**
 * Monaco 环境装配
 * ────────────────────────────────────────────────────────────
 * 1. **Worker 策略**（关键）
 *    生产环境用 Electron 的 `loadFile` → 页面跑在 `file://` 下，
 *    这种源是 opaque origin，`new Worker()` 一定被同源策略拦。
 *    Monaco 官方的降级路径是：`getWorker` **抛异常** 时它会捕获，
 *    回退到主线程跑 `SimpleWorker`（控制台会有性能警告，但功能都在）。
 *    所以这里在 file:// 下故意抛错，而不是去 try 一个注定失败的 Worker。
 *    → 结果：高亮 / 折叠 / 括号配对 / 多光标 / 查找替换 / DiffEditor 全部可用，
 *      只是语言服务（TS 类型级补全、诊断）在主线程跑。
 *    开发环境（localhost）和 Web 模式（http）走真正的 Worker，能力完整。
 *
 * 2. **主题**：Monaco 的 theme.colors 只吃十六进制，读不到 CSS 变量，
 *    所以这里定义两套静态主题，颜色对齐玻璃设计系统；
 *    编辑器背景统一设成全透明（#00000000），由容器铺 `--code-surface`，
 *    这样明暗切换、壁纸透光都自动跟着 CSS 变量走。
 *
 * 3. **懒加载**：monaco-editor 约 5MB，只有真正打开文件时才拉这个模块。
 */

export const THEME_DARK = 'xxy-glass-dark';
export const THEME_LIGHT = 'xxy-glass-light';

/** file:// 下 Worker 不可用 */
const IS_FILE_PROTOCOL =
  typeof window !== 'undefined' && window.location.protocol === 'file:';

/**
 * 调试/兜底开关：`window.__xxyForceNoWorker = true` 可以强制走主线程模式。
 * 用途：
 *   1. 验证打包后 file:// 的那条路径（dev server 是 http，Worker 能跑，
 *      不强制的话根本测不到无 Worker 分支）
 *   2. 某些受限环境下 Worker 被策略拦截时，用户可以手动自救
 */
function forceNoWorker(): boolean {
  return (
    typeof self !== 'undefined' && (self as any).__xxyForceNoWorker === true
  );
}

let bootPromise: Promise<typeof MonacoNS> | null = null;

/* ---------------------------------------------------------------- Worker */

async function installWorkers() {
  // 注意路径：monaco-editor 0.5x 的 package.json `exports` 是
  //   "./*"     -> "./esm/vs/*.js"
  // 所以子路径**不能**再带 `esm/vs/` 前缀。
  // 官方 README 里那句 `monaco-editor/esm/vs/editor/editor.worker?worker`
  // 对新版本已经失效（会被解析成 esm/vs/esm/vs/... 而报 resolve 失败），
  // 必须写成下面这种形式。
  const [EditorWorker, JsonWorker, CssWorker, HtmlWorker, TsWorker] = (
    await Promise.all([
      import('monaco-editor/editor/editor.worker?worker'),
      import('monaco-editor/language/json/json.worker?worker'),
      import('monaco-editor/language/css/css.worker?worker'),
      import('monaco-editor/language/html/html.worker?worker'),
      import('monaco-editor/language/typescript/ts.worker?worker'),
    ])
  ).map((m) => m.default);

  (self as any).MonacoEnvironment = {
    getWorker(_workerId: string, label: string): Worker {
      switch (label) {
        case 'json':
          return new JsonWorker();
        case 'css':
        case 'scss':
        case 'less':
          return new CssWorker();
        case 'html':
        case 'handlebars':
        case 'razor':
          return new HtmlWorker();
        case 'typescript':
        case 'javascript':
          return new TsWorker();
        default:
          return new EditorWorker();
      }
    },
  };
}

function installNoWorkerFallback() {
  (self as any).MonacoEnvironment = {
    getWorker(): Worker {
      // 故意抛错：这是触发 Monaco 主线程降级的官方方式，别改成 return null
      throw new Error('[monaco] workers disabled under file:// (opaque origin)');
    },
  };
}

/* ---------------------------------------------------------------- 主题 */

const DARK_RULES = [
  { token: 'comment', foreground: '6b7a90', fontStyle: 'italic' },
  { token: 'keyword', foreground: '7c9dff' },
  { token: 'keyword.control', foreground: '7c9dff' },
  { token: 'string', foreground: '86efac' },
  { token: 'number', foreground: 'fbbf24' },
  { token: 'constant', foreground: 'fbbf24' },
  { token: 'type', foreground: '38bdf8' },
  { token: 'type.identifier', foreground: '38bdf8' },
  { token: 'function', foreground: 'c4b5fd' },
  { token: 'tag', foreground: '7c9dff' },
  { token: 'attribute.name', foreground: 'fbbf24' },
  { token: 'variable', foreground: 'e2e8f0' },
  { token: 'delimiter', foreground: '94a3b8' },
];

const LIGHT_RULES = [
  { token: 'comment', foreground: '6b7280', fontStyle: 'italic' },
  { token: 'keyword', foreground: '4f7cff' },
  { token: 'keyword.control', foreground: '4f7cff' },
  { token: 'string', foreground: '15803d' },
  { token: 'number', foreground: 'b45309' },
  { token: 'constant', foreground: 'b45309' },
  { token: 'type', foreground: '0284c7' },
  { token: 'type.identifier', foreground: '0284c7' },
  { token: 'function', foreground: '7c3aed' },
  { token: 'tag', foreground: '4f7cff' },
  { token: 'attribute.name', foreground: 'b45309' },
  { token: 'variable', foreground: '0f172a' },
  { token: 'delimiter', foreground: '64748b' },
];

/** 两套主题共用的结构性颜色，只有前景/描边不同 */
function themeColors(mode: 'dark' | 'light') {
  if (mode === 'dark') {
    return {
      'editor.background': '#00000000',
      'editor.foreground': '#e2e8f0',
      'editorLineNumber.foreground': '#4a5568',
      'editorLineNumber.activeForeground': '#9ca3af',
      'editorCursor.foreground': '#7c9dff',
      'editor.selectionBackground': '#7c9dff38',
      'editor.inactiveSelectionBackground': '#7c9dff1c',
      'editor.selectionHighlightBackground': '#7c9dff24',
      'editor.lineHighlightBackground': '#ffffff0a',
      'editor.wordHighlightBackground': '#7c9dff20',
      'editorIndentGuide.background1': '#ffffff14',
      'editorIndentGuide.activeBackground1': '#7c9dff59',
      'editorBracketMatch.background': '#7c9dff22',
      'editorBracketMatch.border': '#7c9dff80',
      'editorGutter.background': '#00000000',
      'editorWhitespace.foreground': '#ffffff1a',
      'minimap.background': '#00000000',
      'minimapSlider.background': '#ffffff14',
      'scrollbarSlider.background': '#ffffff1a',
      'scrollbarSlider.hoverBackground': '#ffffff2e',
      'scrollbarSlider.activeBackground': '#ffffff42',
      'editorWidget.background': '#13151e',
      'editorWidget.border': '#ffffff24',
      'editorWidget.foreground': '#e2e8f0',
      'input.background': '#ffffff14',
      'input.border': '#ffffff24',
      'input.foreground': '#e2e8f0',
      'dropdown.background': '#13151e',
      'dropdown.border': '#ffffff24',
      'list.hoverBackground': '#ffffff14',
      'list.activeSelectionBackground': '#7c9dff2e',
      'editorSuggestWidget.background': '#13151e',
      'editorSuggestWidget.border': '#ffffff24',
      'editorSuggestWidget.selectedBackground': '#7c9dff2e',
      'editorHoverWidget.background': '#13151e',
      'editorHoverWidget.border': '#ffffff24',
      'editorOverviewRuler.border': '#00000000',
      'editorError.foreground': '#f87171',
      'editorWarning.foreground': '#fbbf24',
      'diffEditor.insertedTextBackground': '#4ade8024',
      'diffEditor.removedTextBackground': '#f8717124',
      'diffEditor.insertedLineBackground': '#4ade8016',
      'diffEditor.removedLineBackground': '#f8717116',
      'diffEditorGutter.insertedLineBackground': '#4ade8024',
      'diffEditorGutter.removedLineBackground': '#f8717124',
    };
  }
  return {
    'editor.background': '#00000000',
    'editor.foreground': '#0f172a',
    'editorLineNumber.foreground': '#9aa4b2',
    'editorLineNumber.activeForeground': '#475569',
    'editorCursor.foreground': '#4f7cff',
    'editor.selectionBackground': '#4f7cff2e',
    'editor.inactiveSelectionBackground': '#4f7cff18',
    'editor.selectionHighlightBackground': '#4f7cff1f',
    'editor.lineHighlightBackground': '#0f172a0a',
    'editor.wordHighlightBackground': '#4f7cff1f',
    'editorIndentGuide.background1': '#0f172a1a',
    'editorIndentGuide.activeBackground1': '#4f7cff59',
    'editorBracketMatch.background': '#4f7cff1f',
    'editorBracketMatch.border': '#4f7cff80',
    'editorGutter.background': '#00000000',
    'editorWhitespace.foreground': '#0f172a1a',
    'minimap.background': '#00000000',
    'minimapSlider.background': '#0f172a14',
    'scrollbarSlider.background': '#0f172a1f',
    'scrollbarSlider.hoverBackground': '#0f172a33',
    'scrollbarSlider.activeBackground': '#0f172a47',
    'editorWidget.background': '#fcfdff',
    'editorWidget.border': '#0f172a24',
    'editorWidget.foreground': '#0f172a',
    'input.background': '#0f172a0d',
    'input.border': '#0f172a24',
    'input.foreground': '#0f172a',
    'dropdown.background': '#fcfdff',
    'dropdown.border': '#0f172a24',
    'list.hoverBackground': '#0f172a0d',
    'list.activeSelectionBackground': '#4f7cff24',
    'editorSuggestWidget.background': '#fcfdff',
    'editorSuggestWidget.border': '#0f172a24',
    'editorSuggestWidget.selectedBackground': '#4f7cff24',
    'editorHoverWidget.background': '#fcfdff',
    'editorHoverWidget.border': '#0f172a24',
    'editorOverviewRuler.border': '#00000000',
    'editorError.foreground': '#dc2626',
    'editorWarning.foreground': '#d97706',
    'diffEditor.insertedTextBackground': '#16a34a26',
    'diffEditor.removedTextBackground': '#dc26261f',
    'diffEditor.insertedLineBackground': '#16a34a18',
    'diffEditor.removedLineBackground': '#dc262614',
    'diffEditorGutter.insertedLineBackground': '#16a34a26',
    'diffEditorGutter.removedLineBackground': '#dc262624',
  };
}

function defineThemes(monaco: typeof MonacoNS) {
  monaco.editor.defineTheme(THEME_DARK, {
    base: 'vs-dark',
    inherit: true,
    rules: DARK_RULES,
    colors: themeColors('dark') as any,
  });
  monaco.editor.defineTheme(THEME_LIGHT, {
    base: 'vs',
    inherit: true,
    rules: LIGHT_RULES,
    colors: themeColors('light') as any,
  });
}

/* ---------------------------------------------------------------- 启动 */

async function boot(): Promise<typeof MonacoNS> {
  const monaco = await import('monaco-editor');

  if (IS_FILE_PROTOCOL || forceNoWorker()) {
    installNoWorkerFallback();
  } else {
    try {
      await installWorkers();
    } catch (err) {
      console.warn('[monaco] Worker 装载失败，回退主线程模式：', err);
      installNoWorkerFallback();
    }
  }

  defineThemes(monaco);
  return monaco;
}

/** 幂等：整个应用只装配一次 */
export function ensureMonaco(): Promise<typeof MonacoNS> {
  if (!bootPromise) bootPromise = boot();
  return bootPromise;
}

export function isMonacoReady(): boolean {
  return bootPromise !== null;
}

/* ---------------------------------------------------------------- 工具 */

/** 特殊文件名（没有扩展名或扩展名不可靠）→ Monaco 语言 id */
const BY_FILENAME: Record<string, string> = {
  dockerfile: 'dockerfile',
  'dockerfile.dev': 'dockerfile',
  makefile: 'makefile',
  'cmakelists.txt': 'cmake',
  '.gitignore': 'ini',
  '.gitattributes': 'ini',
  '.env': 'ini',
  '.env.local': 'ini',
  '.editorconfig': 'ini',
  '.npmrc': 'ini',
  '.prettierrc': 'json',
  '.eslintrc': 'json',
  '.babelrc': 'json',
  license: 'plaintext',
  readme: 'markdown',
};

const EXT_ALIAS: Record<string, string> = {
  '.mjs': '.js',
  '.cjs': '.js',
  '.mts': '.ts',
  '.cts': '.ts',
  '.jsx': '.jsx',
  '.pyw': '.py',
  '.htm': '.html',
  '.yml': '.yaml',
  '.mdx': '.markdown',
  '.sh': '.shell',
  '.bash': '.shell',
  '.zsh': '.shell',
};

/** 依据文件名推断 Monaco 语言 id（拿不到就 plaintext） */
export function detectLanguage(
  monaco: typeof MonacoNS,
  filePath: string
): string {
  const name = (filePath.split(/[\\/]/).pop() || '').toLowerCase();
  if (!name) return 'plaintext';

  if (BY_FILENAME[name]) return BY_FILENAME[name];

  // 复合扩展名先特判
  if (name.endsWith('.d.ts')) return 'typescript';
  if (name.endsWith('.test.ts') || name.endsWith('.spec.ts')) return 'typescript';
  if (name.endsWith('.module.css')) return 'css';

  const dot = name.lastIndexOf('.');
  if (dot <= 0) return 'plaintext';
  const rawExt = name.slice(dot);
  const ext = EXT_ALIAS[rawExt] || rawExt;

  // 用 Monaco 自己的语言注册表反查，覆盖 90+ 语言且不会过时
  for (const lang of monaco.languages.getLanguages()) {
    if (lang.extensions?.some((e) => e.toLowerCase() === ext)) return lang.id;
  }
  return 'plaintext';
}

/** 粗略判断是否二进制/不应以文本打开 */
export function looksBinary(filePath: string): boolean {
  return /\.(png|jpe?g|gif|webp|bmp|ico|icns|pdf|zip|gz|tar|7z|rar|exe|dll|so|dylib|node|woff2?|ttf|otf|eot|mp[34]|wav|ogg|webm|mov|mp4|sqlite|db|wasm|class|jar)$/i.test(
    filePath
  );
}
