import { Resend } from 'resend'
import type { HealthFailure } from './health'

const resend = new Resend(process.env.RESEND_API_KEY)

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', {
    weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC',
  })
}

function formatTime(d: Date): string {
  return d.toISOString().slice(11, 16) + ' UTC'
}

function buildAlertHtml(failures: HealthFailure[], now: Date, appUrl: string): string {
  const s = failures.length !== 1 ? 's' : ''

  const failureBlocks = failures.map(f => `
    <tr>
      <td style="padding:18px 28px;border-bottom:1px solid #f0f0f0;">
        <div style="font-size:11px;font-weight:700;color:#dc2626;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px;">${f.check}</div>
        <div style="font-size:14px;color:#374151;line-height:1.6;">${f.detail}</div>
      </td>
    </tr>`).join('')

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td style="background:#111827;padding:22px 28px;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="color:#9ca3af;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.12em;">AI Pulse</td>
                <td align="right" style="color:#f87171;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;">&#9888; Health Alert</td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Summary -->
        <tr>
          <td style="padding:20px 28px 18px;border-bottom:2px solid #f0f0f0;">
            <div style="font-size:20px;font-weight:700;color:#111827;">${failures.length} issue${s} detected</div>
            <div style="font-size:13px;color:#6b7280;margin-top:4px;">${formatDate(now)} &nbsp;·&nbsp; ${formatTime(now)}</div>
          </td>
        </tr>

        <!-- Failures -->
        ${failureBlocks}

        <!-- Footer -->
        <tr>
          <td style="padding:18px 28px;background:#f9fafb;">
            <a href="${appUrl}/api/health" style="color:#4f46e5;font-size:13px;font-weight:500;text-decoration:none;">View health dashboard &rarr;</a>
            <div style="color:#9ca3af;font-size:12px;margin-top:6px;">AI Pulse &nbsp;·&nbsp; automated alert</div>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`
}

function buildAlertText(failures: HealthFailure[], now: Date): string {
  const s = failures.length !== 1 ? 's' : ''
  return [
    `${failures.length} issue${s} detected — ${formatDate(now)} ${formatTime(now)}`,
    '',
    ...failures.flatMap(f => [f.check, `  ${f.detail}`, '']),
    '─'.repeat(40),
    `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/api/health`,
  ].join('\n')
}

export async function sendAlert(failures: HealthFailure[]): Promise<void> {
  const to = process.env.ALERT_EMAIL
  if (!to) throw new Error('ALERT_EMAIL env var is not set')

  const now = new Date()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://your-app.vercel.app'
  const s = failures.length !== 1 ? 's' : ''
  const subject = `[AI Pulse] ${failures.length} issue${s} — ${now.toISOString().split('T')[0]}`
  const from = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev'

  await resend.emails.send({
    from: `AI Pulse <${from}>`,
    to,
    subject,
    html: buildAlertHtml(failures, now, appUrl),
    text: buildAlertText(failures, now),
  })
}
