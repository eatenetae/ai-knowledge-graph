#!/usr/bin/env node
/**
 * 一键跑真实浏览器冒烟：起静态服务器 → 拉起无头 Chrome → 跑 tools/cdp-check.mjs → 清理退出。
 *
 * `cdp-check.mjs` 自己不起服务也不起浏览器，它假设「已经有一个站点在跑、已经有一个
 * 开着调试端口的浏览器」。这个脚本把那两件脏活包起来，于是本地和 CI 跑的是同一条命令——
 * 「CI 上过不了但本地能过」这类只在环境里出现的差异，就没地方藏了。
 *
 * 用法：
 *   node tools/smoke.mjs                        # 默认用 web/dist
 *   node tools/smoke.mjs --dist dist            # 指定站点目录（相对当前目录）
 *   node tools/smoke.mjs --port 8733            # 固定站点端口（默认自动挑空闲端口）
 *   node tools/smoke.mjs --chrome /path/to/chrome
 *
 * 浏览器查找顺序：--chrome 参数 > CHROME_PATH 环境变量 > 系统常见安装位置。
 * 找不到浏览器时退出码 2，并直接写出该装哪个包。
 *
 * 退出码：0 冒烟全过；1 有检查项没过；2 环境问题（没构建产物 / 没浏览器 / 起不来）。
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB_DIR = resolve(HERE, '..');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

const CHROME_CANDIDATES = {
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  ],
  linux: ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'],
  win32: [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ],
};

function parseArgs(argv) {
  const options = { dist: join(WEB_DIR, 'dist'), port: 0, chrome: '' };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === '--dist') options.dist = resolve(value);
    else if (flag === '--port') options.port = Number(value);
    else if (flag === '--chrome') options.chrome = value;
    else {
      process.stderr.write(`未知参数：${flag}（可用：--dist / --port / --chrome）\n`);
      process.exit(2);
    }
    i += 1;
  }
  return options;
}

/**
 * CHROME_PATH 在 CI 里可能是空串（上游 output 没取到），空串一律当没设。
 * 显式给的路径写错了就退回自动查找，而不是拿着一个不存在的路径去 spawn。
 */
function findChrome(explicit) {
  const fromEnv = process.env.CHROME_PATH?.trim();
  const candidates = [explicit?.trim(), fromEnv].filter(Boolean);
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
    process.stderr.write(`⚠ 指定的浏览器不存在：${candidate}，改为自动查找\n`);
  }

  for (const candidate of CHROME_CANDIDATES[process.platform] ?? []) {
    if (candidate.includes(sep) || candidate.includes('/')) {
      if (existsSync(candidate)) return candidate;
      continue;
    }
    // 只有命令名：挨个翻 PATH，等价于 `which`
    for (const dir of (process.env.PATH ?? '').split(':').filter(Boolean)) {
      const full = join(dir, candidate);
      if (existsSync(full)) return full;
    }
  }
  return '';
}

function listen(server, port) {
  return new Promise((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolvePromise(server.address().port));
  });
}

/**
 * 站点是纯静态的，所以这里不需要任何第三方服务：一个 http server 就够。
 * 只服务目录内的文件，`..` 逃逸直接 403，免得把仓库别的文件也端出去。
 */
function startStaticServer(rootDir) {
  const server = createServer((request, response) => {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    } catch {
      response.writeHead(400).end('请求路径解不开');
      return;
    }

    let target = resolve(rootDir, normalize(pathname).replace(/^[/\\]+/, ''));
    if (target !== rootDir && !target.startsWith(rootDir + sep)) {
      response.writeHead(403).end('越界了');
      return;
    }
    if (existsSync(target) && statSync(target).isDirectory()) target = join(target, 'index.html');
    if (!existsSync(target)) {
      response.writeHead(404).end(`找不到 ${pathname}`);
      return;
    }

    response.writeHead(200, {
      'content-type': MIME[extname(target).toLowerCase()] ?? 'application/octet-stream',
      // 冒烟要看到的一定是刚构建出来的那份，别让缓存骗过检查
      'cache-control': 'no-store',
    });
    response.end(readFileSync(target));
  });
  return server;
}

/**
 * 等调试端口就绪。浏览器半路挂掉（起不来、立刻退出）就没必要把 30 秒等满，
 * 而且这时候真正有用的信息是它的 stderr，不是超时。
 */
