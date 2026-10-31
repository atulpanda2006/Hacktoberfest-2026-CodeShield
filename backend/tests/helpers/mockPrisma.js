import { jest } from '@jest/globals';

/**
 * Build a deep Prisma client mock covering every model used by the API.
 * Individual tests override the return values they need.
 */
export function createPrismaMock() {
  const model = () => ({
    findUnique: jest.fn(),
    findUniqueOrThrow: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn().mockResolvedValue([]),
    create: jest.fn(),
    createMany: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    upsert: jest.fn(),
    delete: jest.fn(),
    deleteMany: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
    groupBy: jest.fn().mockResolvedValue([]),
    aggregate: jest.fn().mockResolvedValue({ _avg: {}, _sum: {}, _count: 0 }),
  });

  const prismaMock = {
    user: model(),
    developerProfile: model(),
    repository: model(),
    repositoryMember: model(),
    contribution: model(),
    contributionEvidence: model(),
    verificationRecord: model(),
    aIAnalysis: model(),
    reputation: model(),
    reputationHistory: model(),
    trustRelationship: model(),
    review: model(),
    dispute: model(),
    notification: model(),
  };

  prismaMock.$queryRaw = jest.fn().mockResolvedValue([{ '?column?': 1 }]);
  prismaMock.$executeRaw = jest.fn().mockResolvedValue(1);
  prismaMock.$connect = jest.fn().mockResolvedValue(undefined);
  prismaMock.$disconnect = jest.fn().mockResolvedValue(undefined);
  prismaMock.$transaction = jest.fn(async (arg) =>
    typeof arg === 'function' ? arg(prismaMock) : Promise.all(arg)
  );

  return prismaMock;
}

/**
 * Clear every mock call/implementation, then restore the safe defaults that
 * services rely on (empty lists, zero counts, working transactions).
 */
export function resetPrismaMock(prismaMock) {
  jest.resetAllMocks();

  for (const key of Object.keys(prismaMock)) {
    if (key.startsWith('$')) continue;

    prismaMock[key].findMany.mockResolvedValue([]);
    prismaMock[key].count.mockResolvedValue(0);
    prismaMock[key].groupBy.mockResolvedValue([]);
    prismaMock[key].aggregate.mockResolvedValue({ _avg: {}, _sum: {}, _count: 0 });
  }

  prismaMock.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);
  prismaMock.$transaction.mockImplementation(async (arg) =>
    typeof arg === 'function' ? arg(prismaMock) : Promise.all(arg)
  );
}

/**
 * Standard mock that the `src/config/database.js` module factory should return.
 */
export function databaseModuleMock(prismaMock) {
  return {
    getPrismaClient: () => prismaMock,
    connectDatabase: jest.fn().mockResolvedValue(true),
    disconnectDatabase: jest.fn().mockResolvedValue(undefined),
    default: {
      getPrismaClient: () => prismaMock,
      connectDatabase: jest.fn().mockResolvedValue(true),
      disconnectDatabase: jest.fn().mockResolvedValue(undefined),
    },
  };
}

export default { createPrismaMock, resetPrismaMock, databaseModuleMock };
