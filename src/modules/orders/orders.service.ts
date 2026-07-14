import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import {
  Order,
  OrderDocument,
  OrderStatus,
  STATUS_TRANSITIONS,
} from './schemas/order.schema';
import { Product, ProductDocument } from '../products/schemas/product.schema';
import { Notification, NotificationDocument } from '../notifications/notifications.module';
import { CouponsService } from '../coupons/coupons.service';
import { PaymentsService } from '../payments/payments.service';
import { MailService } from '../mail/mail.service';
import { UsersService } from '../users/users.service';
import { generateOrderNumber } from '../../common/utils';
import { Paginated, paginate } from '../../common/dto/pagination-query.dto';
import { AdminOrderQueryDto, PlaceOrderDto } from './dto/order.dto';

const TRACK_STEPS: { status: OrderStatus; label: string }[] = [
  { status: 'placed', label: 'Order Placed' },
  { status: 'confirmed', label: 'Order Confirmed' },
  { status: 'shipped', label: 'Shipped' },
  { status: 'out-for-delivery', label: 'Out for Delivery' },
  { status: 'delivered', label: 'Delivered' },
];

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectModel(Order.name) private readonly orderModel: Model<OrderDocument>,
    @InjectModel(Product.name) private readonly productModel: Model<ProductDocument>,
    @InjectModel(Notification.name) private readonly notificationModel: Model<NotificationDocument>,
    private readonly couponsService: CouponsService,
    private readonly paymentsService: PaymentsService,
    private readonly usersService: UsersService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
  ) {}

  // ---------- Place ----------

  async place(userId: string, dto: PlaceOrderDto): Promise<OrderDocument> {
    // Merge duplicate lines for the same product+selections
    const decremented: { productId: Types.ObjectId; quantity: number }[] = [];

    try {
      const snapshots: {
        product: ProductDocument;
        quantity: number;
        selections: Record<string, string>;
      }[] = [];

      // Guarded decrement: only succeeds when enough stock remains
      for (const item of dto.items) {
        if (!Types.ObjectId.isValid(item.productId)) {
          throw new BadRequestException(`Invalid product id: ${item.productId}`);
        }
        const product = await this.productModel
          .findOneAndUpdate(
            { _id: item.productId, isActive: true, stock: { $gte: item.quantity } },
            { $inc: { stock: -item.quantity, salesCount: item.quantity } },
            { new: true },
          )
          .exec();

        if (!product) {
          const exists = await this.productModel.findById(item.productId).select('title stock isActive').exec();
          const reason = !exists || !exists.isActive
            ? 'is no longer available'
            : `has only ${exists.stock} left`;
          throw new ConflictException(`"${exists?.title ?? 'A product'}" ${reason}`);
        }

        decremented.push({ productId: product._id, quantity: item.quantity });
        snapshots.push({ product, quantity: item.quantity, selections: item.selections ?? {} });
      }

      // Server-side pricing — client prices are never trusted
      const subtotal = round2(
        snapshots.reduce((sum, s) => sum + s.product.price * s.quantity, 0),
      );

      let discount = 0;
      let couponCode: string | undefined;
      if (dto.couponCode) {
        const result = await this.couponsService.validate(dto.couponCode, subtotal);
        discount = result.discount;
        couponCode = result.coupon.code;
      }

      const threshold = this.config.get<number>('commerce.freeShippingThreshold') ?? 499;
      const fee = this.config.get<number>('commerce.shippingFee') ?? 40;
      const shipping = subtotal - discount >= threshold ? 0 : fee;
      const total = round2(subtotal - discount + shipping);

      // Payment: COD stays pending; every online method needs a consumed paid intent
      let payment: Order['payment'];
      if (dto.payment.method === 'cod') {
        payment = {
          method: dto.payment.method,
          label: dto.payment.label,
          status: 'pending',
          transactionId: '',
          intentId: '',
        };
      } else {
        if (!dto.payment.intentId) {
          throw new BadRequestException('This payment method requires a completed payment');
        }
        const { transactionId } = await this.paymentsService.assertPaidAndConsume(
          userId,
          dto.payment.intentId,
          total,
        );
        payment = {
          method: dto.payment.method,
          label: dto.payment.label,
          status: 'paid',
          transactionId,
          intentId: dto.payment.intentId,
          paidAt: new Date(),
        };
      }

      const maxDeliveryDays = Math.max(...snapshots.map((s) => s.product.deliveryDays ?? 2), 1);
      const user = await this.usersService.findByIdOrFail(userId);

      // Unique order number with dup-retry
      let order: OrderDocument | null = null;
      for (let attempt = 0; attempt < 5 && !order; attempt++) {
        try {
          order = await this.orderModel.create({
            orderNumber: generateOrderNumber(),
            userId: new Types.ObjectId(userId),
            customerName: user.name,
            items: snapshots.map((s) => ({
              productId: s.product._id,
              key: buildKey(s.product._id.toHexString(), s.selections),
              title: s.product.title,
              brand: s.product.brand,
              image: s.product.images[0] ?? '',
              price: s.product.price,
              mrp: s.product.mrp,
              quantity: s.quantity,
              stock: s.product.stock,
              selections: s.selections,
            })),
            status: 'placed',
            statusHistory: [{ status: 'placed', at: new Date(), location: '', note: 'Order received' }],
            address: { ...dto.address, id: dto.address.id ?? '' },
            payment,
            pricing: { subtotal, discount, couponCode, shipping, total },
            expectedDelivery: new Date(Date.now() + maxDeliveryDays * 86_400_000),
          });
        } catch (err: unknown) {
          const isDup = typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000;
          if (!isDup || attempt === 4) throw err;
        }
      }

      if (payment.intentId) {
        await this.paymentsService.attachOrder(payment.intentId, order!.orderNumber);
      }

      if (couponCode) await this.couponsService.incrementUsage(couponCode, 1);

      void this.notificationModel.create({
        userId: new Types.ObjectId(userId),
        title: `Order ${order!.orderNumber} placed`,
        message: `Your order for ₹${total} has been received. Expected delivery ${order!.expectedDelivery?.toDateString()}.`,
        kind: 'order',
        href: `/orders/${order!.orderNumber}`,
      });

      void this.mail.send({
        to: user.email,
        subject: `Order ${order!.orderNumber} confirmed — PPD Store`,
        text: `Hi ${user.name},\n\nYour order ${order!.orderNumber} for ₹${total} has been placed.\nExpected delivery: ${order!.expectedDelivery?.toDateString()}.\n\nThank you for shopping with PPD!`,
      });

      return order!;
    } catch (err) {
      // Compensate: restore any stock we already took
      for (const d of decremented) {
        await this.productModel
          .updateOne({ _id: d.productId }, { $inc: { stock: d.quantity, salesCount: -d.quantity } })
          .exec()
          .catch(() => this.logger.error(`Rollback failed for product ${d.productId.toHexString()}`));
      }
      throw err;
    }
  }

  // ---------- Read ----------

  async listMine(
    userId: string,
    query: { status?: OrderStatus; page: number; pageSize: number },
  ): Promise<Paginated<OrderDocument>> {
    const filter: Record<string, unknown> = { userId: new Types.ObjectId(userId) };
    if (query.status) filter.status = query.status;

    const [items, total] = await Promise.all([
      this.orderModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((query.page - 1) * query.pageSize)
        .limit(query.pageSize)
        .exec(),
      this.orderModel.countDocuments(filter),
    ]);
    return paginate(items, total, query.page, query.pageSize);
  }

  /** idOrNumber accepts a Mongo id or a human order number (ORD-XXXXX). */
  async getOwn(userId: string, idOrNumber: string): Promise<OrderDocument> {
    const order = await this.findByIdOrNumber(idOrNumber);
    if (!order) throw new NotFoundException('Order not found');
    if (order.userId.toHexString() !== userId) throw new ForbiddenException('Not your order');
    return order;
  }

  async track(userId: string, idOrNumber: string) {
    const order = await this.getOwn(userId, idOrNumber);
    const historyByStatus = new Map(order.statusHistory.map((h) => [h.status, h]));

    if (order.status === 'cancelled') {
      return {
        orderNumber: order.orderNumber,
        status: order.status,
        expectedDelivery: order.expectedDelivery,
        timeline: order.statusHistory.map((h) => ({
          status: h.status,
          label: h.status === 'cancelled' ? 'Cancelled' : (TRACK_STEPS.find((s) => s.status === h.status)?.label ?? h.status),
          at: h.at,
          location: h.location,
          completed: true,
        })),
      };
    }

    const reachedIdx = TRACK_STEPS.findIndex((s) => s.status === order.status);
    const effectiveIdx = reachedIdx === -1 ? 0 : reachedIdx;

    return {
      orderNumber: order.orderNumber,
      status: order.status,
      expectedDelivery: order.expectedDelivery,
      timeline: TRACK_STEPS.map((step, idx) => {
        const event = historyByStatus.get(step.status);
        return {
          status: step.status,
          label: step.label,
          at: event?.at ?? null,
          location: event?.location ?? '',
          completed: idx <= effectiveIdx,
        };
      }),
    };
  }

  // ---------- Cancel ----------

  async cancel(userId: string, idOrNumber: string, reason?: string): Promise<OrderDocument> {
    const order = await this.getOwn(userId, idOrNumber);
    if (!['placed', 'confirmed'].includes(order.status)) {
      throw new BadRequestException(`Orders in "${order.status}" state can no longer be cancelled`);
    }
    return this.applyCancellation(order, reason ?? 'Cancelled by customer');
  }

  private async applyCancellation(order: OrderDocument, reason: string): Promise<OrderDocument> {
    // Restock every line
    for (const item of order.items) {
      await this.productModel
        .updateOne({ _id: item.productId }, { $inc: { stock: item.quantity, salesCount: -item.quantity } })
        .exec();
    }
    if (order.pricing.couponCode) {
      await this.couponsService.incrementUsage(order.pricing.couponCode, -1);
    }

    order.status = 'cancelled';
    order.cancelReason = reason;

    // Paid orders get their refund flagged on cancellation
    let note = reason;
    if (order.payment.status === 'paid') {
      order.payment.status = 'refunded';
      order.markModified('payment');
      note = `${reason} — Refund initiated to original payment method`;
    }

    order.statusHistory.push({ status: 'cancelled', at: new Date(), location: '', note });
    return order.save();
  }

  // ---------- Admin ----------

  async adminList(query: AdminOrderQueryDto): Promise<Paginated<OrderDocument>> {
    const filter: Record<string, unknown> = {};
    if (query.status) filter.status = query.status;
    if (query.q) {
      const rx = new RegExp(query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ orderNumber: rx }, { customerName: rx }];
    }

    const [items, total] = await Promise.all([
      this.orderModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((query.page - 1) * query.pageSize)
        .limit(query.pageSize)
        .exec(),
      this.orderModel.countDocuments(filter),
    ]);
    return paginate(items, total, query.page, query.pageSize);
  }

  async adminGet(idOrNumber: string): Promise<OrderDocument> {
    const order = await this.findByIdOrNumber(idOrNumber);
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  async adminUpdateStatus(
    idOrNumber: string,
    status: OrderStatus,
    location?: string,
    note?: string,
  ): Promise<OrderDocument> {
    const order = await this.adminGet(idOrNumber);

    const allowed = STATUS_TRANSITIONS[order.status] ?? [];
    if (!allowed.includes(status)) {
      throw new BadRequestException(
        `Cannot move an order from "${order.status}" to "${status}". Allowed: ${allowed.join(', ') || 'none'}`,
      );
    }

    if (status === 'cancelled') {
      return this.applyCancellation(order, note ?? 'Cancelled by store');
    }

    order.status = status;
    order.statusHistory.push({ status, at: new Date(), location: location ?? '', note: note ?? '' });
    await order.save();

    const labels: Record<string, string> = {
      confirmed: 'has been confirmed',
      processing: 'is being processed',
      shipped: 'has been shipped',
      'out-for-delivery': 'is out for delivery',
      delivered: 'has been delivered',
      returned: 'return has been processed',
    };
    void this.notificationModel.create({
      userId: order.userId,
      title: `Order ${order.orderNumber} update`,
      message: `Your order ${labels[status] ?? `is now ${status}`}.`,
      kind: 'order',
      href: `/orders/${order.orderNumber}`,
    });
    return order;
  }

  /** Hand-rolled CSV — no extra dependency needed. */
  async exportCsv(): Promise<string> {
    const orders = await this.orderModel.find().sort({ createdAt: -1 }).exec();
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [
      ['Order Number', 'Customer', 'Status', 'Items', 'Subtotal', 'Discount', 'Shipping', 'Total', 'Payment', 'City', 'Created At'].join(','),
      ...orders.map((o) =>
        [
          esc(o.orderNumber),
          esc(o.customerName),
          esc(o.status),
          o.items.reduce((n, i) => n + i.quantity, 0),
          o.pricing.subtotal,
          o.pricing.discount,
          o.pricing.shipping,
          o.pricing.total,
          esc(o.payment.label),
          esc(o.address.city),
          esc((o as unknown as { createdAt: Date }).createdAt?.toISOString()),
        ].join(','),
      ),
    ];
    return rows.join('\n');
  }

  private findByIdOrNumber(idOrNumber: string): Promise<OrderDocument | null> {
    if (Types.ObjectId.isValid(idOrNumber)) {
      return this.orderModel.findById(idOrNumber).exec();
    }
    return this.orderModel.findOne({ orderNumber: idOrNumber.toUpperCase() }).exec();
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100;

const buildKey = (productId: string, selections: Record<string, string>): string => {
  const parts = Object.entries(selections)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`);
  return parts.length ? `${productId}:${parts.join('|')}` : productId;
};
