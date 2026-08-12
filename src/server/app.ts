// Express 应用配置
import express from 'express';
import compression from 'compression';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { initAuth } from './middleware/auth';
import { authRoutes } from './routes/auth';
import { chatRoutes } from './routes/chat';
import { conversationRoutes } from './routes/conversations';
import { providerRoutes } from './routes/providers';
import { settingsRoutes } from './routes/settings';
import { skillsRoutes } from './routes/skills';
import { captchaRoutes } from './routes/captcha';
import { logger } from './utils/logger';

export function createApp(): express.Application {
  const app = express();

  // 中间件
const ALLOWED_ORIGINS = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(s => s.trim())
  : ['http://localhost:5173', 'http://localhost:3000'];
app.use(cors({
  origin: ALLOWED_ORIGINS,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400,
}));

// 安全响应头
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
// 聊天接口 SSE 流不能压缩，全局关闭（加 filter 在 Express 5 上有兼容问题）
// app.use(compression({ filter: ... }));


// 登录接口速率限制（每 IP 每分钟 20 次）
const loginRateLimit = new Map<string, { count: number; reset: number }>();
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of loginRateLimit) {
    if (val.reset < now) loginRateLimit.delete(key);
  }
}, 60000);

app.use('/api/auth/login', (req, res, next) => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const entry = loginRateLimit.get(ip);
  if (entry && now < entry.reset) {
    if (entry.count > 20) {
      res.status(429).json({ error: '登录尝试过于频繁，请1分钟后再试' });
      return;
    }
    entry.count++;
  } else {
    loginRateLimit.set(ip, { count: 1, reset: now + 60000 });
  }
  next();
});

