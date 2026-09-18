// 管理员配置 — 桌面端（main）与 Web 服务端（server）共用的管理员判定
// 规则：users.role === 'admin'，或账号（邮箱）在 ADMIN_EMAILS 白名单内。
// 背景：早期默认 admin 账号占了"首个账号成为管理员"的名额，导致真实管理员
//       835376335@qq.com 注册时 role 落成了 user。这里用白名单兜底，
//       并在两端启动时自动把白名单账号提升为 admin（幂等）。

export const ADMIN_EMAILS: readonly string[] = ['835376335@qq.com'];

/** 账号（用户名/邮箱，大小写不敏感）是否为管理员账号 */
export function isAdminAccount(account: string | null | undefined): boolean {
  if (!account) return false;
  const normalized = String(account).trim().toLowerCase();
  return ADMIN_EMAILS.includes(normalized);
}
