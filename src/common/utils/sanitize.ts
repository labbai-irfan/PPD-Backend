/**
 * Security utilities for input sanitization and validation
 */

/**
 * Sanitize string input to remove potentially dangerous characters
 * Used for user-generated content like names, titles, descriptions
 */
export function sanitizeString(input: string, maxLength = 500): string {
  if (!input) return '';

  // Trim and limit length
  let sanitized = input.trim().substring(0, maxLength);

  // Remove control characters and null bytes
  sanitized = sanitized.replace(/[\x00-\x08\x0b-\x0c\x0e-\x1f\x7f]/g, '');

  // Decode HTML entities to prevent double-encoding issues
  // Note: Don't HTML-escape here; let frontend handle display escaping
  return sanitized;
}

/**
 * Sanitize email address
 */
export function sanitizeEmail(input: string): string {
  if (!input) return '';
  return input.trim().toLowerCase().substring(0, 254); // RFC 5321
}

/**
 * Sanitize phone number (remove non-digits)
 */
export function sanitizePhone(input: string): string {
  if (!input) return '';
  return input.replace(/\D/g, '').substring(0, 15); // International max
}

/**
 * Validate and sanitize URL to prevent open redirects
 */
export function sanitizeUrl(url: string, allowedDomains: string[] = []): string {
  if (!url) return '/';

  try {
    const parsed = new URL(url, 'https://localhost');
    // Only allow http/https
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return '/';
    }
    // Prevent open redirects if allowedDomains is specified
    if (allowedDomains.length > 0 && !allowedDomains.includes(parsed.hostname)) {
      return '/';
    }
    return parsed.toString();
  } catch {
    // If URL parsing fails, return safe default
    return url.startsWith('/') ? url : '/';
  }
}

/**
 * Validate password strength
 * - Minimum 8 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one number
 * - At least one special character
 */
export function validatePasswordStrength(password: string): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (password.length < 8) {
    errors.push('Password must be at least 8 characters');
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  if (!/\d/.test(password)) {
    errors.push('Password must contain at least one number');
  }
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Sanitize object keys to prevent prototype pollution
 * Removes keys like __proto__, constructor, prototype
 */
export function sanitizeObjectKeys<T extends Record<string, unknown>>(obj: T): T {
  const dangerous = ['__proto__', 'constructor', 'prototype'];
  const sanitized = { ...obj };

  for (const key of dangerous) {
    delete sanitized[key as keyof T];
  }

  return sanitized;
}

/**
 * Limit array size to prevent DoS from massive payloads
 */
export function limitArray<T>(arr: T[], maxLength: number): T[] {
  if (!Array.isArray(arr)) return [];
  return arr.slice(0, maxLength);
}
