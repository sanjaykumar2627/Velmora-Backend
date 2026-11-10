import 'dotenv/config';
import nodemailer from 'nodemailer';

async function testSMTP() {
  const host = process.env.EMAIL_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.EMAIL_PORT, 10) || 587;
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASSWORD;

  console.log('--- Testing SMTP Configuration ---');
  console.log(`Host: ${host}`);
  console.log(`Port: ${port}`);
  console.log(`User: ${user ? user : '[MISSING]'}`);
  console.log(`Pass: ${pass ? '********' : '[MISSING]'}`);

  if (!user || !pass) {
    console.error('\n❌ ERROR: EMAIL_USER ya EMAIL_PASSWORD .env me set nahi hai!');
    console.log('Kripya .env me EMAIL_USER aur EMAIL_PASSWORD daalein aur dobara run karein.');
    process.exit(1);
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: {
      user,
      pass,
    },
  });

  try {
    console.log('\nVerifying SMTP connection...');
    await transporter.verify();
    console.log('✅ SMTP connection successful!');

    console.log(`\nSending test email to ${user}...`);
    const info = await transporter.sendMail({
      from: `"Velmora Test" <${user}>`,
      to: user,
      subject: 'Velmora SMTP Test Email',
      text: 'Badhai ho! Aapka SMTP email setup bilkul sahi kaam kar raha hai.',
      html: '<h3>Badhai ho! 🎉</h3><p>Aapka Velmora SMTP email setup bilkul sahi tareeqe se configure ho gaya hai.</p>',
    });

    console.log(`✅ Test email sent successfully! MessageId: ${info.messageId}`);
  } catch (error) {
    console.error('\n❌ SMTP Error:', error.message);
  }
}

testSMTP();