async function waitForCdp(port, chrome, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let spawnError = null;
  chrome.on('error', (error) => {
    spawnError = error;
  });

  while (Date.now() < deadline) {
    if (spawnError) return { ok: false, reason: `起不了浏览器：${spawnError.message}` };
    if (chrome.exitCode !== null || chrome.signalCode !== null) {
      return { ok: false, reason: `浏览器启动后立刻退出了（退出码 ${chrome.exitCode}）` };
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) return { ok: true };
    } catch {
      // 浏览器还没起来，继续等
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return { ok: false, reason: `等了 ${timeoutMs / 1000} 秒，调试端口 ${port} 一直没就绪` };
}

// cdp-check.mjs 直接用了全局 WebSocket（Node 22.4 起默认可用）。
// 老版本上不报这个的话，报出来的是「WebSocket is not defined」，很难查到根因。
if (typeof WebSocket === 'undefined') {
  process.stderr.write(
    `✗ 当前 Node ${process.version} 没有全局 WebSocket，冒烟测试需要 Node 22.4 或更高版本。\n`,
  );
  process.exit(2);
}

const options = parseArgs(process.argv.slice(2));

if (!existsSync(join(options.dist, 'index.html')) || !existsSync(join(options.dist, 'graph.json'))) {
  process.stderr.write(
    `✗ ${options.dist} 里没有构建好的站点。\n\n` +
      '先跑一次构建：\n' +
      '  node build/index.js          # 根目录，产出 web/public/*.json\n' +
      '  cd web && npm install && npm run build\n',
  );
  process.exit(2);
}

const chromePath = findChrome(options.chrome);
if (!chromePath) {
  process.stderr.write(
    '✗ 找不到 Chrome / Chromium，冒烟测试需要一个真实浏览器。\n\n' +
      '  本机没装的话装一个（macOS：Google Chrome；Ubuntu：apt install chromium-browser），\n' +
      '  或者用 --chrome <可执行文件路径> / CHROME_PATH=<路径> 直接指定。\n',
  );
  process.exit(2);
}

const server = startStaticServer(options.dist);
const sitePort = await listen(server, options.port);
const cdpPort = await (async () => {
  const probe = createNetServer();
  const port = await listen(probe, 0);
  await new Promise((r) => probe.close(r));
  return port;
})();

const baseUrl = `http://127.0.0.1:${sitePort}`;
const profileDir = mkdtempSync(join(tmpdir(), 'akg-smoke-'));

const chromeArgs = [
  '--headless',
  `--remote-debugging-port=${cdpPort}`,
  `--user-data-dir=${profileDir}`,
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-extensions',
  // 画布尺寸决定图谱布局断点，固定住，免得不同机器跑出不同结果
  '--window-size=1440,900',
];
if (process.env.CI) {
  // CI 容器里没有 user namespace，且 /dev/shm 往往小得可怜
  chromeArgs.push('--no-sandbox', '--disable-dev-shm-usage');
}
chromeArgs.push(baseUrl);

process.stdout.write(`站点    ${baseUrl}（${options.dist}）\n浏览器  ${chromePath}\nCDP     ${cdpPort}\n\n`);

const chrome = spawn(chromePath, chromeArgs, { stdio: ['ignore', 'ignore', 'pipe'] });
let chromeStderr = '';
chrome.stderr.on('data', (chunk) => {
  chromeStderr += chunk.toString();
});

let exitCode = 2;
let cleanupDone = false;

/**
 * 收尾要等浏览器真的退干净再删 profile —— Chrome 收到 SIGTERM 之后还会写一小会儿
 * 自己的目录，抢着 rm 会撞上 ENOTEMPTY。删不掉也不算冒烟失败，交给系统回收就好，
 * 别让收尾的意外盖掉真正的检查结果。
 */
async function cleanup() {
  if (cleanupDone) return;
  cleanupDone = true;

  server.close();

  if (chrome.exitCode === null && chrome.signalCode === null) {
    const exited = await new Promise((resolvePromise) => {
      const timer = setTimeout(() => {
        chrome.kill('SIGKILL');
        resolvePromise(false);
      }, 3000);
      chrome.once('exit', () => {
        clearTimeout(timer);
        resolvePromise(true);
      });
      chrome.kill('SIGTERM');
    });
    if (!exited) await new Promise((r) => setTimeout(r, 300));
  }

  try {
    rmSync(profileDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    // 临时目录而已
  }
}

for (const [signal, code] of [
  ['SIGINT', 130],
  ['SIGTERM', 143],
]) {
  process.on(signal, () => {
    cleanup().finally(() => process.exit(code));
  });
}

try {
  const ready = await waitForCdp(cdpPort, chrome);
  if (!ready.ok) {
    process.stderr.write(`✗ ${ready.reason}\n`);
    if (chromeStderr.trim()) process.stderr.write(`\nChrome 的输出：\n${chromeStderr.trim()}\n`);
    process.exit(2);
  }

  exitCode = await new Promise((resolvePromise) => {
    const child = spawn(process.execPath, [join(HERE, 'cdp-check.mjs'), baseUrl], {
      stdio: 'inherit',
      env: { ...process.env, CDP_PORT: String(cdpPort) },
    });
    child.on('exit', (code, signal) => resolvePromise(signal ? 1 : (code ?? 1)));
    child.on('error', (error) => {
      process.stderr.write(`✗ 起不了冒烟检查：${error.message}\n`);
      resolvePromise(2);
    });
  });
} finally {
  await cleanup();
}

process.exit(exitCode);
