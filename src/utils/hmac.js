/**
 * hmac.js
 * Verifies GitHub webhook HMAC-256 signatures.
 * GitHub signs every payload with the secret you configure in
 * the repo webhook settings and sends the digest in the
 * X-Hub-Signature-256 header.
 */

import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Verify the GitHub webhook signature.
 *
 * @param {string} rawBody    - Raw JSON string body of the request
 * @param {string} signature  - Value of X-Hub-Signature-256 header (e.g. "sha256=abc...")
 * @param {string} secret     - GITHUB_WEBHOOK_SECRET env variable
 * @returns {boolean}         - true if signature is valid
 */
export function verifyGithubSignature(rawBody, signature, secret) {
  if (!signature || !secret) {
    return false;
  }

  const expected = `sha256=${createHmac('sha256', secret)
    .update(rawBody, 'utf8')
    .digest('hex')}`;

  // Use timing-safe comparison to prevent timing attacks
  try {
    const sigBuffer      = Buffer.from(signature, 'utf8');
    const expectedBuffer = Buffer.from(expected, 'utf8');

    if (sigBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return timingSafeEqual(sigBuffer, expectedBuffer);
  } catch {
    return false;
  }
}
