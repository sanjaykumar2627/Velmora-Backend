import nodemailer from 'nodemailer';

/**
 * Configure Nodemailer transport
 */
const createTransporter = () => {
  const host = process.env.EMAIL_HOST;
  const port = parseInt(process.env.EMAIL_PORT, 10) || 587;
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASSWORD;

  if (!host || !user || !pass) {
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

/**
 * Send welcome email to newly registered customer
 */
export const sendWelcomeEmail = async ({ to, fullName }) => {
  try {
    const transporter = createTransporter();

    if (!transporter) {
      console.log(`[Email Service Simulation] Welcome email simulated for ${to} (${fullName}). Configure EMAIL_USER/EMAIL_PASSWORD to send real emails.`);
      return true;
    }

    const mailOptions = {
      from: `"Velmora Atelier" <${process.env.EMAIL_USER}>`,
      to,
      subject: 'Welcome to Velmora — Pure Handcrafted Luxury',
      html: `
        <div style="font-family: 'Playfair Display', serif, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #2B0F3A; background: #FFFDF9; border: 1px solid #E8DFD8;">
          <h1 style="color: #6B1D4F; font-size: 26px; border-bottom: 2px solid #C8A45D; padding-bottom: 12px; margin-bottom: 20px;">Welcome to Velmora, ${fullName}</h1>
          <p style="font-size: 15px; line-height: 1.6; color: #3A2B20;">
            Thank you for registering your patron account with Velmora. We are delighted to welcome you to our sanctuary of exquisite Indian heritage textiles, bespoke weaves, and festive couture.
          </p>
          <div style="background: #F8F4EE; padding: 18px; border-radius: 6px; margin: 20px 0;">
            <p style="margin: 0; font-size: 14px; color: #6B1D4F; font-weight: bold;">Patron Privileges Unlocked:</p>
            <ul style="margin: 10px 0 0 18px; font-size: 13px; color: #4A3B32;">
              <li>Curate bespoke wishlists for special occasions</li>
              <li>Save multiple delivery atelier addresses</li>
              <li>Express access to seasonal limited drops</li>
              <li>Free express insured shipping across India</li>
            </ul>
          </div>
          <p style="font-size: 14px; line-height: 1.5; color: #665243;">
            Should you require assistance with sizing or bespoke customizations, our styling atelier is at your service.
          </p>
          <p style="font-size: 13px; color: #8A7568; margin-top: 30px; border-top: 1px solid #E8DFD8; padding-top: 15px;">
            Warm regards,<br />
            <strong>The Velmora Curatorial Team</strong><br />
            <a href="https://velmoraindia.store" style="color: #6B1D4F; text-decoration: none;">velmoraindia.store</a>
          </p>
        </div>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`[Email Service] Welcome email sent to ${to}: ${info.messageId}`);
    return true;
  } catch (error) {
    console.error(`[Email Service Error] Failed to send welcome email to ${to}:`, error.message);
    // Don't fail the user registration if email sending encounters an error
    return false;
  }
};

/**
 * Send password reset email
 */
export const sendPasswordResetEmail = async ({ to, resetUrl }) => {
  try {
    const transporter = createTransporter();

    if (!transporter) {
      console.log(`[Email Service Simulation] Password reset requested for ${to}. Reset URL: ${resetUrl}`);
      return true;
    }

    const mailOptions = {
      from: `"Velmora Security" <${process.env.EMAIL_USER}>`,
      to,
      subject: 'Velmora Account — Password Reset Instructions',
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #2B0F3A; background: #FFFDF9; border: 1px solid #E8DFD8;">
          <h2 style="color: #6B1D4F;">Password Reset Request</h2>
          <p>We received a request to reset the password for your Velmora patron account.</p>
          <div style="margin: 25px 0;">
            <a href="${resetUrl}" style="background: #6B1D4F; color: #FFFDF9; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold; display: inline-block;">
              Reset Password
            </a>
          </div>
          <p style="font-size: 13px; color: #7A695C;">
            If you did not request this, you can safely ignore this email.
          </p>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error(`[Email Service Error] Reset email failed for ${to}:`, error.message);
    return false;
  }
};

export default {
  sendWelcomeEmail,
  sendPasswordResetEmail,
};
