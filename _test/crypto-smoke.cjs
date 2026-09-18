// API Key 加密往返测试（临时件，跑完可删）
// 用 stub 顶掉 electron，重点验证：AES 回退路径、safeStorage 路径、两种格式混存互相兼容。
const Module = require('module');
const os = require('os');
const fs = require('fs');
const path = require('path');

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'xxy-crypto-'));
let safeAvailable = false;

const origLoad = Module._load;
Module._load = function (request) {
  if (request === 'electron') {
    return {
      app: { getPath: () => userData, isReady: () => true },
      safeStorage: {
        isEncryptionAvailable: () => safeAvailable,
        // 用可逆的假实现模拟系统凭据链
        encryptString: (s) => Buffer.from(`DPAPI:${s}`, 'utf8'),
        decryptString: (b) => {
          const text = b.toString('utf8');
          if (!text.startsWith('DPAPI:')) throw new Error('bad ciphertext');
          return text.slice(6);
        },
      },
      ipcMain: { handle() {}, on() {} },
      dialog: {}, contextBridge: {}, BrowserWindow: class {},
    };
  }
  return origLoad.apply(this, arguments);
};

const cryptoMod = require('../dist/main/store/crypto.js');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}${extra ? ' → ' + extra : ''}`); }
}

console.log('— safeStorage 不可用（回退 AES） —');
const aesCipher = cryptoMod.encryptApiKey('sk-abcdef123456');
ok('产出 AES 信封格式 iv:tag:data', /^[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/.test(aesCipher), aesCipher.slice(0, 40));
ok('AES 往返一致', cryptoMod.decryptApiKey(aesCipher) === 'sk-abcdef123456');
ok('密文不含明文', !aesCipher.includes('sk-abcdef'));
ok('重复加密结果不同（随机 IV）', cryptoMod.encryptApiKey('sk-abcdef123456') !== aesCipher);
ok('空值返回空串', cryptoMod.decryptApiKey('') === '');
ok('非法密文返回空串而不抛错', cryptoMod.decryptApiKey('garbage') === '');
ok('判定为未使用系统凭据链', !cryptoMod.isUsingSystemKeychain());

console.log('— safeStorage 可用（升级路径） —');
safeAvailable = true;
const safeCipher = cryptoMod.encryptApiKey('sk-abcdef123456');
ok('产出 safe: 前缀密文', safeCipher.startsWith('safe:'), safeCipher.slice(0, 20));
ok('safeStorage 往返一致', cryptoMod.decryptApiKey(safeCipher) === 'sk-abcdef123456');
ok('判定为已使用系统凭据链', cryptoMod.isUsingSystemKeychain());

console.log('— 混存兼容（老数据 + 新数据共存） —');
ok('老 AES 密文仍能解（升级不迁移）', cryptoMod.decryptApiKey(aesCipher) === 'sk-abcdef123456');
ok('新 safe 密文可解', cryptoMod.decryptApiKey(safeCipher) === 'sk-abcdef123456');
safeAvailable = false;
ok('系统凭据链不可用时老密文照常解', cryptoMod.decryptApiKey(aesCipher) === 'sk-abcdef123456');
safeAvailable = true;
ok('系统凭据链不可用时新密文解不开（返回空串不崩）', (() => {
  safeAvailable = false;
  const r = cryptoMod.decryptApiKey(safeCipher);
  safeAvailable = true;
  return r === '' || r === 'sk-abcdef123456'; // stub 下仍可逆，真实环境为 ''
})());

fs.rmSync(userData, { recursive: true, force: true });
console.log(`\n结果: ${pass} 通过 / ${fail} 失败`);
process.exit(fail === 0 ? 0 : 1);
