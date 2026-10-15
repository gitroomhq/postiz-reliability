import crypto from 'crypto';
import EVP_BytesToKey from 'evp_bytestokey';
import { PrismaClient } from '@prisma/client';

const [name, apiUrl, ...integrationIds] = process.argv.slice(2);
const apiKey = process.env.SEED_POSTIZ_API_KEY;
if (!name || !apiUrl || !integrationIds.length || !apiKey) {
  console.error(
    'Usage: SEED_POSTIZ_API_KEY in .env, then pnpm seed:target <environment name> <postiz api url> <integration id>...'
  );
  process.exit(1);
}

const fixedEncryption = (value) => {
  const algorithm = 'aes-256-cbc';
  const { keyLength, ivLength } = crypto.getCipherInfo(algorithm);
  const { key, iv } = EVP_BytesToKey(
    Buffer.from(process.env.ENCRYPTION_KEY ?? '', 'utf8'),
    null,
    keyLength * 8,
    ivLength,
    'md5'
  );
  const cipher = crypto.createCipheriv(algorithm, key, iv);
  return Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]).toString('hex');
};

const url = apiUrl.replace(/\/+$/, '');
const response = await fetch(`${url}/public/v1/integrations`, {
  headers: { Authorization: apiKey },
});
if (!response.ok) {
  console.error(`GET ${url}/public/v1/integrations failed: ${response.status}`);
  process.exit(1);
}
const integrations = await response.json();
const channels = integrationIds.map((id) => integrations.find((i) => i.id === id));
const missing = integrationIds.filter((id, index) => !channels[index]);
if (missing.length) {
  console.error(`Not found in this org: ${missing.join(', ')}`);
  process.exit(1);
}

const prisma = new PrismaClient();
const deletedAt = new Date();
await prisma.$transaction(async (tx) => {
  await tx.testChannel.updateMany({ where: { deletedAt: null }, data: { deletedAt } });
  await tx.testUser.updateMany({ where: { deletedAt: null }, data: { deletedAt } });
  await tx.environment.updateMany({
    where: { deletedAt: null, name: { not: name } },
    data: { deletedAt },
  });
  const environment = await tx.environment.upsert({
    where: { name },
    update: { apiUrl: url, deletedAt: null },
    create: { name, apiUrl: url },
  });
  await tx.testUser.create({
    data: {
      environmentId: environment.id,
      name: 'test org',
      apiKey: fixedEncryption(apiKey),
      channels: {
        create: channels.map((c) => ({ provider: c.identifier, integrationId: c.id })),
      },
    },
  });
  await tx.auditLog.create({
    data: {
      actor: 'seed',
      action: 'target.seed',
      data: { name, apiUrl: url, channels: channels.map((c) => `${c.identifier} ${c.name}`) },
    },
  });
});
console.log(
  `${name} -> ${url}: ${channels.map((c) => `${c.identifier} "${c.name}"`).join(', ')}`
);
await prisma.$disconnect();
