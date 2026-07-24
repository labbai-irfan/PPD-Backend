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
import { Product, ProductDocument, InventoryLog } from '../products/schemas/product.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import { Notification, NotificationDocument } from '../notifications/notifications.module';
import { CouponsService } from '../coupons/coupons.service';
import { PaymentsService } from '../payments/payments.service';
import { MailService } from '../mail/mail.service';
import { UsersService } from '../users/users.service';
import { generateOrderNumber } from '../../common/utils';
import { Paginated, paginate } from '../../common/dto/pagination-query.dto';
import { AdminOrderQueryDto, PlaceOrderDto } from './dto/order.dto';
import { DeliveryChargesService } from '../delivery-charges/delivery-charges.module';

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
    @InjectModel(InventoryLog.name) private readonly inventoryLogModel: Model<InventoryLog>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Notification.name) private readonly notificationModel: Model<NotificationDocument>,
    private readonly couponsService: CouponsService,
    private readonly paymentsService: PaymentsService,
    private readonly usersService: UsersService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
    private readonly deliveryChargesService: DeliveryChargesService,
  ) {}

  // ---------- Place ----------

  async place(userId: string, dto: PlaceOrderDto): Promise<OrderDocument> {
    const decremented: { productId: Types.ObjectId; quantity: number }[] = [];
    const inventoryLogsToCreate: { productId: Types.ObjectId; changeAmount: number; action: 'deduction'; reason: string; performedBy: string }[] = [];

    try {
      const orderItemsSnapshot: any[] = [];
      let subtotal = 0;

      for (const item of dto.items) {
        if (!Types.ObjectId.isValid(item.productId)) {
          throw new BadRequestException(`Invalid product id: ${item.productId}`);
        }

        const product = await this.productModel.findById(item.productId).exec();
        if (!product || !product.isActive) {
          throw new ConflictException(`Product "${product?.title ?? 'Unknown'}" is no longer available`);
        }

        const batch = product.batches.find((b: any) => b._id.toString() === item.batchId);
        if (!batch) {
          throw new BadRequestException(`Batch "${item.batchId}" not found on product "${product.title}"`);
        }

        if (batch.status !== 'active') {
          throw new BadRequestException(`Batch "${batch.name}" on product "${product.title}" is currently not active`);
        }

        const batchCount = item.quantity;
        if (batchCount < batch.minOrderCount || batchCount > batch.maxOrderCount) {
          throw new BadRequestException(
            `Requested batch count (${batchCount}) must be between ${batch.minOrderCount} and ${batch.maxOrderCount} for batch "${batch.name}"`
          );
        }

        const totalUnits = batch.quantity * batchCount;
        const currentStock = product.stockQuantity ?? product.stock;

        if (currentStock < totalUnits) {
          throw new ConflictException(
            `Product "${product.title}" (Batch: "${batch.name}") has insufficient stock. Required: ${totalUnits} units, Available: ${currentStock} units`
          );
        }

        product.stock = currentStock - totalUnits;
        product.stockQuantity = currentStock - totalUnits;
        product.salesCount = (product.salesCount ?? 0) + totalUnits;

        await product.save();

        decremented.push({ productId: product._id, quantity: totalUnits });

        const batchPrice = batch.sellingPrice;
        const totalAmount = batchPrice * batchCount;
        subtotal += totalAmount;

        orderItemsSnapshot.push({
          productId: product._id,
          key: buildKey(product._id.toHexString(), { ...item.selections, batchId: batch._id.toString() }),
          title: product.title,
          brand: product.brand,
          image: batch.image || (product.images && product.images[0]) || '',
          price: batchPrice,
          mrp: batch.calculatedPrice,
          quantity: batchCount,
          stock: product.stockQuantity,
          selections: item.selections || {},
          batchId: batch._id.toString(),
          batchSku: batch.sku,
          batchName: batch.name,
          unitPrice: product.unitPrice ?? product.price,
          batchQuantity: batch.quantity,
          batchPrice: batchPrice,
          batchCount: batchCount,
          totalUnits: totalUnits,
          totalAmount: totalAmount,
          pricingMode: batch.pricingMode,
        });

        inventoryLogsToCreate.push({
          productId: product._id,
          changeAmount: -totalUnits,
          action: 'deduction',
          reason: `Deduction for Order pending generation`,
          performedBy: userId,
        });
      }

      let discount = 0;
      let couponCode: string | undefined;
      if (dto.couponCode) {
        const result = await this.couponsService.validate(dto.couponCode, subtotal);
        discount = result.discount;
        couponCode = result.coupon.code;
      }

      const shipping = await this.deliveryChargesService.calculate({
        country: dto.address.country,
        state: dto.address.state,
        city: dto.address.city,
        pincode: dto.address.pincode,
        subtotal: subtotal - discount,
      });
      const total = round2(subtotal - discount + shipping);

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

      const maxDeliveryDays = Math.max(...orderItemsSnapshot.map((s) => s.deliveryDays ?? 2), 1);
      const user = await this.usersService.findByIdOrFail(userId);

      let order: OrderDocument | null = null;
      for (let attempt = 0; attempt < 5 && !order; attempt++) {
        try {
          order = await this.orderModel.create({
            orderNumber: generateOrderNumber(),
            userId: new Types.ObjectId(userId),
            customerName: user.name,
            items: orderItemsSnapshot,
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

      // Update and save inventory logs with the generated order number
      for (const log of inventoryLogsToCreate) {
        await this.inventoryLogModel.create({
          productId: log.productId,
          changeAmount: log.changeAmount,
          action: log.action,
          reason: `Order #${order!.orderNumber}`,
          performedBy: log.performedBy,
        });
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

      void this.mail.sendOrderStatus(
        user.email,
        order!.orderNumber,
        order!.status,
        total,
        order!.expectedDelivery
      );

      return order!;
    } catch (err) {
      for (const d of decremented) {
        await this.productModel
          .updateOne(
            { _id: d.productId },
            { $inc: { stock: d.quantity, stockQuantity: d.quantity, salesCount: -d.quantity } }
          )
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
    
    // Attempt to fetch user to get their email
    const user = await this.userModel.findById(order.userId).exec();
    if (user?.email) {
      void this.mail.sendOrderStatus(
        user.email,
        order.orderNumber,
        status,
        order.pricing.total,
        order.expectedDelivery
      );
    }
    
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
