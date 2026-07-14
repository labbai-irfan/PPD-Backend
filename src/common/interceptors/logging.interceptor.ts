import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Request } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request & { user?: { sub?: string } }>();
    const { method, url } = request;
    const start = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const ms = Date.now() - start;
          const userId = request.user?.sub ?? 'anon';
          this.logger.log(`${method} ${url} ${ms}ms [${userId}]`);
        },
        error: (err: Error & { status?: number }) => {
          const ms = Date.now() - start;
          this.logger.warn(`${method} ${url} ${err.status ?? 500} ${ms}ms - ${err.message}`);
        },
      }),
    );
  }
}
