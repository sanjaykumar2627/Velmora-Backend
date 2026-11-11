import 'dotenv/config';
import { sendTestEmailDiagnostic } from './src/services/emailService.js';

async function main() {
  const targetEmail = process.argv[2] || process.env.EMAIL_USER;

  console.log('==============================================');
  console.log('       VELMORA EMAIL CONFIGURATION TEST       ');
  console.log('==============================================');
  console.log(`Target Recipient : ${targetEmail || '[NOT SET]'}`);
  console.log(`BREVO_API_KEY    : ${process.env.BREVO_API_KEY ? 'CONFIGURED ✅ (HTTPS Port 443)' : '[NOT SET] (Using SMTP)'}`);
  console.log(`EMAIL_HOST       : ${process.env.EMAIL_HOST || 'smtp.gmail.com'}`);
  console.log(`EMAIL_PORT       : ${process.env.EMAIL_PORT || '587'}`);
  console.log(`EMAIL_USER       : ${process.env.EMAIL_USER || '[NOT SET]'}`);
  console.log('----------------------------------------------\n');

  if (!targetEmail) {
    console.error('❌ Please specify a recipient email or set EMAIL_USER in .env.');
    console.error('Usage: node test-email.js user@example.com\n');
    process.exit(1);
  }

  console.log(`Sending test email to ${targetEmail}...`);
  const result = await sendTestEmailDiagnostic(targetEmail);

  console.log('\n--- Test Result ---');
  console.log(JSON.stringify(result, null, 2));

  if (result.success) {
    console.log('\n✅ TEST PASSED: Email dispatched successfully!');
  } else {
    console.log('\n❌ TEST FAILED: Email could not be sent.');
    if (result.hint) {
      console.log(`💡 Hint: ${result.hint}`);
    }
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
});
