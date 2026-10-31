import jwt from 'jsonwebtoken';
import env from '../../src/config/env.js';

/**
 * Shared fixtures for authenticated integration tests.
 * The `authenticate` middleware loads the user from the database, so tests must
 * make the Prisma mock resolve the requester for that lookup.
 */
export const TEST_USERS = {
  developer: {
    id: '11111111-1111-4111-8111-111111111111',
    username: 'devone',
    email: 'devone@example.com',
    role: 'DEVELOPER',
    accountStatus: 'ACTIVE',
  },
  otherDeveloper: {
    id: '22222222-2222-4222-8222-222222222222',
    username: 'devtwo',
    email: 'devtwo@example.com',
    role: 'DEVELOPER',
    accountStatus: 'ACTIVE',
  },
  maintainer: {
    id: '33333333-3333-4333-8333-333333333333',
    username: 'maint',
    email: 'maint@example.com',
    role: 'MAINTAINER',
    accountStatus: 'ACTIVE',
  },
  reviewer: {
    id: '44444444-4444-4444-8444-444444444444',
    username: 'rev',
    email: 'rev@example.com',
    role: 'REVIEWER',
    accountStatus: 'ACTIVE',
  },
  admin: {
    id: '55555555-5555-4555-8555-555555555555',
    username: 'admin',
    email: 'admin@example.com',
    role: 'ADMIN',
    accountStatus: 'ACTIVE',
  },
};

export function makeToken(userId) {
  return jwt.sign({ userId }, env.jwt.secret, { expiresIn: '1h' });
}

export function bearer(user) {
  return `Bearer ${makeToken(user.id)}`;
}

/**
 * Make the auth middleware resolve `user` for its lookup, while any other id
 * resolves to null (replace with your own mockImplementation when a test needs
 * several users at once).
 */
export function mockRequester(prisma, user) {
  prisma.user.findUnique.mockImplementation(async ({ where }) => {
    if (where.id === user.id) return user;
    return null;
  });
}

export default { TEST_USERS, makeToken, bearer, mockRequester };
