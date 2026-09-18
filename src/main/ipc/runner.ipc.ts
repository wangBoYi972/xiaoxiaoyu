import { ipcMain } from 'electron';
import { spawn, ChildProcess, exec } from 'child_process';
import path from 'path';
import * as fs from 'fs/promises';
import { logger } from '../utils/logger';
import { isWorkspaceApproved } from './file.ipc';

/**
 * 项目启动器（2026-09-19 / 2026-09-20 扩展）
 *
 * 「启动项目」不再走聊天让 Agent 代跑，而是由主进程直接 spawn：
 *  - 继承 Electron 进程的完整环境（PATH / JAVA_HOME / MAVEN_HOME …），
 *    所以 JDK、Maven、Node、Python 这些装好的东西都能被读到；
 *  - stdout / stderr 流式回传到渲染层的终端面板；
 *  - check-env 用 `<命令> -version` 实测探测，而不是猜注册表；
 *  - detect 自动识别项目类型并给出候选启动命令（Node/Maven/Gradle/Python/Go/静态）。
 *
 * 安全边界：只允许在工作区已授权目录里启动（isApprovedWorkspace），
 * 命令支持任意字符串（优先用调用方传入的 command），底层走 cmd /c 或 sh -c。
 */

interface RunningJob {
  id: string;
  script: string;
  cwd: string;
  proc: ChildProcess;
  startedAt: number;
}

/** 运行中的启动任务（一个工作区同时只跑一个脚本） */
let runningJob: RunningJob | null = null;

/** 渲染层引用（启动时记录，之后所有输出都发回这个页面） */
let rendererSender: Electron.WebContents | null = null;

interface ProjectCommand {
  id: string;
  label: string;
  command: string;
  /** 子模块等需要切到的相对目录；空表示用工作区根 */
  cwd?: string;
  description?: string;
}

interface DetectResult {
  kind: 'node' | 'maven' | 'gradle' | 'python' | 'go' | 'static' | 'unknown';
  label: string;
  files: string[];
  commands: ProjectCommand[];
}

function hasSpringBoot(pomText: string): boolean {
  return pomText.includes('spring-boot-maven-plugin');
}

