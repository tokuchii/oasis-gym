import nodemailer from 'nodemailer'

let transporter: nodemailer.Transporter | null = null

function getTransporter() {
  const config = useRuntimeConfig()
  const user = config.gmailUser
  const pass = config.gmailAppPassword

  if (!user || !pass) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Email service not configured. Set GMAIL_USER and GMAIL_APP_PASSWORD in .env',
    })
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user, pass },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    })
  }
  return transporter
}

function getFromAddress() {
  const config = useRuntimeConfig()
  return `OASIS FITNESS GYM <${config.gmailUser}>`
}

const EMAIL_STYLES = `
  font-family: Arial, sans-serif;
  max-width: 600px;
  margin: 0 auto;
  background: #0a0a0a;
  color: #F5F0E8;
  padding: 40px;
`

const HEADER = `
  <div style="text-align: center; margin-bottom: 30px;">
    <h1 style="font-size: 32px; color: #C9A84C; margin: 0; letter-spacing: 4px;">OASIS FITNESS GYM</h1>
    <p style="color: #A89F8C; font-size: 12px; text-transform: uppercase; letter-spacing: 3px;">Calauan, Laguna</p>
  </div>
`

const FOOTER = `
  <div style="border-top: 1px solid #2E2E2E; padding-top: 20px; text-align: center;">
    <p style="color: #A89F8C; font-size: 11px;">
      OASIS FITNESS GYM — Calauan, Laguna, Philippines<br>
      &copy; ${new Date().getFullYear()} All rights reserved.
    </p>
  </div>
`

export async function sendCertificationEmail(params: {
  to: string
  fullName: string
  plan: string
}) {
  const planLabel = params.plan === 'weekly' ? 'Weekly' : 'Monthly'
  const expiryDate = new Date()
  if (params.plan === 'weekly') {
    expiryDate.setDate(expiryDate.getDate() + 7)
  } else {
    expiryDate.setMonth(expiryDate.getMonth() + 1)
  }

  const info = await getTransporter().sendMail({
    from: getFromAddress(),
    to: params.to,
    subject: `Welcome to OASIS FITNESS GYM — ${planLabel} Member`,
    html: `
      <div style="${EMAIL_STYLES}">
        ${HEADER}
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
        ${FOOTER}
      </div>
    `,
  })
  console.log('[Email] Certification email sent to:', params.to, 'Message ID:', info.messageId)
  return info.messageId
}

export async function sendMembershipApprovedEmail(params: {
  to: string
  fullName: string
  plan: string
  expiryDate: string
}) {
  const planLabel = params.plan === 'weekly' ? 'Weekly' : 'Monthly'

  const info = await getTransporter().sendMail({
    from: getFromAddress(),
    to: params.to,
    subject: `Your ${planLabel} Membership at OASIS FITNESS GYM has been Approved!`,
    html: `
      <div style="${EMAIL_STYLES}">
        ${HEADER}
        <div style="border: 1px solid #28a745; padding: 30px; text-align: center; margin-bottom: 30px;">
          <p style="color: #28a745; font-size: 12px; text-transform: uppercase; letter-spacing: 3px; margin-bottom: 10px;">Membership Approved</p>
          <h2 style="font-size: 24px; margin: 10px 0;">${params.fullName}</h2>
          <p style="color: #A89F8C; font-size: 14px;">${planLabel} Membership</p>
          <p style="color: #A89F8C; font-size: 12px; margin-top: 15px;">Valid until ${params.expiryDate}</p>
        </div>
        <div style="text-align: center; margin-bottom: 30px;">
          <p style="color: #A89F8C; font-size: 13px; line-height: 1.6;">
            Great news! Your ${planLabel} membership payment has been approved.<br>
            You can now visit the gym and enjoy full access to all facilities.
          </p>
          <p style="color: #C9A84C; font-size: 14px; margin-top: 20px; font-weight: bold;">
            See you at the gym!
          </p>
        </div>
        ${FOOTER}
      </div>
    `,
  })
  console.log('[Email] Approval email sent to:', params.to, 'Message ID:', info.messageId)
  return info.messageId
}

export async function sendMembershipRejectedEmail(params: {
  to: string
  fullName: string
  plan: string
}) {
  const planLabel = params.plan === 'weekly' ? 'Weekly' : 'Monthly'

  const info = await getTransporter().sendMail({
    from: getFromAddress(),
    to: params.to,
    subject: `Payment Update — OASIS FITNESS GYM ${planLabel} Membership`,
    html: `
      <div style="${EMAIL_STYLES}">
        ${HEADER}
        <div style="border: 1px solid #dc3545; padding: 30px; text-align: center; margin-bottom: 30px;">
          <p style="color: #dc3545; font-size: 12px; text-transform: uppercase; letter-spacing: 3px; margin-bottom: 10px;">Payment Not Approved</p>
          <h2 style="font-size: 24px; margin: 10px 0;">${params.fullName}</h2>
          <p style="color: #A89F8C; font-size: 14px;">${planLabel} Membership</p>
        </div>
        <div style="text-align: center; margin-bottom: 30px;">
          <p style="color: #A89F8C; font-size: 13px; line-height: 1.6;">
            We were unable to verify your ${planLabel} membership payment.<br>
            Please double-check your payment details and resubmit, or contact us for assistance.
          </p>
          <p style="color: #C9A84C; font-size: 14px; margin-top: 20px;">
            You can resubmit your payment from our website.
          </p>
        </div>
        ${FOOTER}
      </div>
    `,
  })
  console.log('[Email] Rejection email sent to:', params.to, 'Message ID:', info.messageId)
  return info.messageId
}

export async function sendRenewalReminder(params: {
  to: string
  fullName: string
  plan: string
  expiryDate: string
}) {
  const planLabel = params.plan === 'weekly' ? 'Weekly' : 'Monthly'

  const info = await getTransporter().sendMail({
    from: getFromAddress(),
    to: params.to,
    subject: `Your ${planLabel} Membership at OASIS FITNESS GYM is expiring soon`,
    html: `
      <div style="${EMAIL_STYLES}">
        ${HEADER}
        <div style="border: 1px solid #C9A84C; padding: 30px; text-align: center; margin-bottom: 30px;">
          <p style="color: #C9A84C; font-size: 12px; text-transform: uppercase; letter-spacing: 3px; margin-bottom: 10px;">Renewal Reminder</p>
          <h2 style="font-size: 24px; margin: 10px 0;">${params.fullName}</h2>
          <p style="color: #A89F8C; font-size: 14px;">${planLabel} Membership</p>
          <p style="color: #E2C97E; font-size: 16px; font-weight: bold; margin-top: 15px;">Expires on ${params.expiryDate}</p>
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
        ${FOOTER}
      </div>
    `,
  })
  console.log('[Email] Renewal reminder sent to:', params.to, 'Message ID:', info.messageId)
  return info.messageId
}
