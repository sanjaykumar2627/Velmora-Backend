import nodemailer from 'nodemailer';

/**
 * Configure Nodemailer transport
 */
const createTransporter = () => {
  const host = process.env.EMAIL_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.EMAIL_PORT, 10) || 587;
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASSWORD;

  if (!user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: {
      user,
      pass,
    },
  });
};

const BRAND_NAME = 'Velmora';
const STORE_URL = process.env.FRONTEND_URL || 'https://velmoraindia.store';

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
 * 1. Send Welcome Email to newly registered user
 */
export const sendWelcomeEmail = async ({ to, fullName }) => {
  try {
    const transporter = createTransporter();

    if (!transporter) {
      console.log(`[Email Service Simulation] Welcome email simulated for ${to} (${fullName}). Configure EMAIL_USER/EMAIL_PASSWORD to dispatch live.`);
      return true;
    }

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

    const mailOptions = {
      from: `"${BRAND_NAME}" <${process.env.EMAIL_USER}>`,
      to,
      subject: `Welcome to ${BRAND_NAME} — Handcrafted Luxury`,
      html: wrapInEmailLayout({
        previewText: `Welcome to ${BRAND_NAME}. Your account has been successfully created.`,
        contentHtml,
      }),
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`[Email Service] ✅ Welcome email sent successfully to ${to} (MessageId: ${info.messageId})`);
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
    const transporter = createTransporter();

    if (!transporter) {
      console.log(`[Email Service Simulation] Password reset requested for ${to}. Reset URL: ${resetUrl}`);
      return true;
    }

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

    const mailOptions = {
      from: `"${BRAND_NAME} Security" <${process.env.EMAIL_USER}>`,
      to,
      subject: `${BRAND_NAME} Account — Password Reset Request`,
      html: wrapInEmailLayout({
        previewText: `Reset your ${BRAND_NAME} account password. Link expires in 1 hour.`,
        contentHtml,
      }),
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`[Email Service] ✅ Password reset email dispatched to ${to} (MessageId: ${info.messageId})`);
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
    const transporter = createTransporter();

    if (!transporter) {
      console.log(`[Email Service Simulation] Order confirmation simulated for ${to}. Order #${orderNumber}`);
      return true;
    }

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

    const mailOptions = {
      from: `"${BRAND_NAME} Orders" <${process.env.EMAIL_USER}>`,
      to,
      subject: `Order Confirmed: #${displayOrderNum} — ${BRAND_NAME}`,
      html: wrapInEmailLayout({
        previewText: `Order #${displayOrderNum} confirmed! We are preparing your Velmora order.`,
        contentHtml,
      }),
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`[Email Service] ✅ Order confirmation email sent to ${to} (MessageId: ${info.messageId})`);
    return true;
  } catch (error) {
    console.error(`[Email Service Error] Order confirmation failed for ${to}:`, error.message);
    return false;
  }
};

export default {
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendOrderConfirmationEmail,
};
