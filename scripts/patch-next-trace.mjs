#!/usr/bin/env node
/**
 * 修补 Next.js 的本地 trace 上报器（构建环境兼容性补丁）。
 *
 * 背景 / 问题
 * -----------
 * `next build` 会把构建性能数据写入 `.next/trace`。实现见
 *   node_modules/next/dist/trace/report/to-json.js
 * 其中用 `fs.createWriteStream(file, { flags: 'a' })` 打开该文件，但
 * **没有给这个流注册 'error' 监听器**。
 *
 * 在某些 Windows 环境下（主机文件系统代理、杀毒软件实时扫描、
 * 多 worker 并发打开同一文件等），这个 open() 会瞬时返回 EPERM/EACCES。
 * 由于没有 error 监听器，Node 会把它抛成 **uncaughtException**，
 * 直接把整个 `next build` 打死，报错形如：
 *
 *   uncaughtException [Error: EPERM: operation not permitted,
 *     open 'C:\...\.next\trace']
 *
 * 而 trace 只是**纯遥测/性能数据**，与产物正确性完全无关。
 *
 * 修复
 * ----
 * 让报告器在入口处直接返回，从而根本不创建该写入流。
 * 构建产物（.next/BUILD_ID、server、static、routes-manifest.json 等）
 * 全部不受影响。
 *
 * 为什么用脚本
 * ------------
 * node_modules 会被 `npm install` / `npm ci` 覆盖，所以通过
 * `postinstall` 自动重新应用，保证补丁不会“装一次就丢”。
 *
 * 幂等：已打过补丁则直接跳过；找不到 Next 则静默退出。
 * 安全：任何异常都吞掉并以 0 退出，绝不阻断 `npm install`。
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const MARK = '/* [yuanshennb:trace-patch] */';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = resolve(
  root,
  'node_modules/next/dist/trace/report/to-json.js',
);

/** 原始片段：报告器入口函数首行 */
const NEEDLE = 'const reportToLocalHost = (event)=>{\n';
/** 补丁后片段：入口直接返回，不再创建 trace 写入流 */
const PATCHED =
  'const reportToLocalHost = (event)=>{\n' +
  '    ' +
  MARK +
  '\n' +
  '    // Trace is non-essential telemetry. Skipping it avoids an unhandled\n' +
  '    // write-stream error (EPERM on .next/trace) that would otherwise\n' +
  '    // crash the whole build in this environment.\n' +
  '    return;\n';

function main() {
  if (!existsSync(target)) {
    console.log('[patch-next-trace] 未找到 Next.js，跳过。');
    return;
  }

  let src = readFileSync(target, 'utf8');

  if (src.includes(MARK)) {
    console.log('[patch-next-trace] 补丁已存在，跳过。');
    return;
  }

  if (!src.includes(NEEDLE)) {
    console.log(
      '[patch-next-trace] 目标片段未匹配（Next 版本可能已变化），跳过。',
    );
    return;
  }

  src = src.replace(NEEDLE, PATCHED);
  writeFileSync(target, src, 'utf8');
  console.log('[patch-next-trace] 已应用 trace 补丁。');
}

try {
  main();
} catch (err) {
  console.log(
    '[patch-next-trace] 跳过（非致命）:',
    err instanceof Error ? err.message : String(err),
  );
}
process.exit(0);
