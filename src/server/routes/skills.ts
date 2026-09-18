// 技能系统路由
import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { randomUUID as uuidv4 } from 'crypto';
import { authMiddleware } from '../middleware/auth';
import { queryAll, queryOne, execute } from '../store/database';
import { logger } from '../utils/logger';

// 技能存储目录
const SKILLS_DIR = process.env.SKILLS_DIR || path.join(process.cwd(), 'data', 'skills');

// 内置技能（与桌面版 skills.ipc.ts 保持一致）
const BUILTIN_SKILLS: any[] = [
  { id: 'general', name: '通用助手', description: '回答通用知识问题', icon: '💬', category: 'utility', systemPrompt: '你是一个有帮助的AI助手。', version: '1.0.0' },
  { id: 'coder', name: '编程助手', description: '帮助编写和调试代码', icon: '💻', category: 'coding', systemPrompt: '你是一个专业的编程助手，精通多种编程语言。提供清晰、可运行的代码示例。', version: '1.0.0' },
  { id: 'translator', name: '翻译专家', description: '高质量多语言翻译', icon: '🌐', category: 'utility', systemPrompt: '你是一个专业的翻译专家。翻译要准确、流畅、符合目标语言习惯。', version: '1.0.0' },
  { id: 'writer', name: '写作助手', description: '帮助撰写各种文本内容', icon: '✍️', category: 'writing', systemPrompt: '你是一个创意写作助手。帮助用户撰写文章、故事、邮件等。', version: '1.0.0' },
  { id: 'analyst', name: '数据分析', description: '数据分析和可视化建议', icon: '📊', category: 'analysis', systemPrompt: '你是一个数据分析专家。帮助用户理解数据、发现洞察、提供可视化建议。', version: '1.0.0' },
  { id: 'teacher', name: '学习导师', description: '解释概念、辅导学习', icon: '📚', category: 'writing', systemPrompt: '你是一个耐心的学习导师。用简单易懂的方式解释复杂概念。', version: '1.0.0' },
];

function loadCustomSkills(): any[] {
  try {
    if (!fs.existsSync(SKILLS_DIR)) return [];
    const files = fs.readdirSync(SKILLS_DIR).filter(f => f.endsWith('.json'));
    return files.map(f => {
      try {
        return JSON.parse(fs.readFileSync(path.join(SKILLS_DIR, f), 'utf-8'));
      } catch { return null; }
    }).filter(Boolean);
  } catch {
    return [];
  }
}

function isValidSkillId(id: string): boolean {
  return /^[a-zA-Z0-9_-]{1,64}$/.test(id) && !id.includes('..');
}

function saveSkillFile(skill: any): void {
  if (!isValidSkillId(skill.id)) throw new Error('技能ID格式无效');
  try { fs.mkdirSync(SKILLS_DIR, { recursive: true }); } catch {}
  fs.writeFileSync(path.join(SKILLS_DIR, `${skill.id}.json`), JSON.stringify(skill, null, 2), 'utf-8');
}

export function skillsRoutes(): Router {
  const router = Router();
  router.use(authMiddleware);

  // GET /api/skills — 列表
  router.get('/', (_req: Request, res: Response) => {
    const custom = loadCustomSkills();
    const all = [...BUILTIN_SKILLS, ...custom];
    res.json(all);
  });

  // GET /api/skills/remote-catalog — 远程目录（暂不支持）
  router.get('/remote-catalog', (_req: Request, res: Response) => {
    res.json({ success: true, skills: [] });
  });

  // POST /api/skills — 安装
  router.post('/', (req: Request, res: Response) => {
    try {
      const { skill } = req.body;
      if (!skill) {
        res.json({ success: false, error: '缺少 skill 数据' });
        return;
      }
      saveSkillFile(skill);
      logger.info(`技能已安装: ${skill.name}`);
      res.json({ success: true });
    } catch (e: any) {
      res.json({ success: false, error: e.message });
    }
  });

  // DELETE /api/skills/:id — 删除
  router.delete('/:id', (req: Request, res: Response) => {
    try {
      if (!isValidSkillId(String(req.params.id))) {
        res.status(400).json({ success: false, error: '技能ID格式无效' }); return;
      }
      const skillPath = path.join(SKILLS_DIR, `${req.params.id}.json`);
      if (fs.existsSync(skillPath)) {
        fs.unlinkSync(skillPath);
        res.json({ success: true });
      } else {
        res.json({ success: false, error: '技能不存在' });
      }
    } catch (e: any) {
      res.json({ success: false, error: e.message });
    }
  });

  // GET /api/skills/:id/export — 导出
  router.get('/:id/export', (req: Request, res: Response) => {
    try {
      if (!isValidSkillId(String(req.params.id))) {
        res.json({ json: null }); return;
      }
      const skillPath = path.join(SKILLS_DIR, `${req.params.id}.json`);
      if (fs.existsSync(skillPath)) {
        const json = fs.readFileSync(skillPath, 'utf-8');
        res.json({ json });
      } else {
        // 检查内置技能
        const builtin = BUILTIN_SKILLS.find(s => s.id === String(req.params.id));
        res.json({ json: builtin ? JSON.stringify(builtin) : null });
      }
    } catch (e: any) {
      res.json({ json: null });
    }
  });

  // POST /api/skills/import — 导入
  router.post('/import', (req: Request, res: Response) => {
    try {
      const { json } = req.body;
      if (!json) {
        res.json({ success: false, error: '缺少 json 数据' });
        return;
      }
      const skill = typeof json === 'string' ? JSON.parse(json) : json;
      skill.id = skill.id || uuidv4();
      saveSkillFile(skill);
      res.json({ success: true });
    } catch (e: any) {
      res.json({ success: false, error: e.message });
    }
  });

  return router;
}
