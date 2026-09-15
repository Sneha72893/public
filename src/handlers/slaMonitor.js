/**
 * slaMonitor.js
 * Scheduled trigger — runs every 5 minutes.
 * Checks all open incidents against their SLA deadline and escalates
 * to the appropriate responder if the deadline has passed.
 *
 * Escalation ladder:
 *   Level 0 (NONE)    → Level 1 (SENIOR): reassign to senior engineer
 *   Level 1 (SENIOR)  → Level 2 (MANAGER): reassign to manager, mark urgent
 *   Level 2 (MAX)     → no further action (already at max escalation)
 *
 * Idempotency: escalationHistory tracks all escalations; each level
 * is only applied once per incident.
 */

import {
  listOverdueIncidents,
  updateEscalation,
  getSettings,
} from '../services/storageService.js';
import { reassignIssue, addComment } from '../services/jiraService.js';
import { notifyEscalation }          from '../services/notifier.js';
import { logger }                    from '../utils/logger.js';
import { ESCALATION_LEVELS }         from '../utils/constants.js';

/**
 * Main SLA monitor function — invoked by Forge scheduledTrigger.
 *
 * @param {object} event   - Forge scheduled trigger event
 * @param {object} context - Forge invocation context
 */
export async function runSlaMonitor(event, context) {
  logger.info('SLA Monitor: starting scheduled check');

  const overdueIncidents = await listOverdueIncidents();

  if (overdueIncidents.length === 0) {
    logger.info('SLA Monitor: no overdue incidents found');
    return;
  }

  logger.info(`SLA Monitor: processing ${overdueIncidents.length} overdue incident(s)`);

  const settings = await getSettings();

  const l1AccountId = settings.escalationL1AccountId || process.env.ESCALATION_L1_ACCOUNT_ID;
  const l2AccountId = settings.escalationL2AccountId || process.env.ESCALATION_L2_ACCOUNT_ID;
  const l1Name      = settings.escalationL1Name      || 'Senior Engineer';
  const l2Name      = settings.escalationL2Name      || 'Engineering Manager';

  // Process each overdue incident (capped at 10 per trigger run to stay within time limits)
  const batch = overdueIncidents.slice(0, 10);

  for (const incident of batch) {
    try {
      await escalateIncident(incident, {
        l1AccountId, l2AccountId,
        l1Name, l2Name,
      });
    } catch (err) {
      logger.error('SLA Monitor: error escalating incident', {
        jiraIssueKey: incident.jiraIssueKey,
        error: err.message,
      });
      // Continue processing remaining incidents
    }
  }

  logger.info('SLA Monitor: check complete');
}

// ─── Escalation Logic ─────────────────────────────────────────────────────────

async function escalateIncident(incident, { l1AccountId, l2AccountId, l1Name, l2Name }) {
  const { jiraIssueKey, escalationLevel, severity, jiraIssueUrl, slaDeadlineMs } = incident;

  const overdueMinutes = Math.floor((Date.now() - slaDeadlineMs) / 60000);

  if (escalationLevel === ESCALATION_LEVELS.NONE) {
    // ── Escalate to Level 1: Senior Engineer ──────────────────────────────
    if (!l1AccountId) {
      logger.warn('SLA Monitor: L1 account ID not configured, skipping escalation', { jiraIssueKey });
      return;
    }

    logger.info('SLA Monitor: escalating to senior engineer', { jiraIssueKey, overdueMinutes });

    await reassignIssue(jiraIssueKey, l1AccountId);
    await addComment(
      jiraIssueKey,
      `⚡ SLA ESCALATION (Level 1): This ${severity} incident has breached its SLA by ${overdueMinutes} minute(s). ` +
      `Reassigned to ${l1Name} for immediate attention. ` +
      `SLA deadline was: ${new Date(slaDeadlineMs).toISOString()}`,
    );
    await updateEscalation(jiraIssueKey, ESCALATION_LEVELS.SENIOR, l1AccountId);
    await notifyEscalation(incident, ESCALATION_LEVELS.SENIOR, l1Name);

  } else if (escalationLevel === ESCALATION_LEVELS.SENIOR) {
    // ── Escalate to Level 2: Manager ──────────────────────────────────────
    if (!l2AccountId) {
      logger.warn('SLA Monitor: L2 account ID not configured, skipping manager escalation', { jiraIssueKey });
      return;
    }

    logger.info('SLA Monitor: escalating to manager', { jiraIssueKey, overdueMinutes });

    await reassignIssue(jiraIssueKey, l2AccountId);
    await addComment(
      jiraIssueKey,
      `🚨 SLA ESCALATION (Level 2 — CRITICAL): This ${severity} incident remains unresolved and has now been escalated to ${l2Name}. ` +
      `SLA was breached ${overdueMinutes} minute(s) ago. ` +
      `Immediate action is required.`,
    );
    await updateEscalation(jiraIssueKey, ESCALATION_LEVELS.MANAGER, l2AccountId);
    await notifyEscalation(incident, ESCALATION_LEVELS.MANAGER, l2Name);

  } else {
    // Already at max escalation
    logger.info('SLA Monitor: incident already at max escalation level', { jiraIssueKey });
  }
}
