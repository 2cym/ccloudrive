-- 系统设置默认值（幂等）
INSERT INTO system_settings (key, value, updated_at) VALUES
  ('defaultStorageQuota', '10737418240', unixepoch()),
  ('defaultMonthlyUploadQuota', '10737418240', unixepoch()),
  ('requireInviteCode', 'true', unixepoch()),
  ('maxUploadSize', '5368709120', unixepoch()),
  ('allowedFileTypes', '[]', unixepoch())
ON CONFLICT(key) DO NOTHING;

-- 初始邀请码：WELCOME2026（可用 100 次，永久有效）
-- 注意：这里只做演示；生产环境请用管理后台创建。
INSERT INTO invite_codes (
  id, code, created_by_id, max_uses, used_count, expires_at, is_active, note, created_at, updated_at
) VALUES (
  'seed-invite-0001',
  'WELCOME2026',
  NULL,
  100,
  0,
  NULL,
  1,
  '初始邀请码（seed 生成）',
  unixepoch(),
  unixepoch()
)
ON CONFLICT(code) DO NOTHING;

-- 管理员账号说明：
-- 密码哈希必须由应用生成（WebCrypto PBKDF2），SQL 无法直接算。
-- 请运行：npm run seed:admin
-- 它会在 Workers 运行时环境里创建管理员并输出到控制台。
