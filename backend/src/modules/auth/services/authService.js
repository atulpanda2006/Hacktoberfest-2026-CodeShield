import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import env from '../../../config/env.js';
import { getPrismaClient } from '../../../config/database.js';
import { AppError } from '../../../utils/AppError.js';

const SALT_ROUNDS = 10;

/**
 * AuthService — Business logic for authentication and user management.
 * All database operations and password/JWT handling live here.
 * Controllers should call these methods and handle HTTP responses.
 */

export class AuthService {
  /**
   * Register a new user.
   * @param {Object} data - { username, email, password, role? }
   * @returns {Promise<{ user: Object, token: string }>}
   */
  static async register(data) {
    const prisma = getPrismaClient();

    // Check for duplicate email
    const existingEmail = await prisma.user.findUnique({
      where: { email: data.email },
    });
    if (existingEmail) {
      throw new AppError('Email already registered', 409);
    }

    // Check for duplicate username
    const existingUsername = await prisma.user.findUnique({
      where: { username: data.username },
    });
    if (existingUsername) {
      throw new AppError('Username already taken', 409);
    }

    // Hash password
    const passwordHash = await bcrypt.hash(data.password, SALT_ROUNDS);

    // Create user
    const user = await prisma.user.create({
      data: {
        username: data.username,
        email: data.email,
        passwordHash,
        role: data.role || 'DEVELOPER',
        accountStatus: 'ACTIVE',
      },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        accountStatus: true,
        createdAt: true,
      },
    });

    // Generate JWT
    const token = AuthService.generateToken(user.id);

    return { user, token };
  }

  /**
   * Authenticate a user by email and password.
   * @param {Object} data - { email, password }
   * @returns {Promise<{ user: Object, token: string }>}
   */
  static async login(data) {
    const prisma = getPrismaClient();

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (!user) {
      throw new AppError('Invalid email or password', 401);
    }

    // Compare password
    const isValid = await bcrypt.compare(data.password, user.passwordHash);
    if (!isValid) {
      throw new AppError('Invalid email or password', 401);
    }

    // Check account status
    if (user.accountStatus !== 'ACTIVE') {
      throw new AppError('Account is not active. Please contact support.', 403);
    }

    // Generate JWT
    const token = AuthService.generateToken(user.id);

    // Return user without password hash
    const { passwordHash: _, ...userWithoutHash } = user;

    return { user: userWithoutHash, token };
  }

  /**
   * Get current user by ID (used by /auth/me).
   * @param {string} userId - UUID of the user
   * @returns {Promise<Object>}
   */
  static async getCurrentUser(userId) {
    const prisma = getPrismaClient();

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        accountStatus: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    return user;
  }

  /**
   * Get a user by ID (public endpoint).
   * @param {string} userId - UUID of the user
   * @returns {Promise<Object>}
   */
  static async getUserById(userId) {
    const prisma = getPrismaClient();

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        accountStatus: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    return user;
  }

  /**
   * Update a user's profile.
   * Only the user themselves or an ADMIN can update.
   * @param {string} targetUserId - UUID of the user to update
   * @param {Object} updateData - Fields to update
   * @param {string} requestingUserId - UUID of the user making the request
   * @param {string} requestingUserRole - Role of the requesting user
   * @returns {Promise<Object>}
   */
  static async updateUser(targetUserId, updateData, requestingUserId, requestingUserRole) {
    const prisma = getPrismaClient();

    // Check the target user exists first, so a missing user reports 404 and not 403.
    const existingUser = await prisma.user.findUnique({
      where: { id: targetUserId },
    });
    if (!existingUser) {
      throw new AppError('User not found', 404);
    }

    // Authorization: user can update their own profile, or ADMIN can update any
    if (requestingUserRole !== 'ADMIN' && requestingUserId !== targetUserId) {
      throw new AppError('You can only update your own profile', 403);
    }

    // If email is being changed, check for duplicates
    if (updateData.email && updateData.email !== existingUser.email) {
      const emailExists = await prisma.user.findUnique({
        where: { email: updateData.email },
      });
      if (emailExists) {
        throw new AppError('Email already registered by another user', 409);
      }
    }

    // If username is being changed, check for duplicates
    if (updateData.username && updateData.username !== existingUser.username) {
      const usernameExists = await prisma.user.findUnique({
        where: { username: updateData.username },
      });
      if (usernameExists) {
        throw new AppError('Username already taken by another user', 409);
      }
    }

    // Non-admin users cannot change their own role or accountStatus
    if (requestingUserRole !== 'ADMIN') {
      delete updateData.role;
      delete updateData.accountStatus;
    }

    // Update user
    const updatedUser = await prisma.user.update({
      where: { id: targetUserId },
      data: updateData,
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        accountStatus: true,
        updatedAt: true,
      },
    });

    return updatedUser;
  }

  /**
   * Generate a JWT access token.
   * @param {string} userId - UUID of the user
   * @returns {string}
   */
  static generateToken(userId) {
    return jwt.sign({ userId }, env.jwt.secret, {
      expiresIn: env.jwt.expiresIn,
    });
  }

  /**
   * Logout — In a stateless JWT architecture, logout is handled client-side
   * by discarding the token. This method is a placeholder for future
   * token blacklisting if needed.
   * @returns {Promise<void>}
   */
  static async logout() {
    // No server-side action needed for stateless JWT.
    // Future: add token to a revocation list (Redis/DB) if required.
    return;
  }
}

export default AuthService;
