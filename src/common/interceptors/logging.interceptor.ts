import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Request } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');
  private readonly sensitivePatterns = [
    /password/i,
    /token/i,
    /secret/i,
    /apikey/i,
    /authorization/i,
    /cookie/i,
    /creditcard/i,
    /ssn/i,
  ];

  private sanitizeUrl(url: string): string {
    // Remove sensitive query params
    const [path] = url.split('?');
    return path;
  }

  private shouldLog(url: string, method: string): boolean {
    // Skip logging health checks and swagger
    return !(url.includes('/health') || url.includes('/api/docs') || url.includes('/api-json'));
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request & { user?: { sub?: string } }>();
    const { method, url } = request;
    const start = Date.now();

    if (!this.shouldLog(url, method)) {
      return next.handle();
    }

    return next.handle().pipe(
      tap({
        error: (err: Error & { status?: number }) => {
          const ms = Date.now() - start;
          const safeUrl = this.sanitizeUrl(url);
          const isSensitive = this.sensitivePatterns.some(pattern => pattern.test(safeUrl));

          // Don't log URLs with sensitive data
          if (isSensitive) {
            this.logger.warn(`${method} [REDACTED] ${err.status ?? 500} ${ms}ms`);
          } else {
            // Log generic error, not the full message
            const errorType = err.name || 'Error';
            this.logger.warn(`${method} ${safeUrl} ${err.status ?? 500} ${ms}ms - ${errorType}`);
          }
        },
      }),
    );
  }
}
