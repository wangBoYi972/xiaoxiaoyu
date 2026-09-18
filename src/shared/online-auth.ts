// 在线发码服务配置（分发给别人安装时用）
// ------------------------------------------------------------------
// 背景：SMTP 发件邮箱配置存在每台电脑自己的本地数据库里，分发给别人的安装包里是空的，
// 别人注册时会卡在"发件邮箱未配置"。把你的 QQ 授权码写进安装包等于公开授权码（明文可查），
// 所以正确做法是：验证码由**服务端**发送，授权码只留在服务端环境变量里。
//
// 用法：部署 deploy/mail-service（腾讯云函数 / 任意能跑 Node 的机器），
// 拿到 https 地址后填到下面的 ONLINE_AUTH_URL，重新打包即可。
// 留空 = 关闭在线发码，仍然走本地 SMTP（你自己这台机器就是这么用的）。
//
// APP_TOKEN 只是防止别人白嫖你的发件邮箱，泄露了也不会暴露邮箱授权码。
export const ONLINE_AUTH_URL = '';

export const ONLINE_AUTH_TOKEN = '';

/** 是否启用在线发码 */
export function onlineAuthEnabled(): boolean {
  return !!ONLINE_AUTH_URL;
}

/** 在线发验证码 */
export async function onlineSendCode(
  email: string,
  purpose: 'register' | 'reset',
): Promise<{ ok: boolean; message?: string; error?: string; code?: string }> {
  const res = await fetch(`${ONLINE_AUTH_URL}/send-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-App-Token': ONLINE_AUTH_TOKEN },
    body: JSON.stringify({ email, purpose }),
  });
  return await res.json() as any;
}

/** 在线校验验证码 */
export async function onlineVerifyCode(
  email: string,
  code: string,
  purpose: 'register' | 'reset',
): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`${ONLINE_AUTH_URL}/verify-code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-App-Token': ONLINE_AUTH_TOKEN },
    body: JSON.stringify({ email, code, purpose }),
  });
  return await res.json() as any;
}
