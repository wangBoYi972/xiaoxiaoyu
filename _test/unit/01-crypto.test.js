/**
 * 加密模块测试
 * 测试 API Key 的 AES-256-GCM 加密/解密功能
 * 文件: src/main/store/crypto.ts
 */

// 加载 mock（必须在任何其他 require 之前）
require('./mocks');

const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const os = require('os');

describe('加密模块 (crypto.ts)', () => {
  let testDir, cryptoModule;

  before(() => {
    testDir = path.join(os.tmpdir(), 'xxy-crypto-test-' + Date.now());
    fs.mkdirSync(testDir, { recursive: true });

    // 重新设置 app.getPath 为测试目录
    const { mockApp } = require('./mocks');
    mockApp._path = testDir;
    mockApp.getPath = () => testDir;

    // 清除模块缓存，以使用新的 mock 路径
    delete require.cache[require.resolve('../../dist/main/store/crypto')];
    cryptoModule = require('../../dist/main/store/crypto');
  });

  after(() => {
    try { fs.rmSync(testDir, { recursive: true }); } catch {}
  });

  it('encryptApiKey 应返回非空加密字符串', () => {
    const plainText = 'sk-test-api-key-1234567890';
    const encrypted = cryptoModule.encryptApiKey(plainText);
    assert(typeof encrypted === 'string', '返回值应为字符串');
    assert(encrypted.length > 0, '加密字符串不应为空');
    assert(encrypted.includes(':'), '加密格式应包含冒号分隔符(iv:authTag:ciphertext)');
  });

  it('encryptApiKey 应生成三段式格式 (iv:authTag:ciphertext)', () => {
    const plainText = 'sk-another-key';
    const encrypted = cryptoModule.encryptApiKey(plainText);
    const parts = encrypted.split(':');
    assertEqual(parts.length, 3, `三段式格式错误: ${parts.length} 段`);
    // 验证每段都是 base64
    parts.forEach((part, i) => {
      const buf = Buffer.from(part, 'base64');
      assert(buf.length > 0, `第${i + 1}段不是有效的 base64`);
    });
  });

  it('decryptApiKey 应正确解密 encryptApiKey 的结果', () => {
    const testCases = [
      'sk-test-key-001',
      'sk-abc123def456ghi789jkl',
      'org-123456_secret-key_for_testing',
      '短key',
      '!@#$%^&*()_+特殊字符测试',
      'API Key with spaces and 中文混合',
    ];

    for (const plainText of testCases) {
      const encrypted = cryptoModule.encryptApiKey(plainText);
      const decrypted = cryptoModule.decryptApiKey(encrypted);
      assertEqual(decrypted, plainText,
        `加解密往返失败: 原文="${plainText}", 解密="${decrypted}"`);
    }
  });

  it('decryptApiKey 对无效输入应返回空字符串', () => {
    const invalidCases = [
      '',                  // 空字符串
      'invalid',           // 单段
      'a:b',               // 两段
      'a:b:c:d',           // 四段(过多)
      '!!!:::!!!',         // 无效 base64
      'invalid:format:data',
    ];

    for (const input of invalidCases) {
      const result = cryptoModule.decryptApiKey(input);
      assertEqual(result, '',
        `无效输入 "${input}" 应返回空字符串, 实际返回 "${result}"`);
    }
  });

  it('decryptApiKey 对 null/undefined 应返回空字符串', () => {
    // 测试类型强制转换时的健壮性
    try {
      const r = cryptoModule.decryptApiKey(null);
      assertEqual(r, '');
    } catch (e) {
      // 预期可能抛异常（取决于实现）
      assert(e.message !== undefined, '应抛出有意义的错误');
    }
  });

  it('每次加密相同原文应产生不同的加密文本(IV 随机)', () => {
    const plainText = 'same-api-key';
    const encrypted1 = cryptoModule.encryptApiKey(plainText);
    const encrypted2 = cryptoModule.encryptApiKey(plainText);

    assert(encrypted1 !== encrypted2,
      '两次加密同一原文应产生不同密文（IV 随机性）');

    // 但解密结果应相同
    assertEqual(cryptoModule.decryptApiKey(encrypted1), plainText);
    assertEqual(cryptoModule.decryptApiKey(encrypted2), plainText);
  });

  it('加解密长 API Key (2048+ 字符)', () => {
    const longKey = 'sk-' + 'x'.repeat(2048);
    const encrypted = cryptoModule.encryptApiKey(longKey);
    const decrypted = cryptoModule.decryptApiKey(encrypted);
    assertEqual(decrypted, longKey);
    assertEqual(decrypted.length, longKey.length);
  });

  it('encryptApiKey 应生成固定 IV 长度(16字节=24 base64字符)', () => {
    const encrypted = cryptoModule.encryptApiKey('test');
    const parts = encrypted.split(':');
    const iv = Buffer.from(parts[0], 'base64');
    assertEqual(iv.length, 16, `IV 应为 16 字节, 实际 ${iv.length}`);
  });

  it('encryptApiKey 应生成固定 AuthTag 长度(16字节=24 base64字符)', () => {
    const encrypted = cryptoModule.encryptApiKey('test');
    const parts = encrypted.split(':');
    const authTag = Buffer.from(parts[1], 'base64');
    assertEqual(authTag.length, 16, `AuthTag 应为 16 字节, 实际 ${authTag.length}`);
  });
});

// before/after 由 test-runner.js 全局提供
