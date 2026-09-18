// 临时冒烟测试（跑完即删）：验证 src/shared/email-code.ts 的核心逻辑
import crypto from 'crypto';
import {
  hashPassword, verifyPassword, isLegacyHash,
  isQQEmail, normalizeEmail, maskEmail, VerificationCodeStore,
} from '../src/shared/email-code';

let pass = 0, fail = 0;
function ok(name: string, cond: boolean) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}`); }
}

console.log('— 密码哈希 —');
const h = hashPassword('abc123456');
ok('哈希格式 pbkdf2:salt:hash', /^pbkdf2:[0-9a-f]{32}:[0-9a-f]{128}$/.test(h));
ok('正确密码通过', verifyPassword('abc123456', h));
ok('错误密码拒绝', !verifyPassword('abc123457', h));
ok('空哈希拒绝', !verifyPassword('abc123456', ''));
ok('旧格式识别', isLegacyHash('deadbeef'));
const legacy = crypto.createHash('sha256').update('pass123' + 'xiaoxiaoyu-salt').digest('hex');
ok('旧 SHA-256 兼容', verifyPassword('pass123', legacy));

console.log('— QQ 邮箱校验 —');
ok('123456789@qq.com', isQQEmail('123456789@qq.com'));
ok('12345@qq.com（5位）', isQQEmail('12345@qq.com'));
ok('1234@qq.com（4位）拒绝', !isQQEmail('1234@qq.com'));
ok('0123456@qq.com（前导0）拒绝', !isQQEmail('0123456@qq.com'));
ok('abc@qq.com 拒绝', !isQQEmail('abc@qq.com'));
ok('123456789@163.com 拒绝', !isQQEmail('123456789@163.com'));
ok('大小写/空格归一', isQQEmail(' 123456@QQ.com '));
ok('normalizeEmail', normalizeEmail(' A@QQ.com ') === 'a@qq.com');

console.log('— 验证码仓库 —');
const store = new VerificationCodeStore({ ttlMs: 60_000, resendMs: 60_000, maxAttempts: 3 });
const r1 = store.issue('123456@qq.com');
ok('首次发放成功', r1.ok && /^\d{6}$/.test(r1.code!));
ok('重发被限流', !store.issue('123456@qq.com').ok);
ok('错误验证码拒绝', !store.verify('123456@qq.com', '000000').ok);
ok('未获取过的邮箱拒绝', !store.verify('999999@qq.com', '123456').ok);
ok('正确验证码通过', store.verify('123456@qq.com', r1.code!).ok);
ok('一次性使用（二次校验失败）', !store.verify('123456@qq.com', r1.code!).ok);

const store2 = new VerificationCodeStore({ ttlMs: 60_000, resendMs: 0, maxAttempts: 2 });
const r2 = store2.issue('777@qq.com');
store2.verify('777@qq.com', '111111');
store2.verify('777@qq.com', '111111');
ok('超过尝试次数后作废', !store2.verify('777@qq.com', r2.code!).ok);

const store3 = new VerificationCodeStore({ ttlMs: -1, resendMs: 0 });
const r3 = store3.issue('888@qq.com');
ok('过期验证码拒绝', !store3.verify('888@qq.com', r3.code!).ok);

const store4 = new VerificationCodeStore();
const r4 = store4.issue('666@qq.com');
store4.revoke('666@qq.com');
ok('revoke 后可校验失败（应重新获取）', !store4.verify('666@qq.com', r4.code!).ok);

console.log('— 验证码安全属性 —');
const store5 = new VerificationCodeStore({ resendMs: 0 });
const codes = new Set<string>();
for (let i = 0; i < 20; i++) {
  const r = store5.issue(`rand${i}@qq.com`);
  codes.add(r.code!);
}
ok('验证码为 6 位数字', [...codes].every(c => /^\d{6}$/.test(c)));
ok('多次生成不重复（随机源可用）', codes.size === 20, `去重后 ${codes.size}/20`);
const store6 = new VerificationCodeStore({ resendMs: 0 });
const r6 = store6.issue('fmt@qq.com');
ok('非 6 位数字输入直接拒绝', !store6.verify('fmt@qq.com', `${r6.code!}x`).ok && !store6.verify('fmt@qq.com', 'abcdef').ok);
const store7 = new VerificationCodeStore({ resendMs: 0, dailyLimit: 3 });
let sent = 0;
for (let i = 0; i < 5; i++) { if (store7.issue('cap@qq.com').ok) sent++; }
ok('每日发送上限生效', sent === 3, `实际发送 ${sent} 次`);
ok('超限提示可读', /今日验证码发送次数已达上限/.test(store7.issue('cap@qq.com').error || ''));

console.log('— 邮箱脱敏 —');
ok('长邮箱脱敏', maskEmail('123456789@qq.com') === '12***89@qq.com', maskEmail('123456789@qq.com'));
ok('短邮箱脱敏', maskEmail('abc@qq.com') === 'a***c@qq.com', maskEmail('abc@qq.com'));
ok('两位邮箱脱敏', maskEmail('ab@qq.com') === 'a***@qq.com', maskEmail('ab@qq.com'));
ok('非法输入不崩', maskEmail('') === '' && maskEmail('nope') === '***');

console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
