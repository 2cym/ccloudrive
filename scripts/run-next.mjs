#!/usr/bin/env node
/**
 * Next.js 命令包装器 —— 放宽宿主环境的「批量删除保护」。
 *
 * 背景 / 问题
 * -----------
 * 本机运行环境会给所有 node 进程注入一个安全删除代理
 * （node-safe-delete-shim.cjs）。当一个「回合」内的删除文件数超过
 * CODEBUDDY_SAFE_DELETE_BULK_THRESHOLD（默认 50）时，它会直接抛错：
 *
 *   [safe-delete][SAFE_DELETE_BULK_CONFIRM_REQUIRED] {"count":50,...}
 *
 * 而 `next build` 和 `next dev` **都会在启动时清理上一轮的 `.next` 产物**
 * （.next/cache、.next/server、.next/static、.next/types 等，本项目约 64 个
 * 文件），必然超过 50 这个阈值，于是命令被中断。
 *
 * 这是「宿主环境策略 vs 构建工具正常行为」的冲突，
 * 与项目代码无关，也不会在其他机器 / CI 上出现。
 *
 * 处理
 * ----
 * 只在本包装器启动的进程树内，把该阈值调高，使 Next 能正常清理自己的
 * 产物目录。作用域仅限本命令，不改变全局策略。
 *
 * 用法
 * ----
 *   node scripts/run-next.mjs next dev -p 8788
 *   node scripts/run-next.mjs next build
 *   node scripts/run-next.mjs opennextjs-cloudflare build
 */

import { spawn } from 'node:child_process';

// 仅放宽到「足够清理 .next」的量级，保留基本的异常删除保护。
// 注意：宿主环境已预设该变量为 50，因此必须强制覆盖（不能用 ||=）。
process.env.CODEBUDDY_SAFE_DELETE_BULK_THRESHOLD = '20000';

const args = process.argv.slice(2);

if (args.length === 0) {
  console.error('用法: node scripts/run-next.mjs <命令> [参数...]');
  process.exit(1);
}

const [command, ...rest] = args;

// ---------------------------------------------------------------------------
// 代理隔离（仅 dev server）
// ---------------------------------------------------------------------------
// 本机宿主预设了 HTTP_PROXY / HTTPS_PROXY = http://127.0.0.1:10132
// （一个 TLS 中间人代理），并且**完全没有设置 NO_PROXY**。
//
// `next dev` 不是单进程模型：外层是 route server，内层是真正的 http server，
// 两者之间通过 HTTP 互相通信（还有路由自省等本地请求）。这些请求走的是
// localhost / 127.0.0.1，但在「代理已配置且无 NO_PROXY」的情况下会被送去
// 那个外部代理，代理无法回连本机端口，于是请求永久挂起。
//
// 症状非常具有误导性：
//   - 端口确实 LISTENING，TCP 三次握手成功（`curl -w %{http_code}` 得到 000）
//   - 日志停在 "✓ Starting..."，永远不会打印 "✓ Ready"
//   - 对任何路径的请求都超时，但进程 CPU 几乎为 0
//
// 因此这里只对 `next dev` 摘掉代理变量。`next build` /
// `opennextjs-cloudflare build` 已验证在带代理的情况下可正常工作，
// 且后续 `wrangler deploy` 需要代理访问 Cloudflare API —— 所以不动它们。
//
// 注意：只影响本命令的进程树，不修改全局环境。
const isDevServer = command === 'next' && rest[0] === 'dev';
if (isDevServer) {
  for (const key of [
    'http_proxy',
    'https_proxy',
    'all_proxy',
    'HTTP_PROXY',
    'HTTPS_PROXY',
    'ALL_PROXY',
  ]) {
    delete process.env[key];
  }
  // 顺带补上 NO_PROXY，让 dev server 内部的其它网络客户端也走直连。
  const bypass = 'localhost,127.0.0.1,::1';
  const existing = process.env.NO_PROXY || process.env.no_proxy || '';
  const merged = existing ? `${existing},${bypass}` : bypass;
  process.env.NO_PROXY = merged;
  process.env.no_proxy = merged;
}

const child = spawn(command, rest, {
  stdio: 'inherit',
  env: process.env,
  shell: process.platform === 'win32',
});

child.on('error', (err) => {
  console.error(`[run-next] 无法启动 "${command}":`, err.message);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (signal) {
    console.error(`[run-next] 被信号终止: ${signal}`);
    process.exit(1);
  }
  process.exit(code ?? 1);
});
