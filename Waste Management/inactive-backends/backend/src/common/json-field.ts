import { Prisma } from '@prisma/client';

// PostgreSQL native Json — Prisma handles serialization; these are passthrough helpers.
export function jsonToDb<T extends Prisma.InputJsonValue = Prisma.InputJsonValue>(
  value: T | unknown,
  fallback: T = {} as T
): T {
  return (value ?? fallback) as T;
}

export function jsonFromDb<T = unknown>(value: unknown, fallback: T): T {
  return (value ?? fallback) as T;
}
