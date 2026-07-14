import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Coupon, CouponDocument } from './schemas/coupon.schema';

@Injectable()
export class CouponsService {
  constructor(@InjectModel(Coupon.name) private readonly couponModel: Model<CouponDocument>) {}

  /** Customer-facing list: active, in window. */
  listActive(): Promise<CouponDocument[]> {
    const now = new Date();
    return this.couponModel
      .find({ isActive: true, startsAt: { $lte: now }, expiresAt: { $gt: now } })
      .sort({ expiresAt: 1 })
      .exec();
  }

  /**
   * Validates a code against a subtotal and returns the coupon + discount.
   * Throws BadRequestException with a user-readable reason when not applicable.
   */
  async validate(code: string, subtotal: number): Promise<{ coupon: CouponDocument; discount: number }> {
    const coupon = await this.couponModel.findOne({ code: code.trim().toUpperCase() }).exec();
    if (!coupon || !coupon.isActive) throw new BadRequestException('Invalid coupon code');

    const now = new Date();
    if (coupon.startsAt > now) throw new BadRequestException('This coupon is not active yet');
    if (coupon.expiresAt <= now) throw new BadRequestException('This coupon has expired');
    if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
      throw new BadRequestException('This coupon has been fully redeemed');
    }
    if (subtotal < coupon.minOrder) {
      throw new BadRequestException(
        `Add items worth ₹${coupon.minOrder - subtotal} more to use this coupon`,
      );
    }

    const raw = coupon.kind === 'flat' ? coupon.value : (subtotal * coupon.value) / 100;
    const discount = Math.round(coupon.maxDiscount ? Math.min(raw, coupon.maxDiscount) : raw);
    return { coupon, discount };
  }

  async incrementUsage(code: string, delta: 1 | -1): Promise<void> {
    await this.couponModel.updateOne({ code }, { $inc: { usedCount: delta } }).exec();
  }
}
