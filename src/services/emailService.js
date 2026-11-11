import nodemailer from 'nodemailer';

/**
 * Configure Nodemailer transport
 */
const createTransporter = () => {
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASSWORD;

  if (!user || !pass) {
    return null;
  }

  const isGmail = !process.env.EMAIL_HOST || process.env.EMAIL_HOST.includes('gmail');

  if (isGmail) {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user,
        pass,
      },
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      socketTimeout: 10000,
    });
  }

  const host = process.env.EMAIL_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.EMAIL_PORT, 10) || 587;

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: {
      user,
      pass,
    },
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 10000,
  });
};

const BRAND_NAME = 'Velmora';
const STORE_URL = process.env.FRONTEND_URL || 'https://velmoraindia.store';

/**
 * Dispatch email through Brevo API (HTTPS port 443), Resend API (HTTPS port 443), or Nodemailer SMTP fallback.
 * NOTE: Render's Free Tier blocks outbound SMTP ports 25, 465, and 587.
 * When running on Render Free Tier, setting BREVO_API_KEY sends via HTTPS port 443 which is never blocked.
 */
export const dispatchEmail = async ({ fromName, to, subject, html, text }) => {
  const brandName = fromName || BRAND_NAME;
  const senderEmail = process.env.EMAIL_USER || process.env.BREVO_SENDER_EMAIL || 'velmora.shop.india.2026@gmail.com';

  // 1. Try Brevo HTTP REST API (Port 443 - works on Render Free Tier without domain DNS setup)
  if (process.env.BREVO_API_KEY) {
    try {
      const res = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'api-key': process.env.BREVO_API_KEY,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          sender: {
            name: brandName,
            email: senderEmail,
          },
          to: [{ email: to }],
          subject,
          htmlContent: html,
          ...(text ? { textContent: text } : {}),
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const errMsg = data.message || `Brevo API HTTP ${res.status}`;
        throw new Error(`[Brevo API Error] ${errMsg}`);
      }

      console.log(`[Email Service - Brevo] ✅ Dispatched email to ${to} (MessageId: ${data.messageId || 'ok'})`);
      return { success: true, provider: 'brevo', messageId: data.messageId };
    } catch (err) {
      console.error(`[Email Service - Brevo Error] Failed to send email to ${to}:`, err.message);
      throw err;
    }
  }

  // 2. Try Resend HTTP REST API (Port 443 - works on Render Free Tier)
  if (process.env.RESEND_API_KEY) {
    try {
      const fromField = process.env.RESEND_FROM || `${brandName} <onboarding@resend.dev>`;
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: fromField,
          to: [to],
          subject,
          html,
          ...(text ? { text } : {}),
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const errMsg = data.message || `Resend API HTTP ${res.status}`;
        throw new Error(`[Resend API Error] ${errMsg}`);
      }

      console.log(`[Email Service - Resend] ✅ Dispatched email to ${to} (Id: ${data.id || 'ok'})`);
      return { success: true, provider: 'resend', messageId: data.id };
    } catch (err) {
      console.error(`[Email Service - Resend Error] Failed to send email to ${to}:`, err.message);
      throw err;
    }
  }

  // 3. Fallback: Nodemailer SMTP
  const transporter = createTransporter();
  if (!transporter) {
    console.log(`[Email Service Simulation] Simulated dispatch to ${to}: "${subject}". Set BREVO_API_KEY or EMAIL_USER/EMAIL_PASSWORD to send live.`);
    return { success: true, simulated: true };
  }

  try {
    const info = await transporter.sendMail({
      from: `"${brandName}" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
      ...(text ? { text } : {}),
    });

    console.log(`[Email Service - SMTP] ✅ Dispatched email to ${to} (MessageId: ${info.messageId})`);
    return { success: true, provider: 'smtp', messageId: info.messageId };
  } catch (error) {
    if (error.code === 'ETIMEDOUT' || error.message?.includes('timeout')) {
      console.error(
        `[Email Service - SMTP Error] Connection timed out sending to ${to}. ` +
        `Render Free Tier blocks outbound SMTP ports 25, 465, and 587. ` +
        `To fix: Add BREVO_API_KEY to Render environment variables to send over HTTPS port 443.`
      );
    } else {
      console.error(`[Email Service - SMTP Error] Failed to send email to ${to}:`, error.message);
    }
    throw error;
  }
};

/**
 * Shared Luxury Email Layout Wrapper
 */
const wrapInEmailLayout = ({ previewText, contentHtml }) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${BRAND_NAME}</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #F8F5F0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #2B0F3A;
      -webkit-font-smoothing: antialiased;
    }
    table { border-collapse: collapse; }
    .email-container {
      max-width: 600px;
      margin: 30px auto;
      background-color: #FFFFFF;
      border: 1px solid #EAE3D9;
      border-radius: 8px;
      overflow: hidden;
      box-shadow: 0 4px 20px rgba(43, 15, 58, 0.04);
    }
    .header-banner {
      background: linear-gradient(135deg, #4A1236 0%, #2B0F3A 100%);
      padding: 36px 24px;
      text-align: center;
    }
    .brand-title {
      color: #FFFFFF;
      font-size: 28px;
      letter-spacing: 4px;
      margin: 0;
      font-weight: 700;
      text-transform: uppercase;
    }
    .brand-subtitle {
      color: #D4AF37;
      font-size: 11px;
      letter-spacing: 2px;
      margin-top: 6px;
      text-transform: uppercase;
      font-weight: 600;
    }
    .body-content {
      padding: 36px 32px;
      font-size: 15px;
      line-height: 1.65;
      color: #3C2E3D;
    }
    .gold-divider {
      height: 2px;
      width: 48px;
      background-color: #D4AF37;
      margin: 20px 0;
    }
    .cta-button {
      display: inline-block;
      background-color: #6B1D4F;
      color: #FFFFFF !important;
      text-decoration: none;
      padding: 14px 32px;
      border-radius: 4px;
      font-size: 14px;
      font-weight: 600;
      letter-spacing: 1px;
      text-transform: uppercase;
      margin: 24px 0 12px;
    }
    .info-card {
      background-color: #FAF7F2;
      border: 1px solid #EBE4DA;
      border-radius: 6px;
      padding: 20px;
      margin: 24px 0;
    }
    .footer {
      background-color: #FAF7F2;
      border-top: 1px solid #EAE3D9;
      padding: 24px 32px;
      text-align: center;
      font-size: 12px;
      color: #8C7B8D;
    }
    .footer a {
      color: #6B1D4F;
      text-decoration: none;
      font-weight: 600;
    }
  </style>
</head>
<body>
  <div style="display:none;font-size:1px;color:#F8F5F0;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">
    ${previewText}
  </div>

  <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
    <tr>
      <td align="center">
        <div class="email-container">
          <!-- Brand Header -->
          <div class="header-banner">
            <h1 class="brand-title">${BRAND_NAME}</h1>
            <div class="brand-subtitle">Luxury Indian Couture & Daily Elegance</div>
          </div>

          <!-- Main Content -->
          <div class="body-content">
            ${contentHtml}
          </div>

          <!-- Footer -->
          <div class="footer">
            <p style="margin: 0 0 8px;">
              Need assistance? Connect with our dedicated styling concierge at<br />
              <a href="mailto:${process.env.EMAIL_USER || 'support@velmoraindia.store'}">${process.env.EMAIL_USER || 'support@velmoraindia.store'}</a>
            </p>
            <p style="margin: 12px 0 0; font-size: 11px; color: #A89CA9;">
              © ${new Date().getFullYear()} ${BRAND_NAME}. Handcrafted in India. All rights reserved.
            </p>
          </div>
        </div>
      </td>
    </tr>
  </table>
</body>
</html>
`;

/**
 * 0. Send 6-digit OTP Verification Email for Account Creation
 */
export const sendOtpEmail = async ({ to, fullName, otp }) => {
  try {
    const greetingName = fullName ? fullName.trim() : 'Valued Customer';

    const contentHtml = `
      <h2 style="color: #2B0F3A; font-size: 22px; margin-top: 0; font-weight: 600;">
        Verify Your Email Address
      </h2>
      <div class="gold-divider"></div>
      <p>
        Hello ${greetingName},<br />
        Thank you for starting your account registration with <strong>${BRAND_NAME}</strong>. Please use the verification code below to confirm your email and complete your sign-up.
      </p>

      <div style="background: #FAF7F2; border: 2px dashed #C8A45D; border-radius: 8px; padding: 24px 16px; margin: 28px 0; text-align: center;">
        <span style="font-size: 11px; text-transform: uppercase; letter-spacing: 2px; color: #8C7B8D; font-weight: 700; display: block; margin-bottom: 8px;">Your 6-Digit Verification Code</span>
        <div style="font-family: 'Courier New', Courier, monospace; font-size: 38px; font-weight: 800; letter-spacing: 12px; color: #6B1D4F; padding-left: 12px;">
          ${otp}
        </div>
      </div>

      <div class="info-card" style="font-size: 13px; color: #6A5B6C;">
        <strong style="color: #2B0F3A;">Important Security Note:</strong><br />
        • This OTP is valid for <strong>10 minutes</strong> only.<br />
        • For your account security, never share this code with anyone.
      </div>

      <p style="margin-top: 24px; font-size: 13px; color: #766477;">
        If you did not attempt to register on ${BRAND_NAME}, please safely disregard this email.<br /><br />
        Warm regards,<br />
        <strong style="color: #2B0F3A;">The ${BRAND_NAME} Security Team</strong>
      </p>
    `;

    await dispatchEmail({
      fromName: `${BRAND_NAME} Verification`,
      to,
      subject: `${otp} is your ${BRAND_NAME} verification code`,
      html: wrapInEmailLayout({
        previewText: `${otp} is your verification code for ${BRAND_NAME}. Valid for 10 minutes.`,
        contentHtml,
      }),
      text: `Your ${BRAND_NAME} verification code is: ${otp}. Valid for 10 minutes.`,
    });

    return true;
  } catch (error) {
    console.error(`[Email Service Error] Failed to send OTP email to ${to}:`, error.message);
    return false;
  }
};

/**
 * 1. Send Welcome Email to newly registered user
 */
export const sendWelcomeEmail = async ({ to, fullName }) => {
  try {
    const greetingName = fullName ? fullName.trim() : 'Valued Customer';

    const contentHtml = `
      <h2 style="color: #2B0F3A; font-size: 22px; margin-top: 0; font-weight: 600;">
        Welcome to ${BRAND_NAME}, ${greetingName}
      </h2>
      <div class="gold-divider"></div>
      <p>
        Thank you for creating your account with ${BRAND_NAME}. We are delighted to welcome you to our curated destination of exquisite sarees, artisanal kurtis, lehengas, and contemporary lifestyle couture.
      </p>

      <div class="info-card">
        <h4 style="margin: 0 0 10px; color: #6B1D4F; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">
          Your Account Privileges:
        </h4>
        <ul style="margin: 0; padding-left: 20px; color: #4E3E4F; font-size: 14px; line-height: 1.7;">
          <li><strong>Free Express Insured Delivery</strong> across all pincodes in India</li>
          <li><strong>Express Checkout</strong> with saved delivery destinations</li>
          <li><strong>Real-time Order Tracking</strong> and instant dispatch notifications</li>
          <li><strong>Priority Access</strong> to new seasonal drops and festive collections</li>
        </ul>
      </div>

      <p style="margin-bottom: 8px;">
        Discover our latest curated arrivals designed to elevate your everyday and festive wardrobe.
      </p>

      <div style="text-align: center; margin: 28px 0;">
        <a href="${STORE_URL}/shop" class="cta-button">Explore Collections</a>
      </div>

      <p style="margin-top: 24px; font-size: 13px; color: #766477;">
        Warm regards,<br />
        <strong style="color: #2B0F3A;">The ${BRAND_NAME} Team</strong>
      </p>
    `;

    await dispatchEmail({
      fromName: BRAND_NAME,
      to,
      subject: `Welcome to ${BRAND_NAME} — Handcrafted Luxury`,
      html: wrapInEmailLayout({
        previewText: `Welcome to ${BRAND_NAME}. Your account has been successfully created.`,
        contentHtml,
      }),
      text: `Welcome to ${BRAND_NAME}! Your account has been successfully created.`,
    });

    return true;
  } catch (error) {
    console.error(`[Email Service Error] Failed to send welcome email to ${to}:`, error.message);
    return false;
  }
};

/**
 * 2. Send Password Reset Email
 */
export const sendPasswordResetEmail = async ({ to, resetUrl }) => {
  try {
    const contentHtml = `
      <h2 style="color: #2B0F3A; font-size: 22px; margin-top: 0; font-weight: 600;">
        Reset Your Password
      </h2>
      <div class="gold-divider"></div>
      <p>
        We received a request to reset the password for your ${BRAND_NAME} account associated with <strong>${to}</strong>.
      </p>
      <p>
        Click the secure button below to choose a new password. For your security, this recovery link will expire in <strong>1 hour</strong>.
      </p>

      <div style="text-align: center; margin: 32px 0;">
        <a href="${resetUrl}" class="cta-button">Reset Password</a>
      </div>

      <div class="info-card" style="font-size: 13px; color: #6A5B6C;">
        <strong style="color: #2B0F3A;">Didn't request this change?</strong><br />
        If you did not initiate this password reset, please ignore this email. Your current password remains completely secure.
      </div>

      <p style="font-size: 12px; color: #8F8191; word-break: break-all; margin-top: 24px;">
        If the button above does not open, copy and paste this secure link directly into your browser:<br />
        <a href="${resetUrl}" style="color: #6B1D4F;">${resetUrl}</a>
      </p>
    `;

    await dispatchEmail({
      fromName: `${BRAND_NAME} Security`,
      to,
      subject: `${BRAND_NAME} Account — Password Reset Request`,
      html: wrapInEmailLayout({
        previewText: `Reset your ${BRAND_NAME} account password. Link expires in 1 hour.`,
        contentHtml,
      }),
      text: `Reset your ${BRAND_NAME} account password: ${resetUrl}`,
    });

    return true;
  } catch (error) {
    console.error(`[Email Service Error] Reset email failed for ${to}:`, error.message);
    return false;
  }
};

/**
 * 3. Send Order Confirmation Email
 */
export const sendOrderConfirmationEmail = async ({
  to,
  fullName,
  orderNumber,
  items = [],
  shippingAddress = {},
  subtotal = 0,
  shippingCost = 0,
  grandTotal = 0,
}) => {
  try {
    const customerName = fullName ? fullName.trim() : 'Valued Customer';
    const displayOrderNum = orderNumber || `VEL-${Math.floor(100000 + Math.random() * 900000)}`;

    // Build items table HTML
    const itemsHtml = items.map((item) => `
      <tr style="border-bottom: 1px solid #EBE4DA;">
        <td style="padding: 12px 0;">
          <strong style="color: #2B0F3A; font-size: 14px;">${item.title || 'Velmora Garment'}</strong>
          ${item.selectedSize ? `<br /><span style="color: #7E6C7F; font-size: 12px;">Size: ${item.selectedSize}</span>` : ''}
          ${item.selectedColor?.name ? `<span style="color: #7E6C7F; font-size: 12px;"> | Color: ${item.selectedColor.name}</span>` : ''}
        </td>
        <td style="padding: 12px 0; text-align: center; color: #4E3E4F; font-size: 14px;">
          × ${item.quantity || 1}
        </td>
        <td style="padding: 12px 0; text-align: right; color: #2B0F3A; font-weight: 600; font-size: 14px;">
          ₹${((item.price || 0) * (item.quantity || 1)).toLocaleString('en-IN')}
        </td>
      </tr>
    `).join('');

    const contentHtml = `
      <div style="background-color: #F3EBE1; border-radius: 6px; padding: 12px 18px; margin-bottom: 24px; text-align: center;">
        <span style="font-size: 12px; color: #6B1D4F; text-transform: uppercase; letter-spacing: 1.5px; font-weight: 700;">Order Confirmed</span>
        <h3 style="margin: 4px 0 0; color: #2B0F3A; font-size: 20px;">Order #${displayOrderNum}</h3>
      </div>

      <h2 style="color: #2B0F3A; font-size: 20px; margin-top: 0; font-weight: 600;">
        Thank you for your order, ${customerName}!
      </h2>
      <div class="gold-divider"></div>
      <p>
        We have received your order and our atelier has begun preparing your handcrafted selections with utmost care. You will receive dispatch tracking updates as soon as your parcel is handed to our insured courier partner.
      </p>

      <!-- Items Summary Table -->
      <table width="100%" style="margin: 24px 0; border-top: 2px solid #2B0F3A;">
        <thead>
          <tr style="color: #8C7B8D; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; border-bottom: 1px solid #EBE4DA;">
            <th align="left" style="padding: 10px 0;">Item</th>
            <th align="center" style="padding: 10px 0;">Qty</th>
            <th align="right" style="padding: 10px 0;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>

      <!-- Price Breakdown -->
      <table width="100%" style="font-size: 14px; margin-bottom: 24px;">
        <tr>
          <td style="color: #6A5B6C; padding: 4px 0;">Subtotal</td>
          <td align="right" style="color: #2B0F3A; padding: 4px 0;">₹${Number(subtotal).toLocaleString('en-IN')}</td>
        </tr>
        <tr>
          <td style="color: #6A5B6C; padding: 4px 0;">Express Shipping across India</td>
          <td align="right" style="color: ${shippingCost === 0 ? '#108A4E' : '#2B0F3A'}; padding: 4px 0; font-weight: 600;">
            ${shippingCost === 0 ? 'FREE' : `₹${shippingCost}`}
          </td>
        </tr>
        <tr style="border-top: 1px solid #2B0F3A; font-size: 16px;">
          <td style="padding: 12px 0; font-weight: 700; color: #2B0F3A;">Grand Total</td>
          <td align="right" style="padding: 12px 0; font-weight: 700; color: #6B1D4F;">₹${Number(grandTotal).toLocaleString('en-IN')}</td>
        </tr>
      </table>

      ${shippingAddress && shippingAddress.addressLine1 ? `
        <!-- Delivery Address Box -->
        <div class="info-card">
          <strong style="color: #6B1D4F; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Delivery Destination:</strong>
          <p style="margin: 6px 0 0; color: #4E3E4F; font-size: 13px; line-height: 1.5;">
            ${shippingAddress.fullName || customerName}<br />
            ${shippingAddress.addressLine1} ${shippingAddress.addressLine2 || ''}<br />
            ${shippingAddress.city}, ${shippingAddress.state} - ${shippingAddress.postalCode}<br />
            Phone: ${shippingAddress.phoneNumber || 'Provided at checkout'}
          </p>
        </div>
      ` : ''}

      <div style="text-align: center; margin: 30px 0 10px;">
        <a href="${STORE_URL}/account" class="cta-button">View Order Status</a>
      </div>
    `;

    await dispatchEmail({
      fromName: `${BRAND_NAME} Orders`,
      to,
      subject: `Order Confirmed: #${displayOrderNum} — ${BRAND_NAME}`,
      html: wrapInEmailLayout({
        previewText: `Order #${displayOrderNum} confirmed! We are preparing your Velmora order.`,
        contentHtml,
      }),
      text: `Order Confirmed: #${displayOrderNum} — Thank you for shopping with ${BRAND_NAME}!`,
    });

    return true;
  } catch (error) {
    console.error(`[Email Service Error] Order confirmation failed for ${to}:`, error.message);
    return false;
  }
};

/**
 * 4. Diagnostic test email for verifying live delivery from Render
 */
export const sendTestEmailDiagnostic = async (to) => {
  const recipient = to || process.env.EMAIL_USER;
  if (!recipient) {
    return {
      success: false,
      error: 'No recipient email specified and EMAIL_USER is not set in environment.',
    };
  }

  const subject = `Velmora Email Test — ${new Date().toLocaleTimeString('en-IN')}`;
  const providerName = process.env.BREVO_API_KEY
    ? 'Brevo REST API (HTTPS Port 443)'
    : process.env.RESEND_API_KEY
    ? 'Resend REST API (HTTPS Port 443)'
    : `SMTP (${process.env.EMAIL_HOST || 'smtp.gmail.com'})`;

  const contentHtml = `
    <h2 style="color: #2B0F3A; font-size: 20px; margin-top: 0;">Diagnostic Email Delivery Test</h2>
    <div class="gold-divider"></div>
    <p>This is a live test email sent from your <strong>Velmora Backend</strong>.</p>
    <div class="info-card">
      <strong>Server Time:</strong> ${new Date().toISOString()}<br />
      <strong>Recipient:</strong> ${recipient}<br />
      <strong>Active Provider:</strong> ${providerName}
    </div>
    <p style="color: #108A4E; font-weight: 600;">
      ✅ Success! If you received this email, your Velmora account registration & OTP emails will deliver successfully!
    </p>
  `;

  try {
    const result = await dispatchEmail({
      fromName: `${BRAND_NAME} Diagnostic`,
      to: recipient,
      subject,
      html: wrapInEmailLayout({
        previewText: 'Velmora live email delivery test',
        contentHtml,
      }),
      text: 'Velmora diagnostic test email: Delivery successful!',
    });

    return {
      success: true,
      ...result,
      recipient,
      message: `Test email successfully dispatched to ${recipient} via ${providerName}`,
    };
  } catch (error) {
    const isTimeout = error.code === 'ETIMEDOUT' || error.message?.includes('timeout');
    return {
      success: false,
      error: error.message,
      provider: process.env.BREVO_API_KEY ? 'brevo' : process.env.RESEND_API_KEY ? 'resend' : 'smtp',
      hint: isTimeout
        ? 'Render Free Tier blocks outbound SMTP ports 25, 465, and 587. Configure BREVO_API_KEY in Render environment variables to send over HTTPS port 443 without firewall restrictions.'
        : undefined,
    };
  }
};

export default {
  dispatchEmail,
  sendOtpEmail,
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendOrderConfirmationEmail,
  sendTestEmailDiagnostic,
};
