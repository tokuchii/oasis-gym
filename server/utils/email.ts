import nodemailer from 'nodemailer'

let transporter: nodemailer.Transporter | null = null

function getTransporter() {
  const config = useRuntimeConfig()
  const user = config.emailUser
  const pass = config.emailPassword

  if (!user || !pass) {
    throw createError({
      statusCode: 503,
      statusMessage: 'Email not configured. Set EMAIL_USER and EMAIL_PASSWORD.',
    })
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.emailHost || 'smtp.gmail.com',
      port: Number(config.emailPort) || 587,
      secure: config.emailSecure === 'true',
      auth: { user, pass },
      connectionTimeout: 15000,
      socketTimeout: 20000,
    })
  }
  return transporter
}

function getFromAddress() {
  const config = useRuntimeConfig()
  return config.emailFrom || `OASIS FITNESS GYM <${config.emailUser}>`
}

const GYM_ADDRESS = 'Calauan, Laguna 4012, Philippines'

function getEmailStyles() {
  return `
    font-family: Arial, sans-serif;
    max-width: 600px;
    margin: 0 auto;
    background: #0a0a0a;
    color: #F5F0E8;
    padding: 40px;
  `
}

function getHeader() {
  return `
    <div style="text-align: center; margin-bottom: 30px;">
      <h1 style="font-size: 32px; color: #C9A84C; margin: 0; letter-spacing: 4px;">OASIS FITNESS GYM</h1>
      <p style="color: #A89F8C; font-size: 12px; text-transform: uppercase; letter-spacing: 3px;">Calauan, Laguna</p>
    </div>
  `
}

function getFooter() {
  return `
    <div style="border-top: 1px solid #2E2E2E; padding-top: 20px; text-align: center;">
      <p style="color: #A89F8C; font-size: 11px;">
        OASIS FITNESS GYM — ${GYM_ADDRESS}<br>
        This is a transactional email regarding your membership.<br>
        &copy; ${new Date().getFullYear()} All rights reserved.
      </p>
    </div>
  `
}

async function sendEmail(to: string, subject: string, html: string, textFallback: string) {
  const config = useRuntimeConfig()
  const user = config.emailUser
  const pass = config.emailPassword

  if (!user || !pass) {
    console.error('[Email] Skipped — EMAIL_USER or EMAIL_PASSWORD not set')
    return
  }

  const info = await getTransporter().sendMail({
    from: getFromAddress(),
    to,
    replyTo: user,
    subject,
    text: textFallback,
    html,
    headers: {
      'X-Mailer': 'OASIS-Fitness-GYM/1.0',
      'List-Unsubscribe': `<mailto:${user}?subject=unsubscribe>`,
      'Precedence': 'bulk',
      'X-Auto-Response-Suppress': 'All',
    },
  })
  console.log('[Email] Sent | ID:', info.messageId)
  return info.messageId
}

export async function sendCertificationEmail(params: {
  to: string
  fullName: string
  plan: string
}) {
  const planLabel = params.plan === 'weekly' ? 'Weekly' : 'Monthly'
  const expiryDate = new Date()
  expiryDate.setFullYear(expiryDate.getFullYear() + 1)

  const expiryStr = expiryDate.toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })

  return sendEmail(
    params.to,
    `Welcome to OASIS FITNESS GYM — ${planLabel} Member`,
    `
      <div style="${getEmailStyles()}">
        ${getHeader()}
        <div style="border: 1px solid #C9A84C; padding: 30px; text-align: center; margin-bottom: 30px;">
          <p style="color: #C9A84C; font-size: 12px; text-transform: uppercase; letter-spacing: 3px; margin-bottom: 10px;">Certified Member</p>
          <h2 style="font-size: 24px; margin: 10px 0;">${params.fullName}</h2>
          <p style="color: #A89F8C; font-size: 14px;">${planLabel} Membership</p>
          <p style="color: #A89F8C; font-size: 12px; margin-top: 15px;">Valid until ${expiryStr}</p>
        </div>
        <div style="text-align: center; margin-bottom: 30px;">
          <p style="color: #A89F8C; font-size: 13px; line-height: 1.6;">
            Congratulations! You are now a certified member of OASIS FITNESS GYM.<br>
            Present this email at the front desk on your first visit.
          </p>
        </div>
        ${getFooter()}
      </div>
    `,
    `OASIS FITNESS GYM — Membership Confirmation\n\nHi ${params.fullName},\n\nCongratulations! You are now a certified ${planLabel} member of OASIS FITNESS GYM.\n\nValid until: ${expiryStr}\n\nPresent this email at the front desk on your first visit.\n\nOASIS FITNESS GYM\n${GYM_ADDRESS}`,
  )
}

export async function sendMembershipApprovedEmail(params: {
  to: string
  fullName: string
  plan: string
  expiryDate: string
}) {
  const planLabel = params.plan === 'weekly' ? 'Weekly' : 'Monthly'

  return sendEmail(
    params.to,
    `Your ${planLabel} Membership at OASIS FITNESS GYM has been Approved!`,
    `
      <div style="${getEmailStyles()}">
        ${getHeader()}
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
          <p style="color: #C9A84C; font-size: 14px; margin-top: 20px; font-weight: bold;">See you at the gym!</p>
        </div>
        ${getFooter()}
      </div>
    `,
    `OASIS FITNESS GYM — Membership Approved\n\nHi ${params.fullName},\n\nYour ${planLabel} membership has been approved!\nValid until: ${params.expiryDate}\n\nYou can now visit the gym and enjoy full access to all facilities.\n\nOASIS FITNESS GYM\n${GYM_ADDRESS}`,
  )
}

export async function sendMembershipRejectedEmail(params: {
  to: string
  fullName: string
  plan: string
}) {
  const planLabel = params.plan === 'weekly' ? 'Weekly' : 'Monthly'

  return sendEmail(
    params.to,
    `Payment Update — OASIS FITNESS GYM ${planLabel} Membership`,
    `
      <div style="${getEmailStyles()}">
        ${getHeader()}
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
          <p style="color: #C9A84C; font-size: 14px; margin-top: 20px;">You can resubmit your payment from our website.</p>
        </div>
        ${getFooter()}
      </div>
    `,
    `OASIS FITNESS GYM — Payment Update\n\nHi ${params.fullName},\n\nWe were unable to verify your ${planLabel} membership payment.\nPlease double-check your payment details and resubmit, or contact us for assistance.\n\nOASIS FITNESS GYM\n${GYM_ADDRESS}`,
  )
}

export async function sendRenewalReminder(params: {
  to: string
  fullName: string
  plan: string
  expiryDate: string
}) {
  const planLabel = params.plan === 'weekly' ? 'Weekly' : 'Monthly'

  return sendEmail(
    params.to,
    `Your ${planLabel} Membership at OASIS FITNESS GYM is expiring soon`,
    `
      <div style="${getEmailStyles()}">
        ${getHeader()}
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
          <p style="color: #C9A84C; font-size: 14px; margin-top: 20px;">Renew now to keep your access active!</p>
        </div>
        ${getFooter()}
      </div>
    `,
    `OASIS FITNESS GYM — Membership Expiring Soon\n\nHi ${params.fullName},\n\nYour ${planLabel} membership is expiring on ${params.expiryDate}.\nVisit the gym or contact us to renew your plan.\n\nOASIS FITNESS GYM\n${GYM_ADDRESS}`,
  )
}
