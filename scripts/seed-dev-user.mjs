/**
 * Seed a local dev user into the SQLite database.
 * Run: node scripts/seed-dev-user.mjs
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';

config(); // load .env

const prisma = new PrismaClient();

const DEV_EMAIL    = 'dev@glondia.local';
const DEV_PASSWORD = 'devpass123';
const DEV_NAME     = 'Dev User';

async function main() {
  const existing = await prisma.user.findUnique({ where: { email: DEV_EMAIL } });
  if (existing) {
    console.log(`✓ Dev user already exists: ${DEV_EMAIL}`);
    console.log(`  Password: ${DEV_PASSWORD}`);
    await prisma.$disconnect();
    return;
  }

  const passwordHash = await bcrypt.hash(DEV_PASSWORD, 10);
  const user = await prisma.user.create({
    data: {
      id: randomUUID(),
      email: DEV_EMAIL,
      passwordHash,
      name: DEV_NAME,
      role: 'owner',
      planId: 'free',
      profileDetails: JSON.stringify({ organizationName: 'Local Dev Workspace' }),
    },
  });

  console.log('✓ Dev user created successfully!');
  console.log(`  Email:    ${user.email}`);
  console.log(`  Password: ${DEV_PASSWORD}`);
  console.log(`  ID:       ${user.id}`);
  await prisma.$disconnect();
}

main().catch(err => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
