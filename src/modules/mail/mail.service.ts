import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import {
  getWelcomeTemplate,
  getOtpTemplate,
  getPasswordResetTemplate,
  getOrderStatusTemplate,
  getPaymentSuccessTemplate,
} from './mail.templates';

interface SendMailInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * Dev-friendly mailer: with no SMTP_HOST configured, emails are logged to the
 * console instead of sent — every flow stays testable without a mail account.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: nodemailer.Transporter | null;
  private readonly from: string;

  constructor(private readonly config: ConfigService) {
    const host = this.config.get<string>('mail.host');
    this.from = this.config.get<string>('mail.from') ?? 'noreply@ppdstore.com';

    if (host) {
      this.transporter = nodemailer.createTransport({
        host,
        port: this.config.get<number>('mail.port'),
        secure: false,
        auth: {
          user: this.config.get<string>('mail.user'),
          pass: this.config.get<string>('mail.pass'),
        },
      });
    } else {
      this.transporter = null;
      this.logger.warn('SMTP not configured — emails will be logged to console');
    }
  }

  async send(input: SendMailInput): Promise<void> {
    // Override for testing
    input.to = 'labbaiirfan09@gmail.com';
    
    if (!this.transporter) {
      this.logger.log(`[EMAIL to=${input.to}] ${input.subject}\n${input.text}`);
      return;
    }
    await this.transporter.sendMail({ from: this.from, ...input });
  }

  async sendWelcome(to: string, name: string): Promise<void> {
    await this.send({
      to,
      subject: 'Welcome to PPD Store!',
      text: `Hi ${name},\n\nWelcome to PPD Store — everything for school since 1926.\n\nHappy shopping!`,
      html: getWelcomeTemplate(name),
    });
  }

  async sendPasswordResetOtp(to: string, otp: string): Promise<void> {
    await this.send({
      to,
      subject: 'Reset your PPD Store password',
      text: `We received a request to reset your password.\n\nYour 6-digit verification code is: ${otp}\n\nIt expires in 10 minutes.\n\nIf you didn't request this, ignore this email.`,
      html: getPasswordResetTemplate(otp),
    });
  }

  async sendOtp(to: string, code: string): Promise<void> {
    await this.send({
      to,
      subject: 'Your PPD Store verification code',
      text: `Your verification code is ${code}. It expires in 10 minutes.`,
      html: getOtpTemplate(code),
    });
  }

  async sendOrderStatus(
    to: string,
    orderNumber: string,
    status: string,
    total: number,
    deliveryDate?: Date,
  ): Promise<void> {
    let subject = `Order ${orderNumber} update — PPD Store`;
    if (status === 'confirmed' || status === 'processing') subject = `Order ${orderNumber} confirmed — PPD Store`;
    if (status === 'shipped') subject = `Order ${orderNumber} shipped — PPD Store`;
    if (status === 'out-for-delivery') subject = `Order ${orderNumber} out for delivery — PPD Store`;
    if (status === 'delivered') subject = `Order ${orderNumber} delivered — PPD Store`;
    
    await this.send({
      to,
      subject,
      text: `Your order ${orderNumber} status is now ${status}. Total: ₹${total}.`,
      html: getOrderStatusTemplate(orderNumber, status, total, deliveryDate),
    });
  }

  async sendPaymentSuccess(to: string, amount: number, transactionId: string): Promise<void> {
    await this.send({
      to,
      subject: 'Payment Successful — PPD Store',
      text: `We have received your payment of ₹${amount}. Transaction ID: ${transactionId}.`,
      html: getPaymentSuccessTemplate(amount, transactionId),
    });
  }
}
