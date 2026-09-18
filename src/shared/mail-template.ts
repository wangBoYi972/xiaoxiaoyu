// 验证码邮件模板 — 桌面端与 Web 服务端共用

export type MailPurpose = 'register' | 'reset';

export interface VerificationMailContent {
  subject: string;
  text: string;
  html: string;
}

const PURPOSE_TEXT: Record<MailPurpose, string> = {
  register: '注册',
  reset: '重置密码',
};

export function renderVerificationMail(
  code: string,
  purpose: MailPurpose,
  codeTtlMinutes = 10
): VerificationMailContent {
  const label = PURPOSE_TEXT[purpose] || '验证';

  return {
    subject: `小小榆 ${label}验证码：${code}`,
    text: `你的小小榆${label}验证码是：${code}\n\n${codeTtlMinutes} 分钟内有效。如果不是你本人操作，请忽略本邮件。`,
    html: `
      <div style="max-width:480px;margin:0 auto;padding:32px;font-family:-apple-system,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;">
        <h2 style="color:#0a2540;margin:0 0 8px;">小小榆 AI 桌面助手</h2>
        <p style="color:#57606a;font-size:14px;margin:0 0 24px;">你正在进行<strong>${label}</strong>，验证码为：</p>
        <div style="background:#f0f6ff;border:1px solid #d0e3ff;border-radius:12px;padding:20px;text-align:center;">
          <span style="font-size:32px;font-weight:700;letter-spacing:8px;color:#1677ff;">${code}</span>
        </div>
        <p style="color:#8b949e;font-size:12px;margin-top:24px;">验证码 ${codeTtlMinutes} 分钟内有效。如果不是你本人操作，请忽略本邮件。</p>
      </div>
    `,
  };
}
