import { Resend } from 'resend'

let resendClient: Resend | null = null

function getResendClient() {
  const config = useRuntimeConfig()
  const apiKey = config.resendApiKey
  if (!apiKey) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Email service not configured. Set RESEND_API_KEY.',
    })
  }
  if (!resendClient) {
    resendClient = new Resend(apiKey)
  }
  return resendClient
}

export async function sendCertificationEmail(params: {
  to: string
  fullName: string
  plan: string
}) {
  const config = useRuntimeConfig()
  const resend = getResendClient()

  const planLabel = params.plan === 'weekly' ? 'Weekly' : 'Monthly'
  const expiryDate = new Date()
  if (params.plan === 'weekly') {
    expiryDate.setDate(expiryDate.getDate() + 7)
  } else {
    expiryDate.setMonth(expiryDate.getMonth() + 1)
  }

  const { error } = await resend.emails.send({
    from: config.emailFrom,
    to: params.to,
    subject: `Welcome to OASIS FITNESS GYM — ${planLabel} Member`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0a0a0a; color: #F5F0E8; padding: 40px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="font-size: 32px; color: #C9A84C; margin: 0; letter-spacing: 4px;">OASIS FITNESS GYM</h1>
          <p style="color: #A89F8C; font-size: 12px; text-transform: uppercase; letter-spacing: 3px;">Calauan, Laguna</p>
        </div>

        <div style="border: 1px solid #C9A84C; padding: 30px; text-align: center; margin-bottom: 30px;">
          <p style="color: #C9A84C; font-size: 12px; text-transform: uppercase; letter-spacing: 3px; margin-bottom: 10px;">Certified Member</p>
          <h2 style="font-size: 24px; margin: 10px 0;">${params.fullName}</h2>
          <p style="color: #A89F8C; font-size: 14px;">${planLabel} Membership</p>
          <p style="color: #A89F8C; font-size: 12px; margin-top: 15px;">Valid until ${expiryDate.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>

        <div style="text-align: center; margin-bottom: 30px;">
          <p style="color: #A89F8C; font-size: 13px; line-height: 1.6;">
            Congratulations! You are now a certified member of OASIS FITNESS GYM.<br>
            Present this email at the front desk on your first visit.
          </p>
        </div>

        <div style="border-top: 1px solid #2E2E2E; padding-top: 20px; text-align: center;">
          <p style="color: #A89F8C; font-size: 11px;">
            OASIS FITNESS GYM — Calauan, Laguna, Philippines<br>
            &copy; ${new Date().getFullYear()} All rights reserved.
          </p>
        </div>
      </div>
    `,
  })

  if (error) {
    console.error('Email send error:', error)
  }
}

export async function sendRenewalReminder(params: {
  to: string
  fullName: string
  plan: string
  expiryDate: string
}) {
  const config = useRuntimeConfig()
  const resend = getResendClient()

  const planLabel = params.plan === 'weekly' ? 'Weekly' : 'Monthly'

  const { error } = await resend.emails.send({
    from: config.emailFrom,
    to: params.to,
    subject: `Your ${planLabel} Membership at OASIS FITNESS GYM is expiring soon`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0a0a0a; color: #F5F0E8; padding: 40px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="font-size: 32px; color: #C9A84C; margin: 0; letter-spacing: 4px;">OASIS FITNESS GYM</h1>
          <p style="color: #A89F8C; font-size: 12px; text-transform: uppercase; letter-spacing: 3px;">Calauan, Laguna</p>
        </div>

        <div style="border: 1px solid #C9A84C; padding: 30px; text-align: center; margin-bottom: 30px;">
          <p style="color: #C9A84C; font-size: 12px; text-transform: uppercase; letter-spacing: 3px; margin-bottom: 10px;">Renewal Reminder</p>
          <h2 style="font-size: 24px; margin: 10px 0;">${params.fullName}</h2>
          <p style="color: #A89F8C; font-size: 14px;">${planLabel} Membership</p>
          <p style="color: #E2C97E; font-size: 16px; font-weight: bold; margin-top: 15px;">Expires on ${expiryDate}</p>
        </div>

        <div style="text-align: center; margin-bottom: 30px;">
          <p style="color: #A89F8C; font-size: 13px; line-height: 1.6;">
            Your ${planLabel} membership is about to expire.<br>
            Visit the gym or contact us to renew your plan and continue enjoying our facilities.
          </p>
          <p style="color: #C9A84C; font-size: 14px; margin-top: 20px;">
            Renew now to keep your access active!
          </p>
        </div>

        <div style="border-top: 1px solid #2E2E2E; padding-top: 20px; text-align: center;">
          <p style="color: #A89F8C; font-size: 11px;">
            OASIS FITNESS GYM — Calauan, Laguna, Philippines<br>
            &copy; ${new Date().getFullYear()} All rights reserved.
          </p>
        </div>
      </div>
    `,
  })

  if (error) {
    console.error('Renewal email send error:', error)
  }
}