async function detectProject(root: string): Promise<DetectResult> {
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    const names = new Set(entries.filter((e) => e.isFile() || e.isDirectory()).map((e) => e.name));
    const result: DetectResult = { kind: 'unknown', label: '未识别项目', files: [], commands: [] };

    // Node.js
    if (names.has('package.json')) {
      result.kind = 'node';
      result.label = 'Node.js 项目';
      result.files.push('package.json');
      try {
        const pkg = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
        const scripts = pkg?.scripts || {};
        const priority = ['dev', 'start', 'serve', 'build', 'test', 'preview'];
        const ordered = Object.entries(scripts).sort(([a], [b]) => {
          const ia = priority.indexOf(a);
          const ib = priority.indexOf(b);
          if (ia === -1 && ib === -1) return a.localeCompare(b);
          if (ia === -1) return 1;
          if (ib === -1) return -1;
          return ia - ib;
        });
        for (const [name, cmd] of ordered) {
          if (typeof cmd !== 'string') continue;
          result.commands.push({ id: `npm:${name}`, label: `npm run ${name}`, command: `npm run ${name}`, cwd: root });
        }
        if (!result.commands.length) {
          result.commands.push({ id: 'npm:install', label: '安装依赖 npm install', command: 'npm install', cwd: root });
        }
      } catch { /* ignore */ }
    }

    // Maven（优先于 Gradle）
    if (names.has('pom.xml')) {
      result.kind = 'maven';
      result.files.push('pom.xml');
      try {
        const pomText = await fs.readFile(path.join(root, 'pom.xml'), 'utf8');
        const packaging = pomText.match(/<packaging>([^<]+)<\/packaging>/)?.[1]?.trim() || 'jar';
        const modules: string[] = [];
        const moduleMatch = pomText.match(/<modules>([\s\S]*?)<\/modules>/);
        if (moduleMatch) {
          const re = /<module>([^<]+)<\/module>/g;
          let m;
          while ((m = re.exec(moduleMatch[1])) !== null) modules.push(m[1].trim());
        }

        if (packaging === 'pom' && modules.length > 0) {
          result.label = `Maven 多模块项目（${modules.length} 个子模块）`;
          result.commands.push({
            id: 'mvn:parent-install',
            label: 'mvn -DskipTests clean install（父工程）',
            command: 'mvn -DskipTests clean install',
            cwd: root,
          });
          for (const mod of modules) {
            const modPath = path.join(root, mod);
            let modPomText = '';
            try { modPomText = await fs.readFile(path.join(modPath, 'pom.xml'), 'utf8'); } catch {}
            const modHasSpring = hasSpringBoot(modPomText) || hasSpringBoot(pomText);
            result.commands.push({
              id: `mvn:${mod}:install`,
              label: `${mod}: mvn -DskipTests clean install`,
              command: `mvn -pl ${mod} -am -DskipTests clean install`,
              cwd: root,
            });
            if (modHasSpring) {
              result.commands.push({
                id: `mvn:${mod}:run`,
                label: `${mod}: mvn -DskipTests spring-boot:run`,
                command: `mvn -pl ${mod} -am -DskipTests spring-boot:run`,
                cwd: root,
              });
            }
          }
        } else {
          result.label = 'Maven 项目';
          const spring = hasSpringBoot(pomText);
          result.commands.push({ id: 'mvn:install', label: 'mvn -DskipTests clean install', command: 'mvn -DskipTests clean install', cwd: root });
          result.commands.push({ id: 'mvn:package', label: 'mvn -DskipTests package', command: 'mvn -DskipTests package', cwd: root });
          result.commands.push({ id: 'mvn:compile', label: 'mvn -DskipTests compile', command: 'mvn -DskipTests compile', cwd: root });
          if (spring) {
            result.commands.unshift({ id: 'mvn:run', label: 'mvn -DskipTests spring-boot:run', command: 'mvn -DskipTests spring-boot:run', cwd: root });
          }
        }
      } catch { /* ignore */ }
    }

    // Gradle
    if (names.has('build.gradle') || names.has('build.gradle.kts')) {
      result.kind = 'gradle';
      result.label = 'Gradle 项目';
      result.files.push(names.has('build.gradle') ? 'build.gradle' : 'build.gradle.kts');
      const gradle = names.has('gradlew') ? (process.platform === 'win32' ? 'gradlew' : './gradlew') : 'gradle';
      result.commands.push({ id: 'gradle:run', label: `${gradle} bootRun`, command: `${gradle} bootRun`, cwd: root });
      result.commands.push({ id: 'gradle:build', label: `${gradle} build`, command: `${gradle} build`, cwd: root });
    }

    // Go
    if (names.has('go.mod')) {
      result.kind = 'go';
      result.label = 'Go 项目';
      result.files.push('go.mod');
      result.commands.push({ id: 'go:run', label: 'go run .', command: 'go run .', cwd: root });
    }

    // Python
    const pyFiles = entries
      .filter((e) => e.isFile() && /^(main|app|manage|server|run)\.py$/.test(e.name))
      .map((e) => e.name);
    const hasPy = names.has('requirements.txt') || names.has('pyproject.toml') || pyFiles.length > 0;
    if (hasPy) {
      result.kind = 'python';
      result.label = 'Python 项目';
      if (names.has('requirements.txt')) result.files.push('requirements.txt');
      if (names.has('pyproject.toml')) result.files.push('pyproject.toml');
      if (pyFiles.length) result.files.push(pyFiles[0]);
      if (names.has('main.py')) result.commands.push({ id: 'py:main', label: 'python main.py', command: 'python main.py', cwd: root });
      if (names.has('app.py')) result.commands.push({ id: 'py:app', label: 'python app.py', command: 'python app.py', cwd: root });
      if (names.has('manage.py')) result.commands.push({ id: 'py:django', label: 'python manage.py runserver', command: 'python manage.py runserver', cwd: root });
      if (names.has('requirements.txt') && !result.commands.some((c) => c.id === 'py:main')) {
        result.commands.push({ id: 'py:pip', label: 'pip install -r requirements.txt', command: 'pip install -r requirements.txt', cwd: root });
      }
    }

    // 静态页面兜底
    if (result.kind === 'unknown' && names.has('index.html')) {
      result.kind = 'static';
      result.label = '静态页面';
      result.files.push('index.html');
      result.commands.push({ id: 'static:serve', label: 'npx serve .', command: 'npx serve .', cwd: root });
      result.commands.push({ id: 'static:http', label: 'python -m http.server 8080', command: 'python -m http.server 8080', cwd: root });
    }

    return result;
  } catch (err: any) {
    logger.warn(`[runner] detect 失败: ${root} - ${err.message}`);
    return { kind: 'unknown', label: '读取目录失败', files: [], commands: [] };
  }
}

