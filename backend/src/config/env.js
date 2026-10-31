import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, '../../.env') });

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3000,
  
  database: {
    url: process.env.DATABASE_URL,
  },
  
  jwt: {
    secret: process.env.JWT_SECRET || 'default-dev-secret',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  },
  
  github: {
    apiBaseUrl: process.env.GITHUB_API_BASE_URL || 'https://api.github.com',
    // Optional platform-wide token used ONLY for anonymous/public reads.
    // User-specific actions (repository registration, ownership checks) always
    // use the caller's own encrypted token from the database.
    token: process.env.GITHUB_TOKEN,
    timeout: parseInt(process.env.GITHUB_TIMEOUT_MS, 10) || 10000,
    // AES-256-GCM key for per-user GitHub tokens. Never expose to the client.
    tokenEncryptionKey: process.env.GITHUB_TOKEN_ENCRYPTION_KEY,
    oauth: {
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      callbackUrl: process.env.GITHUB_CALLBACK_URL,
    },
  },
  
  ai: {
    serviceUrl: process.env.AI_SERVICE_URL || 'http://localhost:5000/api',
    timeout: parseInt(process.env.AI_SERVICE_TIMEOUT, 10) || 30000,
    maxRetries: parseInt(process.env.AI_MAX_RETRIES, 10) ?? 2,
    retryBaseDelayMs: parseInt(process.env.AI_RETRY_BASE_DELAY_MS, 10) || 500,
    // Maximum number of commits sent to the AI service per analysis request
    maxCommitsInPayload: parseInt(process.env.AI_MAX_COMMITS, 10) || 100,
  },
  
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 900000,
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100,
  },
  
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  },
  
  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },

  isDevelopment() {
    return this.nodeEnv === 'development';
  },

  isProduction() {
    return this.nodeEnv === 'production';
  },

  isTest() {
    return this.nodeEnv === 'test';
  },
};

// Validate required environment variables
const requiredVars = ['DATABASE_URL'];
const missing = requiredVars.filter((key) => !process.env[key]);

if (missing.length > 0 && !env.isTest()) {
  console.error(`Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

export default env;
