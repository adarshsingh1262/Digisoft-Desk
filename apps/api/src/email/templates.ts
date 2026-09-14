export type EmailTemplate =
  | { kind: 'verify-email'; firstName: string; url: string }
  | { kind: 'reset-password'; firstName: string; url: string; expiresInMinutes: number }
  | { kind: 'invite'; firstName: string; organizationName: string; url: string }
  | { kind: 'password-changed'; firstName: string };

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function layout(title: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#18181b;line-height:1.5">
<h2 style="font-size:18px;margin:0 0 16px">${escapeHtml(title)}</h2>
${bodyHtml}
<p style="color:#71717a;font-size:12px;margin-top:24px">Digisoft360 Help Desk</p>
</body></html>`;
}

function button(url: string, label: string): string {
  return `<p><a href="${escapeHtml(url)}" style="display:inline-block;background:#18181b;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">${escapeHtml(label)}</a></p>
<p style="font-size:12px;color:#71717a">If the button does not work, paste this link into your browser:<br>${escapeHtml(url)}</p>`;
}

export function renderEmail(template: EmailTemplate): RenderedEmail {
  switch (template.kind) {
    case 'verify-email':
      return {
        subject: 'Verify your email address',
        html: layout(
          `Hi ${template.firstName},`,
          `<p>Confirm your email address to finish setting up your Digisoft360 Help Desk account.</p>${button(template.url, 'Verify email')}`,
        ),
        text: `Hi ${template.firstName},\n\nVerify your email address: ${template.url}`,
      };
    case 'reset-password':
      return {
        subject: 'Reset your password',
        html: layout(
          `Hi ${template.firstName},`,
          `<p>We received a request to reset your password. This link expires in ${template.expiresInMinutes} minutes.</p>${button(template.url, 'Reset password')}<p>If you did not request this, you can ignore this email.</p>`,
        ),
        text: `Hi ${template.firstName},\n\nReset your password (expires in ${template.expiresInMinutes} minutes): ${template.url}`,
      };
    case 'invite':
      return {
        subject: `You have been invited to ${template.organizationName}`,
        html: layout(
          `Hi ${template.firstName},`,
          `<p>You have been invited to join <strong>${escapeHtml(template.organizationName)}</strong> on Digisoft360 Help Desk.</p>${button(template.url, 'Accept invitation')}`,
        ),
        text: `Hi ${template.firstName},\n\nAccept your invitation to ${template.organizationName}: ${template.url}`,
      };
    case 'password-changed':
      return {
        subject: 'Your password was changed',
        html: layout(
          `Hi ${template.firstName},`,
          `<p>Your Digisoft360 Help Desk password was just changed. If this was not you, contact your administrator immediately.</p>`,
        ),
        text: `Hi ${template.firstName},\n\nYour password was just changed. If this was not you, contact your administrator immediately.`,
      };
  }
}
