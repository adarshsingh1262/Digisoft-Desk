import { Global, Module } from '@nestjs/common';
import { AppConfig } from '../config/config.module';
import { EMAIL_PROVIDER, type EmailProvider } from './email.types';
import { ConsoleEmailProvider } from './providers/console.provider';
import { SmtpEmailProvider } from './providers/smtp.provider';
import { SesEmailProvider } from './providers/ses.provider';
import { MailerService } from './mailer.service';

function createProvider(config: AppConfig): EmailProvider {
  const from = config.get('EMAIL_FROM');
  switch (config.get('EMAIL_PROVIDER')) {
    case 'smtp': {
      const host = config.get('SMTP_HOST');
      const port = config.get('SMTP_PORT');
      if (!host || !port) {
        throw new Error('EMAIL_PROVIDER=smtp requires SMTP_HOST and SMTP_PORT');
      }
      return new SmtpEmailProvider({
        host,
        port,
        secure: config.get('SMTP_SECURE'),
        user: config.get('SMTP_USER'),
        password: config.get('SMTP_PASSWORD'),
        from,
      });
    }
    case 'ses': {
      const region = config.get('AWS_REGION');
      if (!region) {
        throw new Error('EMAIL_PROVIDER=ses requires AWS_REGION');
      }
      return new SesEmailProvider(region, from);
    }
    default:
      return new ConsoleEmailProvider();
  }
}

@Global()
@Module({
  providers: [
    { provide: EMAIL_PROVIDER, inject: [AppConfig], useFactory: createProvider },
    MailerService,
  ],
  exports: [EMAIL_PROVIDER, MailerService],
})
export class EmailModule {}
