import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

const STRIP_KEYS = new Set(['__v', 'passwordHash', 'twoFactorSecret', 'refreshTokenHash', 'codeHash']);

/**
 * Serializes Mongoose documents for the API:
 * - _id (ObjectId) -> id (string)
 * - strips __v and sensitive fields everywhere
 * - Dates -> ISO strings (JSON.stringify does this, but we normalize early)
 */
function serialize(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serialize);
  if (typeof value === 'object') {
    // Unwrap Mongoose documents to plain objects
    const obj =
      typeof (value as { toObject?: () => object }).toObject === 'function'
        ? (value as { toObject: () => object }).toObject()
        : value;

    // ObjectId (has toHexString) -> string
    if (typeof (obj as { toHexString?: () => string }).toHexString === 'function') {
      return (obj as { toHexString: () => string }).toHexString();
    }

    // Map (mongoose Map fields) -> plain object
    if (obj instanceof Map) {
      const out: Record<string, unknown> = {};
      for (const [k, v] of obj.entries()) out[String(k)] = serialize(v);
      return out;
    }

    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(obj as Record<string, unknown>)) {
      if (STRIP_KEYS.has(key)) continue;
      if (key === '_id') {
        out.id = serialize(val);
        continue;
      }
      out[key] = serialize(val);
    }
    return out;
  }
  return value;
}

@Injectable()
export class TransformInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map((data) => serialize(data)));
  }
}
