/**
 * Restore Local Admin account (soft-deleted) and reset password.
 * Run from project root: node scripts/restore-admin.mjs
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { config } from 'dotenv';

config({ path: '.env.local' });
config();

const prisma = new PrismaClient();

const ADMIN_EMAIL = process.env.RESTORE_ADMIN_EMAIL || 'admin@glondia.local';
const ADMIN_PASSWORD = process.env.RESTORE_ADMIN_PASSWORD || 'adminpass123';
const ADMIN_NAME = 'Local Admin';

async function main() {
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  const existing = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });

  if (existing) {
    const user = await prisma.user.update({
      where: { email: ADMIN_EMAIL },
      data: {
        name: ADMIN_NAME,
        role: 'admin',
        passwordHash,
        accountStatus: 'active',
        disabledAt: null,
        disabledReason: null,
        deletedAt: null,
        reactivatedAt: new Date(),
      },
    });
    console.log('✓ Restored existing admin account');
    console.log(`  ID:     ${user.id}`);
    console.log(`  Email:  ${user.email}`);
    console.log(`  Name:   ${user.name}`);
    console.log(`  Role:   ${user.role}`);
    console.log(`  Status: ${user.accountStatus}`);
    console.log(`  Password reset to: ${ADMIN_PASSWORD}`);
  } else {
    const user = await prisma.user.create({
      data: {
        id: randomUUID(),
        email: ADMIN_EMAIL,
        passwordHash,
        name: ADMIN_NAME,
        role: 'admin',
        planId: 'free',
        accountStatus: 'active',
        profileDetails: JSON.stringify({ organizationName: 'Glondia Admin' }),
      },
    });
    console.log('✓ Created admin account');
    console.log(`  ID:     ${user.id}`);
    console.log(`  Email:  ${user.email}`);
    console.log(`  Password: ${ADMIN_PASSWORD}`);
  }

  // Revoke old refresh tokens so a clean login is required
  try {
    const u = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });
    if (u) {
      const r = await prisma.refreshToken.updateMany({
        where: { userId: u.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      console.log(`✓ Revoked ${r.count} old refresh token(s)`);
    }
  } catch (e) {
    console.log('(token revoke skipped)', e.message);
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('Restore failed:', err.message);
  await prisma.$disconnect();
  process.exit(1);
});
