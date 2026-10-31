import { PrismaClient } from '@prisma/client';
import logger from '../utils/logger.js';

let prisma;

function createPrismaClient() {
  const client = new PrismaClient({
    log: [
      { level: 'query', emit: 'event' },
      { level: 'error', emit: 'stdout' },
      { level: 'warn', emit: 'stdout' },
    ],
  });

  client.$on('query', (e) => {
    logger.debug(`Query: ${e.query} - Duration: ${e.duration}ms`);
  });

  return client;
}

export function getPrismaClient() {
  if (!prisma) {
    prisma = createPrismaClient();
  }
  return prisma;
}

export async function connectDatabase() {
  const client = getPrismaClient();
  try {
    await client.$connect();
    logger.info('✅ Database connected successfully');
    return true;
  } catch (error) {
    logger.error('❌ Database connection failed:', error.message);
    throw error;
  }
}

export async function disconnectDatabase() {
  if (prisma) {
    await prisma.$disconnect();
    logger.info('Database disconnected');
  }
}

export default { getPrismaClient, connectDatabase, disconnectDatabase };
