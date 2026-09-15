/**
 * storageService.js
 * CRUD operations for incident metadata using Forge Storage API.
 *
 * Storage key format:  incident_<JIRA-ISSUE-KEY>   (e.g. incident_OPS-42)
 * Settings key:        settings_app
 *
 * Each incident record shape:
 * {
 *   incidentId:         string,  // Jira issue key
 *   jiraIssueKey:       string,
 *   jiraIssueUrl:       string,
 *   severity:           string,
 *   environment:        string,
 *   workflowName:       string,
 *   workflowRunUrl:     string,
 *   repo:               string,
 *   branch:             string,
 *   actor:              string,
 *   headSha:            string,
 *   conclusion:         string,
 *   detectedAt:         number,  // epoch ms
 *   slaDeadlineMs:      number,  // epoch ms
 *   escalationLevel:    number,  // 0=none, 1=senior, 2=manager
 *   status:             string,  // 'open' | 'escalated' | 'resolved'
 *   resolvedAt:         number|null,
 *   escalationHistory:  Array<{ level, timestamp, assigneeId }>,
 * }
 */

import { kvs } from '@forge/kvs';
import {
  STORAGE_PREFIX,
  SETTINGS_KEY,
  INCIDENT_STATUS,
  ESCALATION_LEVELS,
} from '../utils/constants.js';
import { logger } from '../utils/logger.js';

// ─── Incident CRUD ────────────────────────────────────────────────────────────

/**
 * Save a new incident record.
 *
 * @param {string} jiraIssueKey
 * @param {object} data
 * @returns {Promise<void>}
 */
export async function saveIncident(jiraIssueKey, data) {
  const key = `${STORAGE_PREFIX.INCIDENT}${jiraIssueKey}`;
  const record = {
    ...data,
    incidentId:        jiraIssueKey,
    jiraIssueKey,
    status:            INCIDENT_STATUS.OPEN,
    escalationLevel:   ESCALATION_LEVELS.NONE,
    escalationHistory: [],
    resolvedAt:        null,
    detectedAt:        Date.now(),
  };
  await kvs.set(key, record);
  logger.info('Incident saved to storage', { jiraIssueKey });
}

/**
 * Retrieve an incident by Jira issue key.
 *
 * @param {string} jiraIssueKey
 * @returns {Promise<object|null>}
 */
export async function getIncident(jiraIssueKey) {
  const key = `${STORAGE_PREFIX.INCIDENT}${jiraIssueKey}`;
  return await kvs.get(key);
}

/**
 * Update the escalation state of an incident.
 *
 * @param {string} jiraIssueKey
 * @param {number} newLevel
 * @param {string} assigneeId - Jira account ID of the new assignee
 * @returns {Promise<void>}
 */
export async function updateEscalation(jiraIssueKey, newLevel, assigneeId) {
  const incident = await getIncident(jiraIssueKey);
  if (!incident) {
    logger.warn('updateEscalation: incident not found', { jiraIssueKey });
    return;
  }

  incident.escalationLevel = newLevel;
  incident.status          = INCIDENT_STATUS.ESCALATED;
  incident.escalationHistory.push({
    level:      newLevel,
    timestamp:  Date.now(),
    assigneeId,
  });

  const key = `${STORAGE_PREFIX.INCIDENT}${jiraIssueKey}`;
  await kvs.set(key, incident);
  logger.info('Escalation updated', { jiraIssueKey, newLevel });
}

/**
 * Mark an incident as resolved and record the timestamp.
 *
 * @param {string} jiraIssueKey
 * @returns {Promise<object>} Updated incident record
 */
export async function markResolved(jiraIssueKey) {
  const incident = await getIncident(jiraIssueKey);
  if (!incident) {
    logger.warn('markResolved: incident not found', { jiraIssueKey });
    return null;
  }

  incident.status     = INCIDENT_STATUS.RESOLVED;
  incident.resolvedAt = Date.now();

  const key = `${STORAGE_PREFIX.INCIDENT}${jiraIssueKey}`;
  await kvs.set(key, incident);
  logger.info('Incident marked resolved', { jiraIssueKey });
  return incident;
}

/**
 * List all incidents whose SLA deadline has passed and are still open/escalated.
 * Uses the Forge Storage query cursor to iterate over all incident keys.
 *
 * @returns {Promise<object[]>} Array of overdue incident records
 */
export async function listOverdueIncidents() {
  const now      = Date.now();
  const overdue  = [];

  let cursor;
  do {
    const result = await kvs.query()
      .where('key', kvs.beginsWith(STORAGE_PREFIX.INCIDENT))
      .limit(20)
      .cursor(cursor)
      .getMany();

    for (const { value } of result.results) {
      if (
        value &&
        value.status !== INCIDENT_STATUS.RESOLVED &&
        value.escalationLevel < ESCALATION_LEVELS.MAX &&
        value.slaDeadlineMs < now
      ) {
        overdue.push(value);
      }
    }

    cursor = result.nextCursor;
  } while (cursor);

  logger.info(`Found ${overdue.length} overdue incident(s)`);
  return overdue;
}

/**
 * List all open incidents (for the admin dashboard).
 *
 * @returns {Promise<object[]>}
 */
export async function listOpenIncidents() {
  const open = [];

  let cursor;
  do {
    const result = await kvs.query()
      .where('key', kvs.beginsWith(STORAGE_PREFIX.INCIDENT))
      .limit(20)
      .cursor(cursor)
      .getMany();

    for (const { value } of result.results) {
      if (value && value.status !== INCIDENT_STATUS.RESOLVED) {
        open.push(value);
      }
    }

    cursor = result.nextCursor;
  } while (cursor);

  return open;
}

// ─── App Settings ─────────────────────────────────────────────────────────────

/**
 * Load app-wide settings.
 *
 * @returns {Promise<object>} Settings object (may be empty on first run)
 */
export async function getSettings() {
  return (await kvs.get(SETTINGS_KEY)) || {};
}

/**
 * Persist app-wide settings (merges with existing).
 *
 * @param {object} updates
 * @returns {Promise<object>} Updated settings
 */
export async function updateSettings(updates) {
  const existing = await getSettings();
  const merged   = { ...existing, ...updates };
  await kvs.set(SETTINGS_KEY, merged);
  logger.info('App settings updated', { keys: Object.keys(updates) });
  return merged;
}
