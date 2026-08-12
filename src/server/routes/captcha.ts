// 验证码路由 — 密码学安全随机数
import { Router, Request, Response } from 'express';
import svgCaptcha from 'svg-captcha';
import crypto from 'crypto';

const captchaStore = new Map<string, { answer: string; expires: number }>();

// 每 5 分钟清理过期验证码
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of captchaStore) {
    if (val.expires < now) captchaStore.delete(key);
  }
}, 300000);

function generateKey(): string {
  return crypto.randomBytes(12).toString('base64url');
}

export function captchaRoutes(): Router {
  const router = Router();

  router.get('/', (_req: Request, res: Response) => {
    const captcha = svgCaptcha.createMathExpr({
      mathMin: 1,
      mathMax: 20,
      mathOperator: '+',
    });

    const key = generateKey();
    captchaStore.set(key, {
      answer: captcha.text,
      expires: Date.now() + 5 * 60 * 1000,
    });

    res.json({ key, svg: captcha.data });
  });

  return router;
}

export function verifyCaptcha(key: string, code: string): boolean {
  const entry = captchaStore.get(key);
  if (!entry) return false;
  // 验证后立即销毁，防止重放
  captchaStore.delete(key);
  if (entry.expires < Date.now()) return false;
  return String(code).trim() === entry.answer;
}
