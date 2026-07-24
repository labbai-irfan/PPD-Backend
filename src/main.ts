import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import * as express from 'express';
import { join } from 'path';
import rateLimit from 'express-rate-limit';
import type { Request, Response, NextFunction } from 'express';
import { AppModule } from './app.module';

/**
 * Strip MongoDB operator keys ($gt, $where, …) and dotted keys from an object,
 * mutating IN PLACE. We can't use express-mongo-sanitize here because it
 * reassigns `req.query`, which is a getter-only property in Express 5.
 */
function stripMongoOperators(obj: unknown): void {
  if (!obj || typeof obj !== 'object') return;
  for (const key of Object.keys(obj as Record<string, unknown>)) {
    if (key.startsWith('$') || key.includes('.')) {
      delete (obj as Record<string, unknown>)[key];
    } else {
      stripMongoOperators((obj as Record<string, unknown>)[key]);
    }
  }
}

/** NoSQL-injection guard that mutates req.body/query/params without reassigning them. */
function mongoSanitize() {
  return (req: Request, _res: Response, next: NextFunction) => {
    stripMongoOperators(req.body);
    stripMongoOperators(req.query);
    stripMongoOperators(req.params);
    next();
  };
}

async function bootstrap() {
  // rawBody: webhook signatures (Razorpay) are HMACs over the exact request bytes
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
    logger: ['error', 'warn'],
  });
  const config = app.get(ConfigService);

  const apiPrefix = config.get<string>('apiPrefix') ?? 'api';
  const port = config.get<number>('port') ?? 3000;
  const corsOrigin = config.get<string>('corsOrigin') ?? 'http://localhost:5173';
  const nodeEnv = config.get<string>('nodeEnv') ?? 'development';

  app.setGlobalPrefix(apiPrefix);

  // Behind Nginx (Internet → Nginx → NestJS): trust the single proxy hop so
  // req.ip, @Ip() and the rate limiters/ThrottlerGuard see the real client IP
  // from X-Forwarded-For, not Nginx's. A fixed hop count (1) — never `true` —
  // so clients can't spoof X-Forwarded-For to dodge rate limiting. Only in
  // deployed envs, where the proxy actually exists; direct-connect dev stays safe.
  if (nodeEnv !== 'development') {
    app.set('trust proxy', 1);
  }

  // Cap request body size to blunt payload-based DoS
  app.useBodyParser('json', { limit: '1mb' });
  app.useBodyParser('urlencoded', { limit: '1mb', extended: true });

  // CORS must be enabled first, before other middleware that might interfere
  const corsOptions = nodeEnv === 'production'
    ? {
        origin: corsOrigin.split(',').map(o => o.trim()),
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
        maxAge: 86400,
        optionsSuccessStatus: 200,
      }
    : {
        origin: true,
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'Origin', 'X-Requested-With'],
      };

  app.enableCors(corsOptions);

  // Security headers
  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
    frameguard: { action: 'deny' },
    noSniff: true,
    xssFilter: true,
    hsts: { maxAge: 31536000, includeSubDomains: true },
  }));

  // Sanitize data against NoSQL injection
  app.use(mongoSanitize());

  // Rate limiting on auth endpoints (relaxed in development, skip for authenticated users)
  const limiter = rateLimit({
    windowMs: nodeEnv === 'development' ? 60 * 1000 : 15 * 60 * 1000, // 1 min in dev, 15 min in prod
    max: nodeEnv === 'development' ? 1000 : 100, // 1000 req/min in dev, 100 in prod
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: false,
    legacyHeaders: false,
    skip: (req: any) => {
      if (nodeEnv === 'development') return true
      // Skip rate limiting for authenticated admin requests (JWT token present)
      return !!req.headers.authorization?.startsWith('Bearer ')
    },
  });
  app.use(limiter);

  // Stricter rate limit for auth endpoints
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5, // 5 attempts per 15 minutes
    skipSuccessfulRequests: true,
    message: 'Too many login attempts, please try again later.',
    standardHeaders: false,
    legacyHeaders: false,
  });
  app.use(`/${apiPrefix}/auth/login`, authLimiter);
  app.use(`/${apiPrefix}/auth/admin-login`, authLimiter);
  app.use(`/${apiPrefix}/auth/register`, authLimiter);

  // Uploaded images served statically (product photos, avatars) with CORS restrictions
  const uploadDir = config.get<string>('uploads.dir') ?? './uploads';
  const resolvedUploadDir = uploadDir.startsWith('/') ? uploadDir : join(process.cwd(), uploadDir);
  app.use('/uploads', express.static(resolvedUploadDir));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  // Swagger: only expose in development/staging, not in production
  if (nodeEnv !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('PPD Store API')
      .setDescription('Backend API for the PPD e-commerce store (customer + admin)')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
    const logger = new Logger('Bootstrap');
    logger.debug(`Swagger available at http://localhost:${port}/api/docs`);
  }

  await app.listen(port);
  const logger = new Logger('Bootstrap');
  logger.log(`🚀 API running on port ${port}/${apiPrefix}`);
  if (nodeEnv !== 'production') {
    logger.debug(`📚 Swagger available at http://localhost:${port}/api/docs`);
  }
}

void bootstrap();
