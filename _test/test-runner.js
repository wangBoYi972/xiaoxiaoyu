/**
 * 小小榆软件 - 完整测试运行器
 * 收集并运行所有单元测试和集成测试，输出汇总报告
 */

const path = require('path');
const fs = require('fs');

let total = 0;
let passed = 0;
let failed = 0;
const failures = [];

// ===== 测试框架 =====
let pendingBefore = null;
let pendingAfter = null;
const pendingTests = [];

function describe(name, fn) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`   ${name}`);
  console.log(`${'='.repeat(60)}`);

  // 保存进入时的状态，fn() 内的 before() 可能覆盖 pendingBefore
  // 嵌套 describe 自然继承当前 pendingBefore（不重置）
  const savedBefore = pendingBefore;
  const savedAfter = pendingAfter;

  fn();

  // 恢复父级状态（describe 内的 before() 不影响兄弟 describe）
  pendingBefore = savedBefore;
  pendingAfter = savedAfter;
}

function it(name, fn) {
  // 在注册时捕获当前 describe 的 before/after
  const capturedBefore = pendingBefore;
  const capturedAfter = pendingAfter;

  const testFn = async () => {
    total++;
    try {
      // 执行捕获的 before（每个 describe 的 before 只执行一次）
      if (capturedBefore && !capturedBefore._executed) {
        await capturedBefore();
        capturedBefore._executed = true;
      }
      await fn();
      passed++;
      console.log(`  \x1b[32m✓\x1b[0m ${name}`);
    } catch (e) {
      failed++;
      console.log(`  \x1b[31m✗\x1b[0m ${name}`);
      console.log(`    \x1b[31m错误:\x1b[0m ${e.message}`);
      failures.push({ name, error: e.message, stack: e.stack });
    }
  };
  pendingTests.push(testFn);
}

function before(fn) {
  pendingBefore = fn;
}
function after(fn) {
  pendingAfter = fn;
  if (typeof process.on === 'function') {
    process.on('exit', fn);
  }
}

function assert(condition, message = '断言失败') {
  if (!condition) throw new Error(message);
}

function assertEqual(actual, expected, message) {
  const actualStr = JSON.stringify(actual);
  const expectedStr = JSON.stringify(expected);
  if (actualStr !== expectedStr) {
    throw new Error(message || `期望 ${expectedStr}, 实际 ${actualStr}`);
  }
}

function assertThrows(fn, message) {
  try {
    fn();
    throw new Error(message || '期望抛出异常但没有');
  } catch (e) {
    if (e.message === message) throw e;
  }
}

// 导出测试框架
global.describe = describe;
global.it = it;
global.assert = assert;
global.assertEqual = assertEqual;
global.assertThrows = assertThrows;
global.before = before;
global.after = after;

// ===== 核心：收集并运行测试 =====
async function runAllTests() {
  const testDirs = [
    { dir: 'unit', label: '单元测试' },
    { dir: 'integration', label: '集成测试' },
  ];

  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║      小小榆 (XiaoXiaoYu) v3.0.0  测试套件        ║');
  console.log('╚══════════════════════════════════════════════════════╝');

  let totalFiles = 0;
  const allFiles = [];

  for (const { dir, label } of testDirs) {
    const dirPath = path.join(__dirname, dir);
    if (!fs.existsSync(dirPath)) {
      console.log(`\n  ⚠ ${label}目录不存在: ${dirPath}`);
      continue;
    }
    const files = fs.readdirSync(dirPath)
      .filter(f => f.endsWith('.test.js'))
      .sort();

    if (files.length > 0) {
      totalFiles += files.length;
      allFiles.push({ dir, label, files });
    }
  }

  console.log(`\n发现 ${totalFiles} 个测试文件\n`);

  for (const { dir, label, files } of allFiles) {
    console.log(`\n  ┌─ ${label} (${files.length} 个文件) ───────────────┐`);

    for (const file of files) {
      pendingTests.length = 0;  // 清空待执行测试
      pendingBefore = null;      // 重置 describe 状态
      pendingAfter = null;
      try {
        require(path.join(__dirname, dir, file));
      } catch (e) {
        console.log(`  \x1b[31m✗\x1b[0m 加载测试文件失败: ${file}`);
        console.log(`    ${e.message}`);
        if (e.stack) {
          const stackLines = e.stack.split('\n').slice(1, 4);
          console.log(`    ${stackLines.join('\n    ')}`);
        }
        failed++;
        failures.push({ name: `加载 ${dir}/${file}`, error: e.message });
        continue;
      }

      // 运行该文件中的所有测试
      for (const testFn of pendingTests) {
        await testFn();
      }
    }
    console.log(`  └────────────────────────────────────────────┘`);
  }

  // 打印汇总
  console.log(`\n${'═'.repeat(60)}`);
  console.log('          测试结果汇总');
  console.log(`${'═'.repeat(60)}`);
  console.log(`  总计: ${total} | \x1b[32m通过: ${passed}\x1b[0m | \x1b[31m失败: ${failed}\x1b[0m`);
  const passRate = total > 0 ? Math.round(passed / total * 100) : 0;
  if (passRate >= 90) {
    console.log(`  通过率: \x1b[32m${passRate}%\x1b[0m ✓`);
  } else if (passRate >= 70) {
    console.log(`  通过率: \x1b[33m${passRate}%\x1b[0m ⚠`);
  } else {
    console.log(`  通过率: \x1b[31m${passRate}%\x1b[0m ✗`);
  }
  console.log(`${'═'.repeat(60)}`);

  if (failures.length > 0) {
    console.log(`\n失败的测试 (${failures.length}):`);
    failures.forEach((f, i) => {
      console.log(`  \x1b[31m${i + 1}.\x1b[0m ${f.name}`);
      console.log(`     ${f.error}`);
    });
  }

  if (passed === total && total > 0) {
    console.log('\n  \x1b[32m🎉 所有测试通过!\x1b[0m\n');
  }

  // 退出
  process.exit(failed > 0 ? 1 : 0);
}

// 启动
runAllTests().catch(e => {
  console.error('测试运行器崩溃:', e);
  process.exit(1);
});
