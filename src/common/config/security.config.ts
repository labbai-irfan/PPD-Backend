/**
 * Security configuration constants and policies
 */

/**
 * Password policy
 */
export const PASSWORD_POLICY = {
  MIN_LENGTH: 8,
  REQUIRE_UPPERCASE: true,
  REQUIRE_LOWERCASE: true,
  REQUIRE_NUMBER: true,
  REQUIRE_SPECIAL: true,
  MAX_LENGTH: 128,
};

/**
 * Input size limits to prevent DoS
 */
export const INPUT_LIMITS = {
  NAME: 100,
  EMAIL: 254, // RFC 5321
  PHONE: 15, // International standard
  ADDRESS: 500,
  DESCRIPTION: 2000,
  URL: 2048,
  ARRAY_MAX: 100, // Max items in array inputs
  FILE_UPLOAD_SIZE_MB: 5,
};

/**
 * Rate limiting policies
 */
export const RATE_LIMITS = {
  GLOBAL: {
    windowMs: 60_000, // 1 minute
    maxRequests: 100,
  },
  AUTH_LOGIN: {
    windowMs: 60_000,
    maxRequests: 5, // 5 attempts per minute
  },
  AUTH_REGISTER: {
    windowMs: 3_600_000, // 1 hour
    maxRequests: 3, // 3 accounts per hour per IP
  },
  AUTH_OTP: {
    windowMs: 60_000,
    maxRequests: 3, // 3 OTP requests per minute
  },
  PASSWORD_RESET: {
    windowMs: 60_000,
    maxRequests: 3, // 3 reset requests per minute
  },
};

/**
 * JWT configuration
 */
export const JWT_CONFIG = {
  ACCESS_TOKEN_EXPIRES: '15m',
  REFRESH_TOKEN_EXPIRES: '7d',
  ALGORITHM: 'HS256',
};

/**
 * Session security
 */
export const SESSION_SECURITY = {
  IDLE_TIMEOUT_MS: 30 * 60_000, // 30 minutes
  ABSOLUTE_TIMEOUT_MS: 24 * 60 * 60_000, // 24 hours
  CONCURRENT_SESSION_LIMIT: 3, // Max concurrent sessions per user
};

/**
 * Sensitive fields that should never be returned in API responses
 */
export const SENSITIVE_FIELDS = [
  'password',
  'passwordHash',
  'refreshToken',
  'refreshTokenHash',
  'otp',
  'resetToken',
  'resetTokenHash',
  'apiKey',
  'apiSecret',
];

/**
 * Field authorization matrix
 * Defines which fields a user can read/write
 */
export const FIELD_AUTHORIZATION = {
  User: {
    // Customer can only read these fields
    readOnly: ['id', 'email', 'emailVerified', 'role', 'createdAt', 'updatedAt'],
    // Customer cannot write these fields
    writeProtected: ['id', 'email', 'role', 'createdAt', 'updatedAt'],
  },
  Order: {
    readOnly: ['id', 'status', 'pricing', 'createdAt', 'updatedAt'],
    writeProtected: ['id', 'userId', 'status', 'pricing', 'createdAt', 'updatedAt'],
  },
  Product: {
    readOnly: ['id', 'createdAt', 'updatedAt'],
    writeProtected: ['id', 'createdAt', 'updatedAt'],
  },
};

/**
 * Allowed file types and their MIME types
 */
export const ALLOWED_FILE_TYPES = {
  images: ['image/jpeg', 'image/png', 'image/webp'],
  documents: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
};

/**
 * CORS configuration
 */
export const CORS_CONFIG = {
  DEVELOPMENT: {
    origin: true,
    credentials: true,
  },
  PRODUCTION: {
    // Should be configured from env var
    credentials: true,
    maxAge: 86400, // 24 hours
  },
};

/**
 * Logging configuration
 */
export const LOGGING_CONFIG = {
  EXCLUDE_PATHS: [
    '/health',
    '/api/docs',
    '/api/docs-json',
  ],
  // Never log these fields
  SANITIZE_FIELDS: [
    'password',
    'authorization',
    'cookie',
    'x-api-key',
    'refreshToken',
    'otp',
  ],
};
