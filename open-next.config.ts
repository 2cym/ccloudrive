import { defineCloudflareConfig } from '@opennextjs/cloudflare';

/**
 * OpenNext 构建配置（opennextjs-cloudflare 的必需文件）。
 *
 * 没有它，`opennextjs-cloudflare build` 会停在交互式提问
 * 「? Missing required open-next.config.ts file, do you want to create one?」
 * —— 在后台任务 / CI 这类非交互环境里表现为**永久挂起**。
 *
 * 刻意保持最小可用配置（与批 6.2 的拍板一致）：
 * - 暂不接 R2 增量缓存（incrementalCache）——等第七批文件管理落地后再评估；
 * - tagCache / queue 等也不启用，先把「能部署」这条链路打通。
 *
 * 配套检查：wrangler.toml 的 main = ".open-next/worker.js"，
 * 与本工具默认输出一致，否则 wrangler deploy 会部署出一个空壳。
 */
export default defineCloudflareConfig();
