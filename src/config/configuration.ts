export default () => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3000', 10),
  apiPrefix: process.env.API_PREFIX ?? 'api/v1',

  mongodbUri: process.env.MONGODB_URI ?? 'mongodb://localhost:27017/ppd-store',

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET,
    accessExpires: process.env.JWT_ACCESS_EXPIRES ?? '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET,
    refreshExpires: process.env.JWT_REFRESH_EXPIRES ?? '7d',
  },

  security: {
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS ?? '12', 10),
    loginMaxAttempts: parseInt(process.env.LOGIN_MAX_ATTEMPTS ?? '5', 10),
    loginLockoutMinutes: parseInt(process.env.LOGIN_LOCKOUT_MINUTES ?? '30', 10),
  },

  otp: {
    length: parseInt(process.env.OTP_LENGTH ?? '6', 10),
    ttlMinutes: parseInt(process.env.OTP_TTL_MINUTES ?? '10', 10),
    resendCooldownSeconds: parseInt(process.env.OTP_RESEND_COOLDOWN_SECONDS ?? '60', 10),
    resetTokenTtlMinutes: parseInt(process.env.RESET_TOKEN_TTL_MINUTES ?? '30', 10),
  },

  mail: {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT ?? '587', 10),
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.MAIL_FROM ?? 'noreply@ppdstore.com',
  },

  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',

  uploads: {
    dir: process.env.UPLOAD_DIR ?? './uploads',
    maxFileSizeMb: parseInt(process.env.MAX_FILE_SIZE_MB ?? '5', 10),
  },

  commerce: {
    freeShippingThreshold: parseInt(process.env.FREE_SHIPPING_THRESHOLD ?? '499', 10),
    shippingFee: parseInt(process.env.SHIPPING_FEE ?? '40', 10),
    referralReward: parseInt(process.env.REFERRAL_REWARD ?? '200', 10),
    loyaltyPointsPerRupee: parseInt(process.env.LOYALTY_POINTS_PER_RUPEE ?? '1', 10),
  },

  payments: {
    razorpayKeyId: process.env.RAZORPAY_KEY_ID ?? '',
    razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET ?? '',
  },
});
