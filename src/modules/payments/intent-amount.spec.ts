import { Test } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { PaymentsService } from './payments.service';
import { PaymentIntent } from './schemas/payment-intent.schema';
import { Product } from '../products/schemas/product.schema';
import { User } from '../users/schemas/user.schema';
import { CouponsService } from '../coupons/coupons.service';
import { MailService } from '../mail/mail.service';
import { DeliveryChargesService } from '../delivery-charges/delivery-charges.module';

/**
 * The amount we charge MUST equal the total OrdersService.place() computes —
 * it rejects the order otherwise, leaving the customer paid with no order.
 * Both sides now price shipping through DeliveryChargesService.
 */
describe('payment intent amount', () => {
  const MAHARASHTRA = { country: 'India', state: 'Maharashtra', city: 'Pune', pincode: '411001' };
  let created: Record<string, any>;
  let seenByDelivery: Record<string, any>;

  async function intentFor(dto: Record<string, any>) {
    created = {};
    seenByDelivery = {};

    const moduleRef = await Test.createTestingModule({
      providers: [
        PaymentsService,
        {
          provide: getModelToken(PaymentIntent.name),
          useValue: {
            create: (doc: Record<string, any>) => {
              created = doc;
              return Promise.resolve({ ...doc, save: () => Promise.resolve() });
            },
          },
        },
        {
          provide: getModelToken(Product.name),
          useValue: {
            findOne: () => ({
              select: () => ({ exec: () => Promise.resolve({ title: 'Book', price: 599 }) }),
            }),
          },
        },
        { provide: getModelToken(User.name), useValue: {} },
        { provide: CouponsService, useValue: { validate: () => Promise.resolve({ discount: 0 }) } },
        { provide: ConfigService, useValue: { get: () => undefined } }, // no razorpay keys -> mock provider
        { provide: MailService, useValue: {} },
        {
          provide: DeliveryChargesService,
          useValue: {
            calculate: (d: Record<string, any>) => {
              seenByDelivery = d;
              // Mirrors the live rule: INDIA/MAHARASHTRA -> 70
              return Promise.resolve(d.state?.toUpperCase() === 'MAHARASHTRA' ? 70 : 0);
            },
          },
        },
      ],
    }).compile();

    await moduleRef.get(PaymentsService).createIntent('68f0a1b2c3d4e5f601234567', dto as any);
    return created;
  }

  it('charges subtotal + destination shipping, not subtotal alone', async () => {
    // The live regression: Rs.599 book to Maharashtra was charged Rs.599, but the
    // order totalled Rs.669 and was rejected for an amount mismatch.
    const intent = await intentFor({
      items: [{ productId: '68f0a1b2c3d4e5f601234568', quantity: 1 }],
      method: 'upi',
      address: MAHARASHTRA,
    });

    expect(intent.amount).toBe(669);
  });

  it('passes the destination through to the delivery pricing', async () => {
    await intentFor({
      items: [{ productId: '68f0a1b2c3d4e5f601234568', quantity: 1 }],
      method: 'upi',
      address: MAHARASHTRA,
    });

    expect(seenByDelivery).toMatchObject({ state: 'Maharashtra', pincode: '411001' });
  });

  it('still prices an intent when no address is supplied', async () => {
    const intent = await intentFor({
      items: [{ productId: '68f0a1b2c3d4e5f601234568', quantity: 1 }],
      method: 'upi',
    });

    expect(intent.amount).toBe(599);
  });
});
