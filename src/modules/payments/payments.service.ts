import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { createHmac, randomInt } from 'node:crypto';

import {
  PaymentIntent,
  PaymentIntentDocument,
  PaymentProvider,
} from './schemas/payment-intent.schema';
import { Product, ProductDocument } from '../products/schemas/product.schema';
import { CouponsService } from '../coupons/coupons.service';
import { ConfirmMockDto, CreateIntentDto, VerifyPaymentDto } from './dto/payment.dto';

const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

const randomAlnum = (length: number): string => {
  let out = '';
  for (let i = 0; i < length; i++) out += ALNUM[randomInt(0, ALNUM.length)];
  return out;
};

/** Payment intent id, e.g. PAY-8F3K2Q9ZL1 (same spirit as generateOrderNumber). */
const generatePaymentId = (): string => `PAY-${randomAlnum(10)}`;

/** Mock transaction id, e.g. TXN-1A2B3C4D5E6F */
const generateTransactionId = (): string => `TXN-${randomAlnum(12)}`;

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface IntentResponse {
  intentId: string;
  amount: number;
  currency: 'INR';
  provider: PaymentProvider;
  providerOrderId: string | null;
  keyId: string | null;
}

export interface PaymentConfirmation {
  intentId: string;
  status: 'paid';
  transactionId: string;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectModel(PaymentIntent.name)
    private readonly paymentIntentModel: Model<PaymentIntentDocument>,
    @InjectModel(Product.name) private readonly productModel: Model<ProductDocument>,
    private readonly couponsService: CouponsService,
    private readonly config: ConfigService,
  ) {}

  // ---------- Provider strategy ----------

  resolveProvider(): PaymentProvider {
    const keyId = this.config.get<string>('payments.razorpayKeyId');
    const keySecret = this.config.get<string>('payments.razorpayKeySecret');
    return keyId && keySecret ? 'razorpay' : 'mock';
  }

  getConfig(): { provider: PaymentProvider; keyId: string | null } {
    const provider = this.resolveProvider();
    return {
      provider,
      keyId: provider === 'razorpay' ? (this.config.get<string>('payments.razorpayKeyId') ?? '') : null,
    };
  }

  // ---------- Create intent ----------

  async createIntent(userId: string, dto: CreateIntentDto): Promise<IntentResponse> {
    const provider = this.resolveProvider();
    const amount = await this.computeAmount(dto);

    // Unique intent id with dup-retry (mirrors the orderNumber pattern)
    let intent: PaymentIntentDocument | null = null;
    for (let attempt = 0; attempt < 5 && !intent; attempt++) {
      try {
        intent = await this.paymentIntentModel.create({
          intentId: generatePaymentId(),
          userId: new Types.ObjectId(userId),
          amount,
          currency: 'INR',
          method: dto.method,
          status: 'created',
          provider,
        });
      } catch (err: unknown) {
        const isDup = typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000;
        if (!isDup || attempt === 4) throw err;
      }
    }

    if (provider === 'razorpay') {
      intent!.providerOrderId = await this.createRazorpayOrder(intent!);
      await intent!.save();
    }

    return {
      intentId: intent!.intentId,
      amount: intent!.amount,
      currency: 'INR',
      provider,
      providerOrderId: intent!.providerOrderId || null,
      keyId: provider === 'razorpay' ? (this.config.get<string>('payments.razorpayKeyId') ?? '') : null,
    };
  }

  /**
   * Recomputes the payable amount EXACTLY like OrdersService.place():
   * product price lookup (active only), coupon revalidation, shipping threshold.
   * Never mutates stock — that happens at order placement.
   */
  private async computeAmount(dto: CreateIntentDto): Promise<number> {
    let subtotal = 0;
    for (const item of dto.items) {
      if (!Types.ObjectId.isValid(item.productId)) {
        throw new BadRequestException(`Invalid product id: ${item.productId}`);
      }
      const product = await this.productModel
        .findOne({ _id: item.productId, isActive: true })
        .select('title price')
        .exec();
      if (!product) {
        throw new BadRequestException('A product in your cart is no longer available');
      }
      subtotal += product.price * item.quantity;
    }
    subtotal = round2(subtotal);

    let discount = 0;
    if (dto.couponCode) {
      const result = await this.couponsService.validate(dto.couponCode, subtotal);
      discount = result.discount;
    }

    const threshold = this.config.get<number>('commerce.freeShippingThreshold') ?? 499;
    const fee = this.config.get<number>('commerce.shippingFee') ?? 40;
    const shipping = subtotal - discount >= threshold ? 0 : fee;
    return round2(subtotal - discount + shipping);
  }

  private async createRazorpayOrder(intent: PaymentIntentDocument): Promise<string> {
    const keyId = this.config.get<string>('payments.razorpayKeyId') ?? '';
    const keySecret = this.config.get<string>('payments.razorpayKeySecret') ?? '';
    const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');

    const res = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${auth}`,
      },
      body: JSON.stringify({
        amount: Math.round(intent.amount * 100), // paise, integer
        currency: 'INR',
        receipt: intent.intentId,
      }),
    }).catch((err: unknown) => {
      this.logger.error(`Razorpay order create request failed: ${String(err)}`);
      throw new BadGatewayException('Could not reach the payment gateway. Please try again.');
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      this.logger.error(`Razorpay order create failed (${res.status}): ${body}`);
      throw new BadGatewayException('The payment gateway rejected the request. Please try again.');
    }

    const data = (await res.json()) as { id?: string };
    if (!data.id) {
      throw new BadGatewayException('Unexpected response from the payment gateway.');
    }
    return data.id;
  }

  // ---------- Mock confirm ----------

  async confirmMock(userId: string, intentId: string, dto: ConfirmMockDto): Promise<PaymentConfirmation> {
    const intent = await this.getOwnIntent(userId, intentId);

    if (intent.provider !== 'mock') {
      throw new BadRequestException('This payment must be completed via the payment gateway');
    }
    if (intent.status !== 'created') {
      throw new BadRequestException(`This payment is already ${intent.status}`);
    }

    intent.meta = {
      ...(dto.vpa !== undefined && { vpa: dto.vpa }),
      ...(dto.bank !== undefined && { bank: dto.bank }),
      ...(dto.card && { cardLast4: dto.card.last4, cardBrand: dto.card.brand }),
    };

    // Simulated gateway decline rules (contract-defined test triggers)
    let failReason = '';
    if (dto.vpa && dto.vpa.toLowerCase().startsWith('fail')) {
      failReason = 'UPI payment declined by your bank';
    } else if (dto.card?.last4 === '0002') {
      failReason = 'Card declined by issuing bank';
    } else if (dto.bank === 'FAIL') {
      failReason = 'Bank payment failed';
    }

    if (failReason) {
      intent.status = 'failed';
      intent.failReason = failReason;
      await intent.save();
      throw new HttpException({ message: failReason }, HttpStatus.PAYMENT_REQUIRED);
    }

    intent.status = 'paid';
    intent.paidAt = new Date();
    intent.transactionId = generateTransactionId();
    await intent.save();

    return { intentId: intent.intentId, status: 'paid', transactionId: intent.transactionId };
  }

  // ---------- Razorpay verify ----------

  async verifyRazorpay(userId: string, dto: VerifyPaymentDto): Promise<PaymentConfirmation> {
    const intent = await this.getOwnIntent(userId, dto.intentId);

    if (intent.provider !== 'razorpay') {
      throw new BadRequestException('This payment was not made via the payment gateway');
    }
    // Idempotent retry: verifying the same successful payment twice is fine
    if (intent.status === 'paid' && intent.transactionId === dto.razorpayPaymentId) {
      return { intentId: intent.intentId, status: 'paid', transactionId: intent.transactionId };
    }
    if (intent.status !== 'created') {
      throw new BadRequestException(`This payment is already ${intent.status}`);
    }
    if (intent.providerOrderId && dto.razorpayOrderId !== intent.providerOrderId) {
      throw new BadRequestException('Payment does not belong to this intent');
    }

    const keySecret = this.config.get<string>('payments.razorpayKeySecret') ?? '';
    const expected = createHmac('sha256', keySecret)
      .update(`${dto.razorpayOrderId}|${dto.razorpayPaymentId}`)
      .digest('hex');

    if (expected !== dto.razorpaySignature) {
      intent.status = 'failed';
      intent.failReason = 'Payment signature verification failed';
      await intent.save();
      throw new BadRequestException('Payment signature verification failed');
    }

    intent.status = 'paid';
    intent.paidAt = new Date();
    intent.transactionId = dto.razorpayPaymentId;
    await intent.save();

    return { intentId: intent.intentId, status: 'paid', transactionId: intent.transactionId };
  }

  // ---------- Order integration ----------

  /**
   * Called by OrdersService.place() after the total is computed.
   * Verifies the intent is the caller's, paid, amount-matched and unconsumed.
   */
  async assertPaidAndConsume(
    userId: string,
    intentId: string,
    expectedTotal: number,
  ): Promise<{ transactionId: string }> {
    const intent = await this.paymentIntentModel.findOne({ intentId }).exec();
    if (!intent) {
      throw new BadRequestException('Payment not found — please complete the payment again');
    }
    if (intent.userId.toHexString() !== userId) {
      throw new BadRequestException('This payment belongs to a different account');
    }
    if (intent.status !== 'paid') {
      throw new BadRequestException('This payment has not been completed');
    }
    if (Math.abs(intent.amount - expectedTotal) >= 0.01) {
      throw new BadRequestException('Payment amount does not match the order total');
    }
    if (intent.orderNumber) {
      throw new BadRequestException('This payment has already been used for another order');
    }
    return { transactionId: intent.transactionId };
  }

  /** Marks the intent as consumed by the given order. */
  async attachOrder(intentId: string, orderNumber: string): Promise<void> {
    await this.paymentIntentModel.updateOne({ intentId }, { $set: { orderNumber } }).exec();
  }

  // ---------- Helpers ----------

  private async getOwnIntent(userId: string, intentId: string): Promise<PaymentIntentDocument> {
    const intent = await this.paymentIntentModel.findOne({ intentId }).exec();
    if (!intent) throw new NotFoundException('Payment intent not found');
    if (intent.userId.toHexString() !== userId) throw new ForbiddenException('Not your payment');
    return intent;
  }
}
