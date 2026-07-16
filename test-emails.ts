import { NestFactory } from '@nestjs/core';
import { AppModule } from './src/app.module';
import { MailService } from './src/modules/mail/mail.service';

async function bootstrap() {
  console.log('Bootstrapping app context to test emails...');
  const app = await NestFactory.createApplicationContext(AppModule);
  
  const mailService = app.get(MailService);
  const testEmail = 'labbaiirfan09@gmail.com';

  console.log(`Sending Welcome email...`);
  await mailService.sendWelcome(testEmail, 'Irfan');

  console.log(`Sending generic OTP email...`);
  await mailService.sendOtp(testEmail, '123456');

  console.log(`Sending Password Reset OTP email...`);
  await mailService.sendPasswordResetOtp(testEmail, '987654');

  console.log(`Sending Order Status email...`);
  await mailService.sendOrderStatus(testEmail, 'ORD-TEST123', 'shipped', 1250, new Date());

  console.log(`Sending Payment Success email...`);
  await mailService.sendPaymentSuccess(testEmail, 1250, 'pay_TEST987654321');

  console.log('All test emails have been dispatched!');
  await app.close();
  process.exit(0);
}

bootstrap().catch(err => {
  console.error(err);
  process.exit(1);
});
