import { PrismaClient } from '@prisma/client';

const email = (process.argv[2] || '').trim().toLowerCase();
if (!email) {
  console.error('Usage: pnpm seed:admin <email>');
  process.exit(1);
}

const prisma = new PrismaClient();
await prisma.member.upsert({
  where: { email },
  update: { role: 'ADMIN', deletedAt: null },
  create: { email, role: 'ADMIN' },
});
await prisma.auditLog.create({
  data: { actor: 'seed', action: 'member.admin', data: { email } },
});
console.log(`${email} is an admin`);
await prisma.$disconnect();
