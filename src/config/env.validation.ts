import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  PORT: Joi.number().default(3000),
  API_PREFIX: Joi.string().default('api/v1'),

  MONGODB_URI: Joi.string().required(),

  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_EXPIRES: Joi.string().default('15m'),
  JWT_REFRESH_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_EXPIRES: Joi.string().default('7d'),

  BCRYPT_ROUNDS: Joi.number().min(10).max(15).default(12),
  LOGIN_MAX_ATTEMPTS: Joi.number().default(5),
  LOGIN_LOCKOUT_MINUTES: Joi.number().default(30),

  OTP_LENGTH: Joi.number().default(6),
  OTP_TTL_MINUTES: Joi.number().default(10),
  OTP_RESEND_COOLDOWN_SECONDS: Joi.number().default(60),
  RESET_TOKEN_TTL_MINUTES: Joi.number().default(30),

  SMTP_HOST: Joi.string().allow('').optional(),
  SMTP_PORT: Joi.number().default(587),
  SMTP_USER: Joi.string().allow('').optional(),
  SMTP_PASS: Joi.string().allow('').optional(),
  MAIL_FROM: Joi.string().default('noreply@ppdstore.com'),

  CORS_ORIGIN: Joi.string().default('http://localhost:5173'),
  UPLOAD_DIR: Joi.string().default('./uploads'),
  MAX_FILE_SIZE_MB: Joi.number().default(5),

  FREE_SHIPPING_THRESHOLD: Joi.number().default(499),
  SHIPPING_FEE: Joi.number().default(40),
  REFERRAL_REWARD: Joi.number().default(200),
  LOYALTY_POINTS_PER_RUPEE: Joi.number().default(1),

  RAZORPAY_KEY_ID: Joi.string().allow('').optional(),
  RAZORPAY_KEY_SECRET: Joi.string().allow('').optional(),
});
