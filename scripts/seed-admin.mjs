#!/usr/bin/env node
/**
 * 管理员种子脚本。
 *
 * 为什么不能在 seed.sql 里写：
 * 密码哈希用 WebCrypto PBKDF2，SQL 算不出来，必须在 Node 里算好后插入。
 *
 * 关键：本脚本的哈希实现必须与 src/lib/password.ts 逐字节一致，
 * 否则登录永远失败。格式：pbkdf2$<iterations>$<saltB64>$<hashB64>
 *
 * 用法：
 *   node scripts/seed-admin.mjs                     # 写本地 D1
 *   node scripts/seed-admin.mjs --remote            # 写线上 D1
 *   node scripts/seed-admin.mjs --email a@b.c --password xxx
 */

import { webcrypto } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

// ---- 与 src/lib/password.ts 保持完全一致的常量 ----
const ITERATIONS = 100_000;
const KEY_LEN = 32;
const SALT_LEN = 16;
const DB_NAME = 'yuanshennb-db';

const subtle = webcrypto.subtle;

function toBase64(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  return Buffer.from(bytes).toString('base64');
}

async function hashPassword(password) {
  const salt = webcrypto.getRandomValues(new Uint8Array(SALT_LEN));
  const keyMaterial = await subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    KEY_LEN * 8,
  );
  return `pbkdf2$${ITERATIONS}$${toBase64(salt)}$${toBase64(bits)}`;
}

// ---- 读取 .dev.vars ----
function loadDevVars() {
  const path = resolve(root, '.dev.vars');
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    out[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
  return out;
}

// ---- 参数解析 ----
const args = process.argv.slice(2);
const isRemote = args.includes('--remote');
const getArg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
};

const devVars = loadDevVars();
const email = (
  getArg('email', devVars.SEED_ADMIN_EMAIL || 'admin@example.com')
).toLowerCase().trim();
const password = getArg('password', devVars.SEED_ADMIN_PASSWORD || 'admin12345');
const name = getArg('name', '管理员');

if (password.length < 8) {
  console.error('❌ 密码至少 8 位');
  process.exit(1);
}

const nowSec = Math.floor(Date.now() / 1000);
// 与 quota.ts 一致：默认 10GB 配额，重置时间为下月 1 日 00:00 CST
const GB = 1073741824;
const QUOTA = 10 * GB;
const nextResetSec = computeNextShanghaiMonthReset();

/** 下月 1 日 00:00 Asia/Shanghai 的 Unix 秒（与 lib/quota.ts 同算法） */
function computeNextShanghaiMonthReset() {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = fmt.formatToParts(new Date());
  const year = Number(parts.find((p) => p.type === 'year').value);
  const month = Number(parts.find((p) => p.type === 'month').value);
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  // 上海 00:00 = UTC 前一日 16:00
  return Math.floor(Date.UTC(nextYear, nextMonth - 1, 1, 0, 0, 0) / 1000) - 8 * 3600;
}

async function main() {
  console.log(`\n🔑 生成管理员账号`);
  console.log(`   邮箱: ${email}`);
  console.log(`   目标: ${isRemote ? '线上 D1 (--remote)' : '本地 D1 (--local)'}\n`);

  const passwordHash = await hashPassword(password);
  const userId = randomUUID();

  // SQL 转义：单引号翻倍
  const q = (s) => `'${String(s).replace(/'/g, "''")}'`;

  const sql = `
INSERT INTO users (
  id, name, email, email_verified, image, password_hash, avatar, role,
  storage_quota, storage_used, monthly_upload_quota, monthly_upload_used,
  upload_quota_reset_at, invited_by_code_id, registered_from, is_disabled,
  created_at, updated_at
) VALUES (
  ${q(userId)}, ${q(name)}, ${q(email)}, NULL, NULL, ${q(passwordHash)}, NULL, 'admin',
  ${QUOTA}, 0, ${QUOTA}, 0,
  ${nextResetSec}, NULL, 'seed', 0,
  ${nowSec}, ${nowSec}
)
ON CONFLICT(email) DO UPDATE SET
  password_hash = excluded.password_hash,
  role = 'admin',
  is_disabled = 0,
  updated_at = excluded.updated_at;
`;

  const sqlFile = resolve(root, 'drizzle', '.seed-admin.tmp.sql');
  const { writeFileSync, unlinkSync } = await import('node:fs');
  writeFileSync(sqlFile, sql, 'utf8');

  try {
    const flag = isRemote ? '--remote' : '--local';
    const cmd = `npx wrangler d1 execute ${DB_NAME} ${flag} --file="${sqlFile}"`;
    console.log(`▶ ${cmd}\n`);
    execSync(cmd, { cwd: root, stdio: 'inherit' });
    console.log(`\n✅ 管理员已就绪`);
    console.log(`   邮箱: ${email}`);
    console.log(`   密码: ${password}`);
    console.log(`   ${isRemote ? '访问线上站点' : '本地运行 npm run preview'} 后即可登录\n`);
  } finally {
    try {
      unlinkSync(sqlFile);
    } catch {
      /* 忽略 */
    }
  }
}

main().catch((err) => {
  console.error('\n❌ 失败:', err.message);
  process.exit(1);
});
