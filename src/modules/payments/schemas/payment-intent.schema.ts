import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

/** Online-only methods — COD never creates a payment intent. */
export const PAYMENT_INTENT_METHODS = ['card', 'upi', 'netbanking'] as const;
export type PaymentIntentMethod = (typeof PAYMENT_INTENT_METHODS)[number];

export const PAYMENT_INTENT_STATUSES = ['created', 'paid', 'failed'] as const;
export type PaymentIntentStatus = (typeof PAYMENT_INTENT_STATUSES)[number];

export const PAYMENT_PROVIDERS = ['mock', 'razorpay'] as const;
export type PaymentProvider = (typeof PAYMENT_PROVIDERS)[number];

export type PaymentIntentDocument = HydratedDocument<PaymentIntent>;

/** Sanitized instrument details only — never a full PAN/CVV (PCI hygiene). */
@Schema({ _id: false })
export class PaymentMeta {
  @Prop() vpa?: string;
  @Prop() bank?: string;
  @Prop() cardLast4?: string;
  @Prop() cardBrand?: string;
}

@Schema({ timestamps: true })
export class PaymentIntent {
  /** Human-readable id, e.g. PAY-8F3K2Q9ZL1 */
  @Prop({ required: true, unique: true })
  intentId: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  /** Server-computed total — client amounts are never trusted. */
  @Prop({ required: true })
  amount: number;

  @Prop({ default: 'INR' })
  currency: string;

  @Prop({ type: String, enum: PAYMENT_INTENT_METHODS, required: true })
  method: PaymentIntentMethod;

  @Prop({ type: String, enum: PAYMENT_INTENT_STATUSES, default: 'created' })
  status: PaymentIntentStatus;

  @Prop({ type: String, enum: PAYMENT_PROVIDERS, required: true })
  provider: PaymentProvider;

  /** Razorpay order id (order_xxx) when provider is razorpay. */
  @Prop({ default: '' })
  providerOrderId: string;

  @Prop({ default: '' })
  transactionId: string;

  @Prop({ type: PaymentMeta, default: {} })
  meta: PaymentMeta;

  /** Set when an order consumes this intent — an intent pays for exactly one order. */
  @Prop({ default: '' })
  orderNumber: string;

  @Prop()
  paidAt?: Date;

  @Prop({ default: '' })
  failReason: string;
}

export const PaymentIntentSchema = SchemaFactory.createForClass(PaymentIntent);

PaymentIntentSchema.index({ userId: 1, createdAt: -1 });
