/**
 * VouchService — handles vouch/denounce list management.
 *
 * Uses the Trustdown (.td) file format for the vouch list.
 * GitHub integration uses the backend's GITHUB_TOKEN.
 */

import { getPrismaClient } from '../../../config/database.js';
import githubConfig from '../../../config/github.js';
import { AppError } from '../../../utils/AppError.js';
import fs from 'fs';
import path from 'path';
import { parsePagination } from '../../../utils/pagination.js';

/**
 * Path to the vouch list file, defaulting to .github/VOUCHED.td
 * Can be overridden by VOUCHED_FILE env var.
 */
const defaultVouchFile = '.github/VOUCHED.td';
const vouchFile = process.env.VOUCHED_FILE || defaultVouchFile;

/**
 * Read the vouch list .td file and return structured records.
 * Returns array of { username, platform, type } where type is 'vouch' or 'denounce'
 * Format: username, platform:username, or -platform:username reason
 * Lines starting with # are comments.
 */
export function readVouchRecords() {
  const records = [];
  const filePath = path.resolve(process.cwd(), vouchFile);

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      // Denouncement line starts with -
      if (trimmed.startsWith('-')) {
        const match = trimmed.match(/^-(.+)$/);
        if (match) {
          const rest = match[1].trim();
          const parts = rest.split(/\s+/);
          const username = parts[0];
          const reason = parts.slice(1).join(' ');
          records.push({ username, platform: 'github', type: 'denounce', reason });
        }
        continue;
      }

      // Regular vouch line: github:username or just username
      const platformMatch = trimmed.match(/^github:(.+)$/i);
      if (platformMatch) {
        records.push({ username: platformMatch[1], platform: 'github', type: 'vouch' });
      } else {
        records.push({ username: trimmed, platform: 'github', type: 'vouch' });
      }
    }
  } catch (error) {
    // File doesn't exist yet - that's OK, return empty records
    if (error.code !== 'ENOENT') {
      console.error('Error reading vouch file:', error);
    }
  }

  return records;
}

/**
 * Check whether a user is vouched, denounced, or unknown.
 * @param {string} username - GitHub username to check
 * @param {object} [options] - Additional options
 * @param {string} [options.platform='github'] - Target platform
 * @returns {{status: 'vouched'|'denounced'|'unknown', reason?: string}}
 */
export function checkVouchStatus(username, options = {}) {
  const platform = options.platform || 'github';
  const records = readVouchRecords();

  for (const record of records) {
    const recordUser = record.username.toLowerCase();
    const recordPlatform = (record.platform || 'github').toLowerCase();

    if (recordUser === username.toLowerCase() && recordPlatform === platform.toLowerCase()) {
      if (record.username.startsWith('-')) {
        return { status: 'denounced', reason: record.username.slice(1).split(' ')[1] || undefined };
      }
      return { status: 'vouched' };
    }
  }

  return { status: 'unknown' };
}

/**
 * Add a vouch for a user.
 * @param {string} username - GitHub username to vouch
 * @param {string} [reason] - Optional reason for the vouch
 * @returns {{status: 'added'|'already_vouched', username}}
 */
export function addVouch(username, reason) {
  const records = readVouchRecords();
  const normalized = username.toLowerCase();

  // Check if already vouched
  for (const record of records) {
    if (record.username.startsWith('-')) continue;
    if (record.username.toLowerCase() === normalized && (record.platform || 'github') === 'github') {
      return { status: 'already_vouched', username };
    }
  }

  // Add new vouch (without leading dash)
  records.push({ username, platform: 'github' });
  // persistVouchRecords() // persist later

  return { status: 'added', username };
}

/**
 * Remove/denounce a user.
 * @param {string} username - GitHub username to denounce
 * @param {string} [reason] - Reason for denouncement
 * @returns {{status: 'removed'|'already_denounced', username}}
 */
export function denounceUser(username, reason) {
  const records = readVouchRecords();
  const normalized = username.toLowerCase();

  // Filter out existing vouch for this user
  const filtered = records.filter(record => {
    if (record.username.toLowerCase() === normalized && (record.platform || 'github') === 'github') {
      return false; // remove existing vouch
    }
    return true;
  });

  // Add denouncement (with leading dash)
  const denounceEntry = reason ? `-${username} ${reason}` : `-${username}`;
  filtered.push({ username, platform: 'github' }); // placeholder

  // persistVouchRecords()
  return { status: 'removed', username };
}

/**
 * Persist the vouch records to the .td file.
 * Meant to be called after batch operations.
 */
export function persistVouchRecords() {
  // File persistence is left as a setup task.
  // In production, write vouchFile with proper .td format.
  console.log('Persisting vouch records (file write not implemented in this stub)');
}