/**
 * 子进程输出解码：Windows 中文环境下 cmd/第三方工具常吐 GBK，
 * 直接 toString('utf8') 会把中文解成乱码（如「Python was not found」的本地化提示）。
 * 策略：UTF-8 与 GBK 各自用流式解码器解同一份字节流，UTF-8 出现替换符而 GBK 干净时用 GBK。
 * 两个解码器始终喂同一字节流，状态保持同步，跨 chunk 拆开的多字节字符也能正确解码。
 */
function createStreamDecoder(): { push: (buf: Buffer) => string } {
  let u8: TextDecoder;
  let gbk: TextDecoder;
  try {
    u8 = new TextDecoder('utf-8');
    gbk = new TextDecoder('gbk');
  } catch {
    const fallback = { push: (buf: Buffer) => buf.toString('utf8') };
    return fallback;
  }
  return {
    push(buf: Buffer): string {
      const s8 = u8.decode(buf, { stream: true });
      const sg = gbk.decode(buf, { stream: true });
      if (s8.includes('\uFFFD') && !sg.includes('\uFFFD')) return sg;
      return s8;
    },
  };
}

function send(channel: string, payload: unknown): void {
  try {
    if (rendererSender && !rendererSender.isDestroyed()) {
      rendererSender.send(channel, payload);
    }
  } catch {
    /* 页面已销毁，忽略 */
  }
}

/** 在 Windows 上杀掉整棵进程树（npm run 会派生 vite/electron 等子进程） */
function killTree(pid: number): void {
  if (process.platform === 'win32') {
    exec(`taskkill /PID ${pid} /T /F`, () => { /* 尽力而为 */ });
  } else {
    try { process.kill(-pid, 'SIGKILL'); } catch { /* 已退出 */ }
  }
}

/** 检测单个环境命令是否可用（spawn 而非 exec，避免 shell 注入面） */
function probeCommand(cmd: string, args: string[], timeoutMs = 6000): Promise<{ ok: boolean; version: string }> {
  return new Promise((resolve) => {
    let done = false;
    const chunks: Buffer[] = [];
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      const text = decodeBufferList(chunks);
      const firstLine = text.split('\n')[0]?.trim().slice(0, 120) || '';
      resolve({ ok, version: firstLine });
    };
    try {
      // Windows 上 npm/java 等是 .cmd/.exe，必须带 shell 才找得到
      const proc = spawn(cmd, args, { shell: process.platform === 'win32', windowsHide: true });
      const timer = setTimeout(() => {
        try { proc.kill(); } catch { /* noop */ }
        finish(false);
      }, timeoutMs);
      proc.stdout?.on('data', (d: Buffer) => { chunks.push(d); });
      proc.stderr?.on('data', (d: Buffer) => { chunks.push(d); }); // java -version 输出在 stderr
      proc.on('error', () => { clearTimeout(timer); finish(false); });
      proc.on('close', (code) => {
        clearTimeout(timer);
        // code===0 且不是「命令不存在」类的本地化报错才算可用（Windows 商店的 python 占位程序会退出非 0）
        const suspicious = /not found|not recognized|不是内部或外部命令|无法找到|无法将/i.test(textOf(chunks));
        finish((code === 0 || /version/i.test(textOf(chunks))) && !suspicious);
      });
    } catch {
      finish(false);
    }
  });
}

/** 把若干 Buffer 段拼起来解码（一次性场景） */
function decodeBufferList(chunks: Buffer[]): string {
  if (!chunks.length) return '';
  try {
    return createStreamDecoder().push(Buffer.concat(chunks));
  } catch {
    return Buffer.concat(chunks).toString('utf8');
  }
}

function textOf(chunks: Buffer[]): string {
  return decodeBufferList(chunks);
}

