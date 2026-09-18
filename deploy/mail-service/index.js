/**
 * 小小榆 · 在线发码服务
 * ------------------------------------------------------------------
 * 只做一件事：用你自己的 QQ 邮箱给别人发注册/重置密码的验证码。
 * 授权码只存在服务端环境变量里，永远不会下发到任何客户端。
 *
 * 无状态设计：验证码由 HMAC(email|purpose|时间窗) 推导，不存内存，
 * 所以云函数多实例 / 冷启动都不会失效。
 *
 * 环境变量（必须）：
 *   SMTP_USER     发件邮箱，例如 835376335@qq.com
 *   SMTP_PASS     QQ 邮箱授权码（不是 QQ 密码！）
 *   APP_TOKEN     客户端调用凭证（随便起一串长随机串，客户端要带同样的值）
 *   CODE_SECRET   验证码签名密钥（随便起一串长随机串，换了会让已发出的验证码失效）
 * 可选：
 *   SMTP_HOST     默认 smtp.qq.com
 *   SMTP_PORT     默认 465（SSL）
 *   CODE_TTL      验证码有效分钟数，默认 10
 *
 * 接口：
 *   GET  /health
 *   POST /send-code   { email, purpose?: 'register'|'reset' }
 *   POST /verify-code { email, code }
 * 鉴权：请求头 X-App-Token: <APP_TOKEN>
 */
const nodemailer = require('nodemailer');
const crypto = require('crypto');

const SMTP_HOST = process.env.SMTP_HOST || 'smtp.qq.com';
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const APP_TOKEN = process.env.APP_TOKEN || '';
const CODE_SECRET = process.env.CODE_SECRET || '';
const CODE_TTL_MIN = Number(process.env.CODE_TTL || 10);

// 极简内存限流：同一个邮箱 60 秒一次、10 分钟最多 5 次
const hits = new Map();
function rateLimit(key) {
  const now = Date.now();
  const list = (hits.get(key) || []).filter((t) => now - t < 10 * 60 * 1000);
  if (list.length >= 5) return false;
  if (list.length && now - list[list.length - 1] < 60 * 1000) return false;
  list.push(now);
  hits.set(key, list);
  return true;
}

function isQQEmail(email) {
  return /^[1-9]\d{4,10}@qq\.com$/i.test(String(email || '').trim());
}

/** 当前时间窗序号（每 CODE_TTL_MIN 分钟一个窗） */
function windowIndex(offset = 0) {
  return Math.floor(Date.now() / (CODE_TTL_MIN * 60 * 1000)) - offset;
}

/** 推导验证码：同一邮箱在同一个时间窗内恒定，便于重发 */
function deriveCode(email, purpose, win) {
  const raw = crypto.createHmac('sha256', CODE_SECRET).update(`${email}|${purpose}|${win}`).digest();
  const n = raw.readUInt32BE(0) % 1000000;
  return String(n).padStart(6, '0');
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 1e6) req.destroy(); });
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(new Error('请求体不是合法 JSON')); }
    });
    req.on('error', reject);
  });
}

function json(res, status, obj) {
  const body = JSON.stringify(obj);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-App-Token');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.end(body);
}

let transporter = null;
function getTransporter() {
  if (transporter) return transporter;
  if (!SMTP_USER || !SMTP_PASS) throw new Error('SMTP_NOT_CONFIGURED');
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
  return transporter;
}

function mailHtml(code, purpose) {
  const title = purpose === 'reset' ? '重置密码' : '注册账号';
  return `<div style="font-family:-apple-system,'Microsoft YaHei',sans-serif;padding:24px;background:#f6f7fb">
  <div style="max-width:420px;margin:0 auto;background:#fff;border-radius:12px;padding:28px">
    <h2 style="margin:0 0 8px;font-size:18px">小小榆 · ${title}验证码</h2>
    <p style="color:#666;font-size:14px;margin:0 0 18px">你的验证码是（${CODE_TTL_MIN} 分钟内有效）：</p>
    <div style="font-size:32px;font-weight:700;letter-spacing:6px;text-align:center;padding:16px;background:#f2f4ff;border-radius:8px">${code}</div>
    <p style="color:#999;font-size:12px;margin:18px 0 0">如果不是你本人操作，请忽略这封邮件。</p>
  </div></div>`;
}

async function handle(req, res) {
  const url = (req.url || '').split('?')[0];
  const method = (req.method || 'GET').toUpperCase();

  if (method === 'OPTIONS') { json(res, 204, {}); return; }

  if (url === '/health' || url === '/') {
    json(res, 200, { ok: true, service: 'xiaoxiaoyu-mail', smtpConfigured: !!(SMTP_USER && SMTP_PASS) });
    return;
  }

  if (method !== 'POST') { json(res, 405, { ok: false, error: '方法不允许' }); return; }

  // 鉴权：客户端必须带同样的 APP_TOKEN，避免你的发件邮箱被别人白嫖
  const token = (req.headers['x-app-token'] || '').toString();
  if (!APP_TOKEN || token !== APP_TOKEN) {
    json(res, 401, { ok: false, error: '缺少或错误的调用凭证', code: 'BAD_TOKEN' });
    return;
  }
  if (!CODE_SECRET) { json(res, 500, { ok: false, error: '服务端未配置 CODE_SECRET' }); return; }

  let body;
  try { body = await readBody(req); } catch (e) { json(res, 400, { ok: false, error: e.message }); return; }

  const email = String(body.email || '').trim().toLowerCase();
  if (!isQQEmail(email)) { json(res, 400, { ok: false, error: '请输入正确的 QQ 邮箱' }); return; }

  const purpose = body.purpose === 'reset' ? 'reset' : 'register';

  try {
    if (url === '/send-code') {
      if (!rateLimit(email + ':' + purpose)) {
        json(res, 429, { ok: false, error: '发送过于频繁，请稍后再试' }); return;
      }
      const code = deriveCode(email, purpose, windowIndex());
      await getTransporter().sendMail({
        from: `"小小榆" <${SMTP_USER}>`,
        to: email,
        subject: `【小小榆】${purpose === 'reset' ? '重置密码' : '注册'}验证码 ${code}`,
        html: mailHtml(code, purpose),
      });
      json(res, 200, { ok: true, message: '验证码已发送，请查收 QQ 邮箱（注意垃圾邮件箱）' });
      return;
    }

    if (url === '/verify-code') {
      const input = String(body.code || '').trim();
      // 允许"当前窗 + 上一个窗"，避免卡在窗口边界时误判失效
      const ok = [0, 1].some((off) => deriveCode(email, purpose, windowIndex(off)) === input);
      json(res, 200, ok ? { ok: true } : { ok: false, error: '验证码不正确或已过期' });
      return;
    }

    json(res, 404, { ok: false, error: '接口不存在' });
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    if (msg === 'SMTP_NOT_CONFIGURED') {
      json(res, 500, { ok: false, error: '服务端未配置发件邮箱', code: 'SMTP_NOT_CONFIGURED' });
      return;
    }
    json(res, 500, { ok: false, error: '发信失败：' + msg });
  }
}

// 本地直跑：node index.js  （监听 PORT，默认 8787）
if (require.main === module) {
  const http = require('http');
  const port = Number(process.env.PORT || 8787);
  http.createServer(handle).listen(port, () => {
    console.log(`小小榆发码服务已启动: http://127.0.0.1:${port}  (SMTP: ${SMTP_USER || '未配置'})`);
  });
}

// 云函数（腾讯云 SCF / 阿里云 FC 等）导出入口
module.exports = { handler: handle, main_handler: handle };
