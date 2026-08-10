import { ExecutionContext } from '@nestjs/common';
import { AppThrottlerGuard } from './app-throttler.guard';

/** shouldSkip is protected — reach it the way the framework would. */
const skip = (guard: AppThrottlerGuard, authorization?: string) =>
  (guard as unknown as { shouldSkip(c: ExecutionContext): Promise<boolean> }).shouldSkip({
    switchToHttp: () => ({ getRequest: () => ({ headers: authorization ? { authorization } : {} }) }),
  } as unknown as ExecutionContext);

describe('AppThrottlerGuard', () => {
  const guard = Object.create(AppThrottlerGuard.prototype) as AppThrottlerGuard;
  const realEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = realEnv;
  });

  it('does not throttle in development', async () => {
    // Paging a 748-product admin table blew past 100 req/min and threw ThrottlerException.
    process.env.NODE_ENV = 'development';
    await expect(skip(guard)).resolves.toBe(true);
  });

  it('exempts signed-in requests in production', async () => {
    process.env.NODE_ENV = 'production';
    await expect(skip(guard, 'Bearer abc.def.ghi')).resolves.toBe(true);
  });

  it('still throttles anonymous traffic in production', async () => {
    process.env.NODE_ENV = 'production';
    await expect(skip(guard)).resolves.toBe(false);
  });

  it('throttles a malformed authorization header in production', async () => {
    // Login/register carry no Bearer token, so they stay rate limited.
    process.env.NODE_ENV = 'production';
    await expect(skip(guard, 'Basic abc')).resolves.toBe(false);
  });
});
