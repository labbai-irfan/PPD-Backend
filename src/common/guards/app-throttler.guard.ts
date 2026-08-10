import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';

/**
 * Same policy as the express rate limiter in main.ts, which the global
 * ThrottlerGuard was ignoring: development is unthrottled, and signed-in
 * requests are exempt — an admin paging through the product table or running a
 * bulk edit fires far more than 100 requests a minute and is not the threat
 * the limit exists for.
 *
 * Anonymous traffic in production keeps the 100/min window, and login/register
 * stay throttled because they carry no token.
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected shouldSkip(context: ExecutionContext): Promise<boolean> {
    if ((process.env.NODE_ENV ?? 'development') !== 'production') {
      return Promise.resolve(true);
    }
    const request = context.switchToHttp().getRequest<Request>();
    return Promise.resolve(Boolean(request.headers.authorization?.startsWith('Bearer ')));
  }
}
