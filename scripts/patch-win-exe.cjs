/**
 * electron-builder `afterPack` 钩子：给 Windows 主程序写入图标 + 版本信息
 * ══════════════════════════════════════════════════════════════════════
 * 为什么不直接用 `win.signAndEditExecutable: true`（那才是官方做法）：
 *
 *   官方路径是 app-builder 内的 rcedit 实现，它需要先解压
 *   `winCodeSign-2.6.0.7z`。那个包里含 macOS 的**符号链接**
 *   （darwin/10.12/lib/libcrypto.dylib、libssl.dylib）。
 *   Windows 上创建符号链接需要管理员权限或「开发人员模式」，
 *   本机两者都没有 → 7za 报 `Cannot create symbolic link : 客户端没有所需的特权`
 *   → 退出码 2 → app-builder 判定失败 → 重试 3 次 → 整个打包失败。
 *
 *   更麻烦的是 app-builder 每次都用**随机临时目录**重新解压，
 *   所以没法预先塞一个解压好的缓存进去。
 *
 * 所以这里改成：把 signAndEditExecutable 关掉（绕开 winCodeSign），
 * 在 afterPack 阶段自己调 rcedit。
 * afterPack 的时机正好是「app 目录已生成、但还没做成安装包」，
 * 所以 NSIS 打出来的安装包里就是已经改好图标的 exe。
 *
 *   → 结果：安装器图标（nsis.installerIcon）和装完后的程序图标都对。
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

/** 在 electron-builder 缓存里找一个可用的 rcedit；找不到就从 .7z 里抠出来 */
function findRcedit(rootDir) {
  const cacheRoot = path.join(
    process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'),
    'electron-builder',
    'Cache',
    'winCodeSign'
  );

  // 1) 已经被解压出来的
  if (fs.existsSync(cacheRoot)) {
    for (const entry of fs.readdirSync(cacheRoot)) {
      const dir = path.join(cacheRoot, entry);
      if (!fs.statSync(dir).isDirectory()) continue;
      for (const name of ['rcedit-x64.exe', 'rcedit-ia32.exe']) {
        const p = path.join(dir, name);
        if (fs.existsSync(p)) return p;
      }
    }
  }

  // 2) 从缓存的 .7z 里只抠 rcedit（避开 darwin 符号链接）
  const sevenZip = path.join(rootDir, 'node_modules', '7zip-bin', 'win', 'x64', '7za.exe');
  if (fs.existsSync(cacheRoot) && fs.existsSync(sevenZip)) {
    const archives = fs
      .readdirSync(cacheRoot)
      .filter((f) => f.endsWith('.7z'))
      .map((f) => path.join(cacheRoot, f));
    if (archives.length) {
      const outDir = path.join(os.tmpdir(), 'xxy-rcedit');
      fs.mkdirSync(outDir, { recursive: true });
      try {
        execFileSync(
          sevenZip,
          ['e', archives[0], 'rcedit-x64.exe', 'rcedit-ia32.exe', `-o${outDir}`, '-y'],
          { stdio: 'pipe' }
        );
        for (const name of ['rcedit-x64.exe', 'rcedit-ia32.exe']) {
          const p = path.join(outDir, name);
          if (fs.existsSync(p)) return p;
        }
      } catch (e) {
        /* 落到最后的报错 */
      }
    }
  }

  return null;
}

/** "3.0.1" → "3.0.1.0"（Windows 的 ProductVersion 要四段） */
function toWindowsVersion(v) {
  const parts = String(v || '0.0.0').split('.').map((x) => parseInt(x, 10) || 0);
  while (parts.length < 4) parts.push(0);
  return parts.slice(0, 4).join('.');
}

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;

  const rootDir = context.packager.projectDir || process.cwd();
  const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
  const build = pkg.build || {};
  const winCfg = build.win || {};

  const exeName = `${context.packager.appInfo.productFilename}.exe`;
  const exePath = path.join(context.appOutDir, exeName);

  if (!fs.existsSync(exePath)) {
    console.warn(`[afterPack] 找不到 ${exePath}，跳过图标写入`);
    return;
  }

  const rcedit = findRcedit(rootDir);
  if (!rcedit) {
    console.warn(
      '[afterPack] 本地没有可用的 rcedit，跳过图标写入。\n' +
        '           需要联网跑一次 electron-builder 让它下载 winCodeSign，\n' +
        '           或手动把 rcedit-x64.exe 放进 %LOCALAPPDATA%\\electron-builder\\Cache\\winCodeSign\\'
    );
    return;
  }

  const iconPath = path.resolve(rootDir, winCfg.icon || 'resources/icon.ico');
  const productName = build.productName || pkg.name;
  const version = pkg.version || '0.0.0';
  // rcedit 只覆盖你显式传的键，没传的会保留 Electron 的默认值 ——
  // 所以 CompanyName 必须显式写，否则 exe 属性里会一直显示 "GitHub, Inc."
  const company =
    build.companyName || (pkg.author && (pkg.author.name || pkg.author)) || productName;

  const args = [
    exePath,
    '--set-version-string', 'FileDescription', pkg.description || productName,
    '--set-version-string', 'ProductName', productName,
    '--set-version-string', 'CompanyName', String(company),
    '--set-version-string', 'LegalCopyright', build.copyright || '',
    '--set-file-version', version,
    '--set-product-version', toWindowsVersion(version),
    '--set-version-string', 'InternalName', productName,
    '--set-version-string', 'OriginalFilename', exeName,
  ];
  if (fs.existsSync(iconPath)) {
    args.push('--set-icon', iconPath);
  } else {
    console.warn(`[afterPack] 图标不存在: ${iconPath}`);
  }

  console.log(`[afterPack] rcedit → ${exeName}`);
  try {
    const out = execFileSync(rcedit, args, { stdio: 'pipe' });
    if (out && out.length) process.stdout.write(out);
    console.log('[afterPack] ✓ 图标与版本信息已写入');
  } catch (e) {
    const detail = [e.stdout?.toString(), e.stderr?.toString()].filter(Boolean).join('\n');
    console.error(`[afterPack] ✗ rcedit 失败：${e.message}\n${detail}`);
    throw e; // 让打包失败，避免静默产出没图标的 exe
  }
};