// 初始化认证
  initAuth();

  // API 路由
  app.use('/api/auth', authRoutes());
  app.use('/api/chat', chatRoutes());
  app.use('/api/conversations', conversationRoutes());
  app.use('/api/providers', providerRoutes());
  app.use('/api/settings', settingsRoutes());
  app.use('/api/skills', skillsRoutes());
  app.use('/api/captcha', captchaRoutes());

  // 健康检查
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // 从桌面版数据库导入配置
  app.get('/api/import-desktop-config', (_req, res) => {
    try {
      const homeDir = process.env.HOME || process.env.USERPROFILE || 'C:/Users/王博弈';
      const desktopDbPath = path.join(homeDir, 'AppData', 'Roaming', 'xiaoxiaoyu', 'ai-chat.db');
      if (!fs.existsSync(desktopDbPath)) {
        res.json({ success: false, error: `桌面版数据库未找到: ${desktopDbPath}` });
        return;
      }
      // 懒加载 sql.js
      const initSqlJs = require('sql.js');
      initSqlJs().then((SQL: any) => {
        const buf = fs.readFileSync(desktopDbPath);
        const srcDb = new SQL.Database(buf);
        const stmt = srcDb.prepare('SELECT id, name, api_key_enc, base_url, enabled, models_json FROM provider_configs');
        let imported = 0;
        const db = require('./store/database');
        while (stmt.step()) {
          const row = stmt.getAsObject();
          if (row.api_key_enc) {
            // 跨库复制加密密钥（密钥不同，需要前端重新输入）
            db.execute(
              'INSERT OR REPLACE INTO provider_configs (id, name, api_key_enc, base_url, enabled, models_json) VALUES (?, ?, ?, ?, ?, ?)',
              [row.id, row.name, row.api_key_enc, row.base_url, row.enabled, row.models_json]
            );
            imported++;
          } else {
            db.execute(
              'INSERT OR REPLACE INTO provider_configs (id, name, api_key_enc, base_url, enabled, models_json) VALUES (?, ?, ?, ?, ?, ?)',
              [row.id, row.name, null, row.base_url, row.enabled, row.models_json]
            );
            imported++;
          }
        }
        stmt.free();
        srcDb.close();
        logger.info(`从桌面版导入了 ${imported} 个提供商配置`);
        res.json({ success: true, imported, note: 'API Key 加密密钥不同，如连接失败请重新在设置中输入密钥并保存' });
      });
    } catch (e: any) {
      logger.error('导入桌面配置失败', e);
      res.json({ success: false, error: e.message });
    }
  });

  // 终极诊断：GET + 查询参数，完全绕过 body-parser
  app.get('/api/raw-chat-test', async (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.flushHeaders();
    try {
      const q = req.query as any;
      const { ModelRouter } = require('../adapters');
      const router2 = new ModelRouter();
      const stream = router2.chat({
        providerId: q.provider || 'deepseek',
        modelId: q.model || 'deepseek-chat',
        apiKey: q.key || '',
        baseUrl: q.url || 'https://api.deepseek.com/v1',
        messages: [{ role: 'user', content: q.msg || 'hi' }],
      });
      for await (const chunk of stream) {
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        if (chunk.type === 'done' || chunk.type === 'error') break;
      }
    } catch (e: any) {
      res.write(`data: ${JSON.stringify({ type: 'error', error: { message: e.message } })}\n\n`);
    }
    res.end();
  });

  // SSE 连通性测试
  app.get('/api/ping-sse', (_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
    res.flushHeaders();
    let i = 0;
    const timer = setInterval(() => {
      if (i < 5) res.write(`data: ${JSON.stringify({type:'text-delta',textDelta:`Hello ${i}`})}\n\n`);
      else { res.write(`data: ${JSON.stringify({type:'done',doneReason:'stop'})}\n\n`); clearInterval(timer); res.end(); }
      i++;
    }, 500);
    _req.on('close', () => clearInterval(timer));
  });

  app.get('/api/test-chat-sse', (_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
    res.flushHeaders();
    let i = 0;
    const timer = setInterval(() => {
      if (i < 5) res.write(`data: ${JSON.stringify({type:'text-delta',textDelta:`Hello ${i}`})}\n\n`);
      else { res.write(`data: ${JSON.stringify({type:'done',doneReason:'stop'})}\n\n`); clearInterval(timer); res.end(); }
      i++;
    }, 500);
    _req.on('close', () => clearInterval(timer));
  });

  // 下载桌面版安装包（?platform=win|mac）
  app.get('/api/download', (req, res) => {
    const platform = (req.query.platform as string) || 'win';
    const releasesDir = path.resolve(PROJECT_ROOT, 'release');
    if (!fs.existsSync(releasesDir)) {
      res.status(404).json({ error: '安装包不存在' }); return;
    }
    try {
      const files = fs.readdirSync(releasesDir);
      let target: string | undefined;

      if (platform === 'mac') {
        // macOS: 源码构建包 (xiaoxiaoyu-macOS.zip)
        target = files.find(f => (f.includes('Mac') || f.includes('macOS')) && f.endsWith('.zip'));
        if (!target) {
          // 动态生成 macOS 包
          target = '小小榆-macOS-源码包.zip';
          const dest = path.join(releasesDir, target);
          if (!fs.existsSync(dest)) {
            // 创建包含源码和构建脚本的 zip
            const { execSync } = require('child_process');
            const tmpDir = path.join(releasesDir, '_mac_build');
            try {
              fs.mkdirSync(tmpDir, { recursive: true });
              const srcFiles = ['package.json', 'tsconfig.json', 'tsconfig.main.json', 'tsconfig.server.json',
                'vite.config.ts', 'index.html', 'setup-mac.command', 'BUILD-macOS.md', 'LICENSE'];
              for (const f of srcFiles) {
                const src = path.join(PROJECT_ROOT, f);
                if (fs.existsSync(src)) {
                  fs.cpSync(src, path.join(tmpDir, f), { recursive: true });
                }
              }
              ['src', 'resources', 'scripts'].forEach(d => {
                const src = path.join(PROJECT_ROOT, d);
                if (fs.existsSync(src)) fs.cpSync(src, path.join(tmpDir, d), { recursive: true });
              });
              execSync(`cd "${releasesDir}" && "${process.env.ProgramFiles || 'C:\\Program Files'}\\7-Zip\\7z.exe" a -tzip "${dest}" "_mac_build"`, { stdio: 'ignore', timeout: 60000 });
            } catch { /* fall through */ }
            try { fs.rmSync(tmpDir, { recursive: true }); } catch {}
          }
          if (fs.existsSync(dest)) target = '小小榆-macOS-源码包.zip';
        }
      } else {
        // Windows: 匹配任何 Setup .exe 或 .zip（兼容中文乱码的服务器环境）
        target = files.find(f => f.endsWith('.exe') && (f.includes('Setup') || f.includes('etup') || f.includes('Setup-') || f.toLowerCase().includes('setup')))
          || files.find(f => f.endsWith('.zip') && (f.includes('Setup') || f.includes('etup')))
          || files.find(f => f.endsWith('.exe'));
      }

      if (!target) { res.status(404).json({ error: '未找到安装包' }); return; }

      const filePath = path.join(releasesDir, target);
      const stat = fs.statSync(filePath);
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(target)}`);
      res.setHeader('Content-Length', stat.size);
      fs.createReadStream(filePath).pipe(res);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // 获取下载信息（双平台）
  app.get('/api/download/info', (_req, res) => {
    const releasesDir = path.resolve(PROJECT_ROOT, 'release');
    try {
      const result: any = { windows: null, mac: null };
      if (fs.existsSync(releasesDir)) {
        const files = fs.readdirSync(releasesDir);
        // Windows — 兼容中文乱码文件名
        const winExe = files.find(f => f.endsWith('.exe') && (f.includes('Setup') || f.includes('etup')));
        const winZip = files.find(f => f.endsWith('.zip') && (f.includes('Setup') || f.includes('etup')));
        const winTarget = winExe || winZip;
        if (winTarget) {
          const s = fs.statSync(path.join(releasesDir, winTarget));
          result.windows = { name: 'Windows 安装包', fileName: winTarget, size: s.size, sizeFormatted: (s.size / 1048576).toFixed(0) + ' MB' };
        }
        // macOS — 兼容中文乱码
        const macZip = files.find(f => f.endsWith('.zip') && (f.includes('Mac') || f.includes('macOS') || f.includes('mac')));
        if (macZip) {
          const s = fs.statSync(path.join(releasesDir, macZip));
          result.mac = { name: 'macOS 源码构建包', fileName: macZip, size: s.size, sizeFormatted: (s.size / 1024).toFixed(0) + ' KB', note: '含源码+构建脚本，需 Node.js 18+' };
        }
      }
      res.json(result);
    } catch (e: any) { res.status(500).json({ error: e.message }); }
  });

  // 静态文件服务（生产环境提供 React SPA）
  const staticDir = path.join(__dirname, '..', '..', 'renderer');
  const hasStatic = (() => { try { return fs.existsSync(path.join(staticDir, 'index.html')); } catch { return false; } })();

  if (hasStatic) {
    // 静态资源缓存：JS/CSS 带 hash → 1年缓存，HTML 不缓存
    app.use('/assets', express.static(path.join(staticDir, 'assets'), {
      maxAge: '365d',
      immutable: true,
      setHeaders: (res) => {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      },
    }));

    // HTML 和其他文件不缓存
    app.use(express.static(staticDir, {
      setHeaders: (res, filePath) => {
        if (!filePath.includes('/assets/')) {
          res.setHeader('Cache-Control', 'no-cache');
        }
      },
    }));

    // SPA fallback
    app.get('/{*path}', (_req, res) => {
      res.sendFile('index.html', { root: staticDir });
    });
  } else {
    app.get('/', (_req, res) => {
      res.json({
        message: '小小榆 Web 服务运行中',
        mode: 'api-only',
        hint: '请使用 npm run web:dev 启动开发模式，或 npm run web:build 构建前端',
      });
    });
  }

  return app;
}

// 项目根目录 — dist/server/server/ → 向上3级到项目根
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
