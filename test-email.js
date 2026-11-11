import 'dotenv/config';
import { sendTestEmailDiagnostic } from './src/services/emailService.js';

async function main() {
  const targetEmail = process.argv[2] || process.env.EMAIL_USER;

  console.log('==============================================');
  console.log('       VELMORA SMTP CONFIGURATION TEST        ');
  console.log('==============================================');
  console.log(`Target Recipient : ${targetEmail || '[NOT SET]'}`);
  console.log(`EMAIL_HOST       : ${process.env.EMAIL_HOST || 'smtp.gmail.com'}`);
  console.log(`EMAIL_PORT       : ${process.env.EMAIL_PORT || '587'}`);
  console.log(`EMAIL_USER       : ${process.env.EMAIL_USER || '[NOT SET]'}`);
  console.log(`EMAIL_PASSWORD   : ${process.env.EMAIL_PASSWORD ? '********' : '[NOT SET]'}`);
  console.log('----------------------------------------------\n');

  if (!targetEmail) {
    console.error('❌ Please specify a recipient email or set EMAIL_USER in .env.');
    console.error('Usage: node test-email.js user@example.com\n');
    process.exit(1);
  }

  console.log(`Sending SMTP test email to ${targetEmail}...`);
  const result = await sendTestEmailDiagnostic(targetEmail);

  console.log('\n--- SMTP Result ---');
  console.log(JSON.stringify(result, null, 2));

  if (result.success) {
    console.log('\n✅ TEST PASSED: SMTP email dispatched successfully!');
  } else {
    console.log('\n❌ TEST FAILED: SMTP could not dispatch email.');
    if (result.hint) {
      console.log(`💡 Hint: ${result.hint}`);
    }
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
});
