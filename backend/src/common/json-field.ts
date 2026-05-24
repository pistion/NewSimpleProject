import { Prisma } from '@prisma/client';

export function jsonToDb(value: Prisma.InputJsonValue | unknown, fallback: unknown = {}): string {
  return JSON.stringify(value ?? fallback);
}

export function jsonFromDb<T = unknown>(value: unknown, fallback: T): T {
  if (typeof value !== 'string') {
    return (value ?? fallback) as T;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
