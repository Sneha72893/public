/**
 * severityEngine.js
 * Classifies incident severity and detects the affected environment
 * based on the GitHub workflow_run payload.
 *
 * Classification rules (in priority order):
 *  1. Branch name matches a production pattern → CRITICAL
 *  2. Branch name matches a staging pattern   → HIGH
 *  3. Branch name matches a dev pattern       → MEDIUM
 *  4. Unknown branch                          → LOW
 */

import {
  ENV_PATTERNS,
  ENV_TO_SEVERITY,
  SEVERITY,
  SLA_WINDOWS_MS,
} from '../utils/constants.js';
import { logger } from '../utils/logger.js';

/**
 * Detect the environment from a branch name.
 *
 * @param {string} branchName
 * @returns {'production'|'staging'|'dev'|'unknown'}
 */
export function detectEnvironment(branchName) {
  if (!branchName) return 'unknown';

  const branch = branchName.toLowerCase();

  for (const [env, patterns] of Object.entries(ENV_PATTERNS)) {
    if (patterns.some((regex) => regex.test(branch))) {
      return env;
    }
  }
  return 'unknown';
}

/**
 * Classify incident severity from a GitHub workflow_run payload.
 *
 * @param {object} workflowRun - The `workflow_run` object from GitHub webhook payload
 * @param {string} workflowRun.head_branch
 * @param {string} workflowRun.name
 * @param {string} workflowRun.conclusion
 * @param {number} consecutiveFailures - How many times this workflow has failed in a row
 * @returns {{ severity: string, environment: string, slaDeadlineMs: number }}
 */
export function classify(workflowRun, consecutiveFailures = 0) {
  const { head_branch: branch, name: workflowName } = workflowRun;

  const environment = detectEnvironment(branch);
  let severity = ENV_TO_SEVERITY[environment] || SEVERITY.LOW;

  // Escalate severity if there are multiple consecutive failures
  if (consecutiveFailures >= 3) {
    severity = escalateSeverity(severity);
    logger.warn('Severity escalated due to consecutive failures', {
      workflowName,
      branch,
      consecutiveFailures,
      severity,
    });
  }

  const slaWindowMs   = SLA_WINDOWS_MS[severity];
  const slaDeadlineMs = Date.now() + slaWindowMs;

  logger.info('Incident classified', {
    workflowName,
    branch,
    environment,
    severity,
    slaDeadlineIso: new Date(slaDeadlineMs).toISOString(),
  });

  return { severity, environment, slaDeadlineMs };
}

/**
 * Escalate severity by one level.
 * CRITICAL stays CRITICAL (no higher level).
 *
 * @param {string} current
 * @returns {string}
 */
function escalateSeverity(current) {
  const ladder = [
    SEVERITY.LOW,
    SEVERITY.MEDIUM,
    SEVERITY.HIGH,
    SEVERITY.CRITICAL,
  ];
  const idx = ladder.indexOf(current);
  return idx < ladder.length - 1 ? ladder[idx + 1] : SEVERITY.CRITICAL;
}

/**
 * Human-readable SLA duration string for notifications.
 *
 * @param {string} severity
 * @returns {string}
 */
export function getSlaLabel(severity) {
  const labels = {
    [SEVERITY.CRITICAL]: '1 hour',
    [SEVERITY.HIGH]:     '4 hours',
    [SEVERITY.MEDIUM]:   '24 hours',
    [SEVERITY.LOW]:      '72 hours',
  };
  return labels[severity] || 'unknown';
}
