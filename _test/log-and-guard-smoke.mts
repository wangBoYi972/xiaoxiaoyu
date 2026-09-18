// 日志内核 + 登录封禁 冒烟测试（临时件，跑完可删）
import fs from 'fs';
import os from 'os';
import path from 'path';
import { LogCore } from '../src/shared/log-core';

let pass = 0, fail = 0;
function ok(name: string, cond: boolean, extra?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra ? ' → ' + extra : ''}`); }
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xxy-log-'));

console.log('— 日志级别过滤 —');
const core = new LogCore({ dir, scope: 'app', level: 'warn', console: false });
core.debug('debug-should-be-dropped');
core.info('info-should-be-dropped');
core.warn('warn-kept');
core.error('error-kept', new Error('boom'));
core.setLevel('debug');
core.info('info-after-level-change');

const files = fs.readdirSync(dir).filter(f => f.endsWith('.log'));
ok('生成了按天命名的日志文件', files.length === 1, files.join(','));
const content = fs.readFileSync(path.join(dir, files[0]), 'utf8');
ok('低于级别的日志被丢弃', !content.includes('debug-should-be-dropped') && !content.includes('info-should-be-dropped'));
ok('warn/error 落盘', content.includes('warn-kept') && content.includes('error-kept'));
ok('error 带堆栈', content.includes('boom') && content.includes('at '));
ok('改级别后生效', content.includes('info-after-level-change'));
ok('文件名带日期', /^app-\d{8}\.log$/.test(files[0]), files[0]);

console.log('— 单文件超限滚动 —');
const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'xxy-log2-'));
const small = new LogCore({ dir: dir2, scope: 'roll', level: 'info', console: false, maxFileBytes: 200 });
for (let i = 0; i < 40; i++) small.info(`line-${i}-${'x'.repeat(30)}`);
const rollFiles = fs.readdirSync(dir2).sort();
ok('产生了滚动分片', rollFiles.length > 1, rollFiles.join(','));
ok('分片命名带序号', rollFiles.some(f => /roll-\d{8}\.1\.log$/.test(f)), rollFiles.join(','));
const maxSize = Math.max(...rollFiles.map(f => fs.statSync(path.join(dir2, f)).size));
ok('单文件不超过上限太多', maxSize < 400, String(maxSize));

console.log('— 超期清理 —');
const dir3 = fs.mkdtempSync(path.join(os.tmpdir(), 'xxy-log3-'));
const old = path.join(dir3, 'clean-20200101.log');
fs.writeFileSync(old, 'old', 'utf8');
const tenDaysAgo = Date.now() - 10 * 24 * 60 * 60 * 1000;
fs.utimesSync(old, new Date(tenDaysAgo), new Date(tenDaysAgo));
const cleaner = new LogCore({ dir: dir3, scope: 'clean', level: 'info', console: false, retainDays: 7 });
cleaner.info('trigger-cleanup');
ok('超过保留天数的日志被删除', !fs.existsSync(old));

console.log('— 登录失败封禁 —');
const { checkLogin, recordFailure, recordSuccess, clientKey } = await import('../src/server/middleware/login-guard');
const ip = '10.0.0.1';
ok('初始放行', checkLogin(ip).allowed);
for (let i = 0; i < 4; i++) recordFailure(ip);
ok('4 次失败后仍放行', checkLogin(ip).allowed);
recordFailure(ip); // 第 5 次
const blocked = checkLogin(ip);
ok('第 5 次失败后封禁', !blocked.allowed);
ok('带重试等待时间', (blocked.retryAfterSec || 0) > 0);
ok('提示为中文', /登录失败次数过多/.test(blocked.message || ''), blocked.message);
recordSuccess(ip);
ok('成功后解除封禁', checkLogin(ip).allowed);

const ip2 = '10.0.0.2';
for (let i = 0; i < 6; i++) recordFailure(ip2);
const first = checkLogin(ip2).retryAfterSec || 0;
const ip3 = '10.0.0.3';
for (let i = 0; i < 7; i++) recordFailure(ip3);
const second = checkLogin(ip3).retryAfterSec || 0;
ok('封禁时长随失败次数递增', second > first, `${first}s → ${second}s`);
ok('clientKey 兜底', clientKey({ ip: '1.2.3.4' } as any) === '1.2.3.4');

fs.rmSync(dir, { recursive: true, force: true });
fs.rmSync(dir2, { recursive: true, force: true });
fs.rmSync(dir3, { recursive: true, force: true });
console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
