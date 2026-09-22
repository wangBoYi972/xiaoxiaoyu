import { ipcMain, app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as http from 'http';
import { logger } from '../utils/logger';

export interface Skill {
  id: string; name: string; description: string; icon: string;
  category: string; systemPrompt: string; temperature?: number;
  maxTokens?: number; version: string; author?: string; downloadUrl?: string;
}

const BUILTIN_SKILLS: Skill[] = [
  { id: 'general',    name: '通用助手',   description: '多领域智能问答',           icon: '🤖', category: 'utility',   systemPrompt: '你是一位可靠的通用助手。请先准确理解用户目标，再给出清晰、可执行且符合事实的回答；信息不足时说明假设或提出必要的澄清问题。', version: '1.0' },
  { id: 'coder',      name: '代码大师',   description: '编程、调试、架构设计、代码审查', icon: '💻', category: 'coding',    systemPrompt: '你是一位资深软件架构师，精通多种编程语言。请给出最佳实践、完整代码示例和注意事项，代码要规范有注释。', version: '1.0' },
  { id: 'translator', name: '翻译专家',   description: '中英日韩多语种精准翻译',   icon: '🌐', category: 'writing',   systemPrompt: '你是一位专业翻译，精通中英日韩等多国语言。请准确、流畅地翻译，保留原文的语气、风格和文化背景。', version: '1.0' },
  { id: 'writer',     name: '文案策划',   description: '营销文案、品牌策划、创意写作', icon: '✍️', category: 'writing',   systemPrompt: '你是一位资深文案策划，擅长品牌营销和创意写作。请用有感染力、符合品牌调性的中文撰写，注意读者心理和转化效果。', version: '1.0' },
  { id: 'analyst',    name: '数据分析',   description: '数据解读、可视化建议、报告生成', icon: '📊', category: 'analysis',  systemPrompt: '你是一位资深数据分析师。请对数据给出深刻洞见，使用清晰的层次结构和可视化建议，必要时给出Python/R代码。', version: '1.0' },
  { id: 'teacher',    name: '学习导师',   description: '概念讲解、知识梳理、考试辅导', icon: '📚', category: 'utility',   systemPrompt: '你是一位经验丰富的老师，擅长把复杂概念简单化。请用通俗易懂的方式解释，给出实际例子帮助理解，善于引导学生思考。', version: '1.0' },
  { id: 'creative',   name: '创意灵感',   description: '头脑风暴、故事创作、创新思维', icon: '💡', category: 'creative',  systemPrompt: '你是一位充满创意的头脑风暴引导者。请从多个角度提供新颖独特、突破常规的视角和建议，激发灵感火花。', version: '1.0' },
  { id: 'summary',    name: '摘要提炼',   description: '长文总结、关键要点提取、会议纪要', icon: '📝', category: 'utility',   systemPrompt: '你善于从海量信息中提炼关键要点。请用简洁清晰的语言总结核心内容，使用分层次的结构化列表格式呈现。', version: '1.0' },
  { id: 'excel',      name: 'Excel专家',  description: '表格公式、数据透视、VBA自动化', icon: '📋', category: 'coding',    systemPrompt: '你是一位Excel和数据分析专家。精通复杂公式、数据透视表、VBA宏和Power Query，能高效解决各种数据处理问题。', version: '1.0' },
  { id: 'interview',  name: '面试教练',   description: '模拟面试、简历优化、谈薪指导', icon: '🎤', category: 'utility',   systemPrompt: '你是一位资深HR面试官和职业规划师。请模拟真实面试场景，给出针对性的答题策略，帮助优化简历和面试表现。', version: '1.0' },
  { id: 'health',     name: '健康顾问',   description: '营养建议、运动计划、健康科普', icon: '🩺', category: 'utility',   systemPrompt: '你是一位专业的健康管理顾问。请基于科学提供饮食、运动和生活方式的建议。注意：不提供医疗诊断，严重问题请就医。', version: '1.0' },
  { id: 'legal',      name: '法律助手',   description: '合同审查、法律常识、风险提示', icon: '⚖️', category: 'utility',   systemPrompt: '你是一位法律顾问助手。请基于法律法规提供参考意见和风险提示。注意：不构成正式法律意见，重大问题请咨询专业律师。', version: '1.0' },
  { id: 'poet',       name: '诗词创作',   description: '古诗词、现代诗、歌词创作',   icon: '🎭', category: 'creative',  systemPrompt: '你是一位才华横溢的诗人，精通古今诗词创作。请用优美的语言和精妙的意象进行创作，注重韵律和意境。', version: '1.0' },
  { id: 'marketing',  name: '营销策划',   description: '营销方案、活动策划、增长策略', icon: '📈', category: 'creative',  systemPrompt: '你是一位资深营销策划专家。请制定数据驱动的营销策略，涵盖用户洞察、渠道选择、内容策略和效果评估。', version: '1.0' },
  { id: 'uxdesigner', name: 'UX设计师',   description: '用户体验设计、交互设计建议',   icon: '🎨', category: 'creative',  systemPrompt: '你是一位资深UX设计师。请从用户视角出发，对界面设计、交互流程和信息架构给出专业建议。', version: '1.0' },
  { id: 'seo',        name: 'SEO优化师',  description: '搜索引擎优化、关键词策略',     icon: '🔍', category: 'writing',   systemPrompt: '你是一位SEO优化专家。精通搜索引擎算法，请给出基于最新SEO最佳实践的优化建议和内容策略。', version: '1.0' },
  { id: 'devops',     name: 'DevOps工程师', description: 'CI/CD、容器化、云原生架构',   icon: '⚙️', category: 'coding',    systemPrompt: '你是一位资深DevOps工程师。精通Docker、Kubernetes、Terraform和CI/CD，请给出生产级的运维解决方案。', version: '1.0' },
  { id: 'prompteng',  name: '提示词工程师', description: 'AI提示词优化与工程化',        icon: '🔮', category: 'coding',    systemPrompt: '你是一位提示词工程专家。精通CoT、Few-Shot、ReAct等高级Prompt技术，请帮助设计高效准确的提示词模板。', version: '1.0' },
  { id: 'blogger',    name: '博客写手',   description: '博客文章、技术文档、教程编写', icon: '✒️', category: 'writing',   systemPrompt: '你是一位资深技术博客作者。请写出结构清晰、易读易懂的技术文章，包含代码示例和实战经验分享。', version: '1.0' },
  { id: 'sqlmaster',  name: 'SQL大师',    description: 'SQL优化、数据库设计、复杂查询', icon: '🗄️', category: 'coding',    systemPrompt: '你是一位数据库架构师和SQL优化专家。精通MySQL、PostgreSQL等，请对SQL查询给出最优方案，关注索引优化和执行计划。', version: '1.0' },
  { id: 'apidesign',  name: 'API设计师',  description: 'RESTful/GraphQL API设计与文档', icon: '🔌', category: 'coding',    systemPrompt: '你是一位API设计专家。精通RESTful、GraphQL和gRPC设计规范，请给出规范的API设计方案。', version: '1.0' },
  { id: 'gamdev',     name: '游戏策划',   description: '游戏设计、关卡策划、数值平衡', icon: '🎮', category: 'creative',  systemPrompt: '你是一位资深游戏策划。精通游戏机制设计、剧情叙事和数值平衡，请从玩家体验出发给出创意设计方案。', version: '1.0' },
  { id: 'psycho',     name: '心理咨询',   description: '情绪疏导、压力管理、自我认知', icon: '🧠', category: 'utility',   systemPrompt: '你是一位专业心理咨询师。请以共情和倾听的方式帮助用户探索内心世界。注意：紧急情况请拨打当地心理危机热线。', version: '1.0' },
  { id: 'parenting',  name: '育儿顾问',   description: '科学育儿、亲子沟通、教育规划', icon: '👶', category: 'utility',   systemPrompt: '你是一位育儿教育顾问。请基于儿童发展心理学提供科学的育儿建议和亲子沟通技巧。', version: '1.0' },
  { id: 'finance',    name: '理财规划师', description: '个人理财、投资分析、财务规划', icon: '💰', category: 'analysis',  systemPrompt: '你是一位专业理财规划师。请基于现代投资理论给出理财建议。注意：不构成具体投资建议，投资有风险。', version: '1.0' },
  { id: 'career',     name: '职业规划师', description: '职业规划、简历优化、职场建议', icon: '🎯', category: 'utility',   systemPrompt: '你是一位资深职业规划师。请根据用户职业背景提供个性化的职业规划、简历优化和面试准备建议。', version: '1.0' },
  { id: 'storytell',  name: '故事大王',   description: '小说创作、故事构思、剧本写作', icon: '📖', category: 'creative',  systemPrompt: '你是一位小说家和剧作家。请创作引人入胜的故事，塑造立体的角色，构建扣人心弦的剧情，语言要有画面感。', version: '1.0' },
  { id: 'architect',  name: '架构设计师', description: '系统架构、技术选型、性能优化', icon: '🏗️', category: 'coding',    systemPrompt: '你是一位资深系统架构师。精通微服务和云原生架构，请从高可用高扩展角度给出架构设计方案和技术选型对比。', version: '1.0' },
];

function isValidSkillId(id: string): boolean {
  return /^[a-zA-Z0-9_-]{1,64}$/.test(id) && !id.includes('..');
}

/** 确保导入的自定义技能也有可执行的模型行为，而非只显示一个名称。 */
function withUsablePrompt(skill: Skill): Skill {
  if (skill.systemPrompt?.trim()) return skill;
  return {
    ...skill,
    systemPrompt: `你正在以「${skill.name}」技能协助用户。请围绕${skill.description || '用户的当前目标'}给出专业、清晰、可执行的回答；不要声称完成了未经实际执行的操作。`,
  };
}

function getSkillsDir(): string {
  const dir = path.join(app.getPath('userData'), 'skills');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getRepoUrl(): string {
  try {
    const { getDatabase } = require('../store/database');
    const stmt = getDatabase().prepare('SELECT value FROM settings WHERE key = ?');
    stmt.bind(['skillRepoUrl']);
    if (stmt.step()) { const v = stmt.getAsObject().value as string; stmt.free(); return v || ''; }
    stmt.free();
  } catch {}
  return '';  // 默认不联网，需在设置中配置技能仓库地址
}

function httpGet(url: string, timeout = 10000): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, { timeout }, (res) => {
      if (res.statusCode === 302 && res.headers.location) {
        return httpGet(res.headers.location, timeout).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode}`)); }
      let body = '';
      res.on('data', (chunk: Buffer) => body += chunk.toString());
      res.on('end', () => resolve(body));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function loadAllSkills(): Skill[] {
  const skills: Skill[] = [...BUILTIN_SKILLS];
  try {
    const dir = getSkillsDir();
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
    for (const f of files) {
      try {
        const raw = fs.readFileSync(path.join(dir, f), 'utf-8');
        const s = JSON.parse(raw) as Skill;
        if (s.id && s.name && s.systemPrompt !== undefined) {
          const existingIdx = skills.findIndex((x) => x.id === s.id);
          if (existingIdx >= 0) skills[existingIdx] = s;
          else skills.push(s);
        }
      } catch {}
    }
  } catch {}
  return skills.map(withUsablePrompt);
}

export function registerSkillsHandlers(): void {
  // 列出所有技能（本地 + 内置）
  ipcMain.handle('skills:list', () => loadAllSkills());

  // 从远程仓库获取技能目录
  ipcMain.handle('skills:remote-catalog', async () => {
    try {
      const url = getRepoUrl();
      if (!url) return { success: false, error: '未配置技能仓库地址' };
      logger.info('获取远程技能目录: ' + url);
      const raw = await httpGet(url);
      const data = JSON.parse(raw) as { skills?: Skill[] } | Skill[];
      const skills = Array.isArray(data) ? data : (data.skills || []);
      // 过滤掉本地已安装的（内置 + 已保存的JSON）
      const installed = loadAllSkills();
      const installedIds = new Set(installed.map((s) => s.id));
      return { success: true, skills: skills.filter((s) => !installedIds.has(s.id)) };
    } catch (e) {
      return { success: false, error: (e as Error).message, skills: [] };
    }
  });

  // URL 白名单 - 仅允许从可信域名下载技能
  function isSkillUrlAllowed(url: string): boolean {
    try {
      const parsed = new URL(url);
      // 仅允许 HTTPS
      if (parsed.protocol !== 'https:') return false;
      // 白名单域名
      const allowed = ['raw.githubusercontent.com', 'gist.githubusercontent.com', 'cdn.jsdelivr.net'];
      return allowed.some(d => parsed.hostname === d || parsed.hostname.endsWith('.' + d));
    } catch { return false; }
  }

  // 从URL下载安装技能
  ipcMain.handle('skills:install', async (_e, data: { url?: string; skill?: Skill }) => {
    try {
      if (data.skill && data.skill.id && data.skill.name && isValidSkillId(data.skill.id)) {
        const filePath = path.join(getSkillsDir(), `${data.skill.id}.json`);
        fs.writeFileSync(filePath, JSON.stringify(data.skill, null, 2), 'utf-8');
        return { success: true };
      }
      if (data.url) {
        if (!isSkillUrlAllowed(data.url)) {
          return { success: false, error: 'URL 不在允许的域名列表中' };
        }
        logger.info('从URL下载技能: ' + data.url);
        const raw = await httpGet(data.url, 30000);
        const skill = JSON.parse(raw) as Skill;
        if (!skill.id || !skill.name || !isValidSkillId(skill.id)) return { success: false, error: '技能格式无效' };
        const filePath = path.join(getSkillsDir(), `${skill.id}.json`);
        fs.writeFileSync(filePath, raw, 'utf-8');
        return { success: true };
      }
      return { success: false, error: '请求数据无效' };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  });

  ipcMain.handle('skills:delete', (_e, id: string) => {
    if (!isValidSkillId(id)) return { success: false, error: '技能ID格式无效' };
    if (BUILTIN_SKILLS.find((s) => s.id === id)) {
      return { success: false, error: '内置技能不能删除' };
    }
    try {
      const fp = path.join(getSkillsDir(), `${id}.json`);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
      return { success: true };
    } catch (e) { return { success: false, error: (e as Error).message }; }
  });

  ipcMain.handle('skills:export', (_e, id: string) => {
    const skill = loadAllSkills().find((s) => s.id === id);
    return skill ? JSON.stringify(skill, null, 2) : null;
  });

  ipcMain.handle('skills:import', (_e, jsonStr: string) => {
    try {
      const skill = JSON.parse(jsonStr) as Skill;
      if (!skill.id || !skill.name) return { success: false, error: '格式无效' };
      fs.writeFileSync(path.join(getSkillsDir(), `${skill.id}.json`), jsonStr, 'utf-8');
      return { success: true };
    } catch (e) { return { success: false, error: (e as Error).message }; }
  });
}
