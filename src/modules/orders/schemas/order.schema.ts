import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

/** Hyphenated to match the frontend's OrderStatus union exactly. */
export const ORDER_STATUSES = [
  'placed',
  'confirmed',
  'processing',
  'shipped',
  'out-for-delivery',
  'delivered',
  'cancelled',
  'returned',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Allowed forward transitions (admin PATCH validates against this). */
export const STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  placed: ['confirmed', 'cancelled'],
  confirmed: ['processing', 'shipped', 'cancelled'],
  processing: ['shipped', 'cancelled'],
  shipped: ['out-for-delivery', 'delivered'],
  'out-for-delivery': ['delivered'],
  delivered: ['returned'],
  cancelled: [],
  returned: [],
};

export const PAYMENT_METHODS = ['card', 'upi', 'netbanking', 'wallet', 'cod'] as const;
export type PaymentMethodKind = (typeof PAYMENT_METHODS)[number];

/** Matches the frontend's PaymentStatus union exactly. */
export const PAYMENT_STATUSES = ['pending', 'paid', 'failed', 'refunded'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export type OrderDocument = HydratedDocument<Order>;

@Schema({ _id: false })
export class OrderItem {
  @Prop({ type: Types.ObjectId, ref: 'Product', required: true })
  productId: Types.ObjectId;

  /** Cart line key used by the frontend (productId or productId:variant). */
  @Prop({ required: true })
  key: string;

  @Prop({ required: true })
  title: string;

  @Prop({ default: '' })
  brand: string;

  @Prop({ default: '' })
  image: string;

  /** Snapshot prices at order time (server-verified). */
  @Prop({ required: true })
  price: number;

  @Prop({ required: true })
  mrp: number;

  @Prop({ required: true, min: 1 })
  quantity: number;

  @Prop({ default: 0 })
  stock: number;

  @Prop({ type: Map, of: String, default: {} })
  selections: Map<string, string>;

  @Prop()
  batchId?: string;

  @Prop()
  batchSku?: string;

  @Prop()
  batchName?: string;

  @Prop()
  unitPrice?: number;

  @Prop()
  batchQuantity?: number;

  @Prop()
  batchPrice?: number;

  @Prop()
  batchCount?: number;

  @Prop()
  totalUnits?: number;

  @Prop()
  totalAmount?: number;

  @Prop()
  pricingMode?: string;
}

@Schema({ _id: false })
export class OrderAddress {
  @Prop({ default: '' }) id: string;
  @Prop({ required: true }) name: string;
  @Prop({ required: true }) phone: string;
  @Prop({ required: true, default: 'India' }) country: string;
  @Prop({ required: true }) line1: string;
  @Prop({ default: '' }) line2: string;
  @Prop({ required: true }) city: string;
  @Prop({ required: true }) state: string;
  @Prop({ required: true }) pincode: string;
  @Prop({ default: 'home' }) type: string;
}

@Schema({ _id: false })
export class StatusEvent {
  @Prop({ type: String, enum: ORDER_STATUSES, required: true })
  status: OrderStatus;

  @Prop({ default: () => new Date() })
  at: Date;

  @Prop({ default: '' })
  location: string;

  @Prop({ default: '' })
  note: string;
}

@Schema({ timestamps: true })
export class Order {
  @Prop({ required: true, unique: true })
  orderNumber: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ default: '' })
  customerName: string;

  @Prop({ type: [OrderItem], required: true })
  items: OrderItem[];

  @Prop({ type: String, enum: ORDER_STATUSES, default: 'placed' })
  status: OrderStatus;

  @Prop({ type: [StatusEvent], default: [] })
  statusHistory: StatusEvent[];

  @Prop({ type: OrderAddress, required: true })
  address: OrderAddress;

  @Prop({
    type: {
      method: { type: String, enum: PAYMENT_METHODS },
      label: String,
      status: { type: String, enum: PAYMENT_STATUSES, default: 'pending' },
      transactionId: { type: String, default: '' },
      intentId: { type: String, default: '' },
      paidAt: Date,
    },
    required: true,
  })
  payment: {
    method: PaymentMethodKind;
    label: string;
    status: PaymentStatus;
    transactionId: string;
    intentId: string;
    paidAt?: Date;
  };

  @Prop({
    type: {
      subtotal: Number,
      discount: Number,
      couponCode: String,
      shipping: Number,
      total: Number,
    },
    required: true,
  })
  pricing: {
    subtotal: number;
    discount: number;
    couponCode?: string;
    shipping: number;
    total: number;
  };

  @Prop()
  expectedDelivery?: Date;

  @Prop({ default: '' })
  cancelReason: string;
}

export const OrderSchema = SchemaFactory.createForClass(Order);

OrderSchema.index({ userId: 1, createdAt: -1 });
OrderSchema.index({ status: 1, createdAt: -1 });
