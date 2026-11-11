import express from 'express';
import { dispatchEmail } from '../services/emailService.js';

const router = express.Router();

/**
 * POST /api/contact
 * Handles contact form submissions and dispatches email alert to store admin
 */
router.post('/', async (req, res) => {
  try {
    const { fullName, email, phone, orderNumber, inquiryType, message } = req.body;

    if (!fullName || !email || !message) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and message are required fields.',
      });
    }

    const adminEmail = process.env.ADMIN_EMAIL || process.env.EMAIL_USER || 'velmora.shop.india.2026@gmail.com';
    const inquiryLabelMap = {
      order: 'Order Status & Tracking',
      sizing: 'Size & Fitting Help',
      exchange: 'Return & Exchange Request',
      feedback: 'Feedback & Question',
      other: 'General Inquiry',
    };
    const subjectTitle = inquiryLabelMap[inquiryType] || inquiryType || 'Customer Inquiry';

    // 1. Dispatch Email to Store Admin (velmora.shop.india.2026@gmail.com)
    const adminEmailHtml = `
      <div style="font-family: sans-serif; color: #2B1829; max-width: 600px; padding: 20px; border: 1px solid #E5DCD3; border-radius: 8px;">
        <h2 style="color: #6B2D5C; margin-top: 0;">New Customer Inquiry - Velmora Store</h2>
        <p>A customer has submitted a message via the website contact form:</p>
        <table style="width: 100%; border-collapse: collapse; margin: 15px 0;">
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold; width: 140px;">Customer Name:</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${fullName}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Email:</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;"><a href="mailto:${email}">${email}</a></td>
          </tr>
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Phone:</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${phone || 'Not provided'}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Order Number:</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${orderNumber || 'N/A'}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Subject:</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${subjectTitle}</td>
          </tr>
        </table>
        <div style="background-color: #FAF6F0; padding: 15px; border-radius: 6px; border-left: 4px solid #6B2D5C; margin: 15px 0;">
          <h4 style="margin: 0 0 8px; color: #6B2D5C;">Customer's Message:</h4>
          <p style="margin: 0; white-space: pre-wrap; font-size: 14px; line-height: 1.6;">${message}</p>
        </div>
        <p style="font-size: 13px; color: #777;">
          You can reply directly to the customer by clicking their email: <a href="mailto:${email}">${email}</a>
        </p>
      </div>
    `;

    await dispatchEmail({
      fromName: 'Velmora Contact Bot',
      to: adminEmail,
      subject: `[New Inquiry] ${fullName} - ${subjectTitle}`,
      html: adminEmailHtml,
      text: `New inquiry from ${fullName} (${email}, Phone: ${phone || 'N/A'}, Order: ${orderNumber || 'N/A'}):\n\nSubject: ${subjectTitle}\n\nMessage:\n${message}`,
    });

    // 2. Also send an automated confirmation acknowledgement to the customer
    const customerAckHtml = `
      <div style="font-family: sans-serif; color: #2B1829; max-width: 600px; padding: 20px; border: 1px solid #E5DCD3; border-radius: 8px;">
        <h2 style="color: #6B2D5C; margin-top: 0;">We have received your message!</h2>
        <p>Dear ${fullName},</p>
        <p>Thank you for reaching out to <strong>Velmora Shop India</strong>. We have received your query regarding <strong>${subjectTitle}</strong>.</p>
        <p>Our concierge support team is reviewing your message and will reply to this email address within <strong>12 to 24 business hours</strong>.</p>
        <div style="background-color: #FAF6F0; padding: 12px 15px; border-radius: 6px; margin: 15px 0; font-size: 13px; color: #555;">
          <strong>Your submitted message:</strong><br />
          <em>"${message}"</em>
        </div>
        <p style="margin-top: 20px; font-size: 13px; color: #666;">
          Warm regards,<br />
          <strong>Velmora Care Team</strong><br />
          Email: <a href="mailto:${adminEmail}">${adminEmail}</a>
        </p>
      </div>
    `;

    try {
      await dispatchEmail({
        fromName: 'Velmora Care',
        to: email,
        subject: `We have received your message - Velmora Support`,
        html: customerAckHtml,
        text: `Dear ${fullName},\n\nThank you for reaching out to Velmora Shop India. We have received your query and will reply within 12-24 business hours.\n\nWarm regards,\nVelmora Care Team`,
      });
    } catch (ackError) {
      console.warn('[Contact Route] Customer ack email failed, but admin email was sent:', ackError.message);
    }

    return res.status(200).json({
      success: true,
      message: 'Your inquiry has been successfully sent. We will get back to you shortly!',
    });
  } catch (error) {
    console.error('[Contact Route Error]:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to send your message. Please reach out to velmora.shop.india.2026@gmail.com directly.',
    });
  }
});

export default router;
