import { PrismaClient, UserRole } from '@prisma/client';
import * as argon2 from 'argon2';

async function main() {
  const prisma = new PrismaClient();
  const email = process.env.ADMIN_BOOTSTRAP_EMAIL ?? 'admin@amrutam.local';
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD ?? 'Admin1!ChangeMe';

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`Admin ${email} already exists`);
    await prisma.$disconnect();
    return;
  }

  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });

  const admin = await prisma.user.create({
    data: {
      email,
      passwordHash,
      role: UserRole.admin,
      emailVerified: true,
      profile: { create: { firstName: 'Admin', lastName: 'User' } },
    },
  });

  console.log(`Created admin user: ${admin.email} (${admin.id})`);
  console.log('⚠️  Admin requires MFA setup on first login. Call POST /v1/auth/mfa/setup');
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
