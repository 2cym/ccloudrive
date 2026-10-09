// 步骤 B2 补充（第三方案）：用单进程 Node + Promise.all 制造真并发。
//
// 为什么换掉 curl --parallel：
//   curl 仍需为每个 transfer 建连，且实测时间分布可疑（1 个 0.12s，
//   其余 7 个挤在 0.68~0.70s），无法排除客户端侧调度影响。
//   单进程 Node 的 Promise.all 在同一 tick 内发出全部请求，零进程启动抖动，
//   是能拿到的最干净的并发客户端。
//
// 期望：恰好 1 个 201。
//   - 若出现 409 + 「邀请码刚刚被用完，请更换邀请码」→ meta.changes===0 补偿分支被真正触发
//   - 若全部是 400 + 「邀请码已用完」→ 预检就拦下了，窗口没被命中（服务端实质串行）
//
// 前置条件（不满足会得到无意义的结果）：
//   1) dev server 已运行：npx next dev -p 8788（或 npm run dev -- -p 8788）
//   2) ONCEONLY01 邀请码处于干净状态，先执行：
//      npx wrangler d1 execute yuanshennb-db --local \
//        --command "UPDATE invite_codes SET used_count=0,is_active=1,max_uses=1 WHERE code='ONCEONLY01';"
//   3) 本机宿主设了 HTTP_PROXY 且无 NO_PROXY，且 Node 的 fetch 不走代理，
//      所以这里无需特殊处理；若换到会走代理的运行时，请先清掉代理变量。
//
// 用法: node scripts/test-race-register.mjs
const BASE = 'http://127.0.0.1:8788';
const N = 16;
const TS = Date.now();

const jobs = [];
for (let i = 1; i <= N; i += 1) {
  const email = `race3-${i}-${TS}@example.com`;
  jobs.push(
    fetch(`${BASE}/api/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': `10.0.4.${i}`,
      },
      body: JSON.stringify({
        email,
        password: 'Passw0rd-test',
        name: `Race3 ${i}`,
        inviteCode: 'ONCEONLY01',
      }),
    }).then(async (r) => ({ i, status: r.status, body: await r.text() })),
  );
}

const started = Date.now();
const results = (await Promise.all(jobs)).sort((a, b) => a.i - b.i);
const elapsed = Date.now() - started;

for (const r of results) {
  console.log(`probe=${String(r.i).padStart(2, '0')}  http=${r.status}  ${r.body}`);
}

const counts = {};
for (const r of results) counts[r.status] = (counts[r.status] ?? 0) + 1;

console.log('');
console.log(`总耗时: ${elapsed} ms`);
console.log(`状态码分布: ${JSON.stringify(counts)}`);
console.log(`201 胜出:        ${results.filter((r) => r.status === 201).length}  (期望恰好 1)`);
console.log(`409 补偿分支:    ${results.filter((r) => r.status === 409).length}  (>0 即证明 meta.changes===0 被触发)`);
console.log(`400 预检拦截:    ${results.filter((r) => r.status === 400).length}`);
console.log(`5xx 内部错误:    ${results.filter((r) => r.status >= 500).length}  (期望 0)`);
