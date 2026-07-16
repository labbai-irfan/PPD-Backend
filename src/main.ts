import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import * as express from 'express';
import { join } from 'path';
import { AppModule } from './app.module';

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
  // Cap request body size to blunt payload-based DoS. useBodyParser is the
  // NestJS-native way that preserves rawBody (needed for the Razorpay webhook
  // HMAC) — unlike a bare express.json(), which would consume the raw stream.
  // Bulk-import uses multipart (multer enforces its own limits).
  app.useBodyParser('json', { limit: '1mb' });
  app.useBodyParser('urlencoded', { limit: '1mb', extended: true });
  app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: true,
    frameguard: { action: 'deny' },
    noSniff: true,
    xssFilter: true,
  }));
  // Uploaded images served statically (product photos, avatars) with CORS restrictions
  app.use('/uploads', express.static(join(process.cwd(), 'uploads')));

  // CORS: restrictive by default, only allow configured origin(s)
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
