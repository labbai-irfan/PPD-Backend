import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * Unified error envelope with security hardening:
 * - Never leak stack traces or database errors to clients
 * - Log detailed errors internally for debugging
 * - Return generic messages in production
 * - Include request ID for error tracking
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const nodeEnv = process.env.NODE_ENV ?? 'development';
    const requestId = (request as any).id || Date.now().toString();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let error = 'Internal Server Error';
    let message: string | string[] = 'Something went wrong';

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
        error = exception.name;
      } else if (typeof body === 'object' && body !== null) {
        const b = body as Record<string, unknown>;
        message = (b.message as string | string[]) ?? exception.message;
        error = (b.error as string) ?? exception.name;
      }
    } else if (exception instanceof Error) {
      // Log detailed error internally
      this.logger.error(`[${requestId}] ${exception.message}`, exception.stack);
      // Don't expose error message to client in production
      if (nodeEnv === 'production') {
        message = 'An unexpected error occurred';
      } else {
        message = exception.message;
      }
    }

    // Sanitize: remove MongoDB/database-specific errors from response
    if (typeof message === 'string') {
      if (message.includes('MongoError') || message.includes('$') || message.includes('ObjectId')) {
        this.logger.warn(`[${requestId}] Database error exposed: ${message}`);
        message = nodeEnv === 'production' ? 'An error occurred' : message;
      }
    }

    // Never expose sensitive paths or internal structure
    const safeUrl = request.url.split('?')[0]; // Remove query params that might contain tokens

    response.status(statusCode).json({
      statusCode,
      error,
      message,
      requestId, // For support/debugging
      ...(nodeEnv !== 'production' && { path: safeUrl }), // Don't expose paths in production
      timestamp: new Date().toISOString(),
    });
  }
}