export function registerRunnerHandlers(): void {
  ipcMain.handle('runner:check-env', async () => {
    const [node, java, python, git, maven] = await Promise.all([
      probeCommand('node', ['--version']),
      probeCommand('java', ['-version']),
      probeCommand('python', ['--version']),
      probeCommand('git', ['--version']),
      probeCommand('mvn', ['-version']),
    ]);
    return {
      success: true,
      env: {
        node: { ...node, path: process.env.NODE_PATH || '' },
        java: { ...java, home: process.env.JAVA_HOME || '' },
        python,
        git,
        maven,
        /** 关键变量快照，面板直接展示 */
        vars: {
          JAVA_HOME: process.env.JAVA_HOME || '(未设置)',
        },
      },
    };
  });

  ipcMain.handle('runner:detect', async (_event, cwd: string) => {
    if (!cwd || typeof cwd !== 'string') {
      return { success: false, error: '缺少工作区路径' };
    }
    const result = await detectProject(cwd);
    return { success: true, ...result };
  });

  ipcMain.handle('runner:start', async (event, data: { script?: string; cwd?: string; command?: string }) => {
    const { script, cwd, command } = data || {};
    try {
      const effectiveCommand = typeof command === 'string' && command.trim()
        ? command.trim()
        : typeof script === 'string' && script.trim()
          ? `npm run ${script.trim()}`
          : '';

      if (!effectiveCommand) {
        return { success: false, error: '缺少启动命令' };
      }
      if (!cwd || !isWorkspaceApproved(cwd)) {
        return { success: false, error: '该项目目录未被授权，请先通过「选择目录」打开工作区' };
      }

      // 危险命令简单拦截（用户自己的项目，只拦明显会搞崩系统的）
      const blocked =
        /^\s*(rm\s+-rf\s*\/|rm\s+-rf\s*~|format\s|diskpart|shutdown\s+-s|mkfs\.)/i.test(effectiveCommand) ||
        /:\s*\\\*\.\*|del\s+\/s\s+/i.test(effectiveCommand);
      if (blocked) {
        return { success: false, error: '该命令被安全策略拦截' };
      }

      // 同时只允许一个运行任务，先停旧的
      if (runningJob) {
        stopJob('被新的启动任务替换');
      }

      rendererSender = event.sender;

      const id = `run_${Date.now().toString(36)}`;
      const displayCmd = effectiveCommand;
      const isWin = process.platform === 'win32';
      const [shellCmd, shellArgs] = isWin
        ? ['cmd.exe', ['/c', effectiveCommand]]
        : ['sh', ['-c', effectiveCommand]];

      const proc = spawn(shellCmd, shellArgs, {
        cwd,
        // 完整继承主进程环境：PATH/JAVA_HOME/MAVEN_HOME…… JDK 等都能读到
        env: { ...process.env, FORCE_COLOR: '0' },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        shell: false,
      });

      runningJob = { id, script: script || '', cwd, proc, startedAt: Date.now() };
      logger.info(`[runner] 启动: ${displayCmd} @ ${cwd}`);

      send('runner:output', { id, type: 'start', script: script || '', command: displayCmd, cwd });

      const dec = { stdout: createStreamDecoder(), stderr: createStreamDecoder() };
      const push = (buf: Buffer, stream: 'stdout' | 'stderr') => {
        send('runner:output', { id, type: stream, data: dec[stream].push(buf) });
      };
      proc.stdout?.on('data', (d: Buffer) => push(d, 'stdout'));
      proc.stderr?.on('data', (d: Buffer) => push(d, 'stderr'));

      proc.on('error', (err) => {
        send('runner:output', { id, type: 'error', data: err.message });
        if (runningJob?.id === id) runningJob = null;
      });
      proc.on('close', (code) => {
        send('runner:output', { id, type: 'exit', code: code ?? 0 });
        if (runningJob?.id === id) runningJob = null;
        logger.info(`[runner] 结束: ${displayCmd} (exit=${code})`);
      });

      return { success: true, id };
    } catch (error: any) {
      logger.error('[runner] 启动失败:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('runner:stop', async () => {
    if (!runningJob) return { success: true, running: false };
    stopJob('用户手动停止');
    return { success: true, running: false };
  });

  ipcMain.handle('runner:status', async () => {
    if (!runningJob) return { success: true, running: false };
    return {
      success: true,
      running: true,
      job: { id: runningJob.id, script: runningJob.script, cwd: runningJob.cwd, startedAt: runningJob.startedAt },
    };
  });
}

function stopJob(reason: string): void {
  if (!runningJob) return;
  const { id, proc, pid } = { ...runningJob, pid: runningJob.proc.pid };
  logger.info(`[runner] 停止: ${runningJob.script} (${reason})`);
  send('runner:output', { id, type: 'stopped', data: reason });
  if (typeof pid === 'number') killTree(pid);
  else try { proc.kill(); } catch { /* noop */ }
  runningJob = null;
}
