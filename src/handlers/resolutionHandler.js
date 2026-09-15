/**
 * resolutionHandler.js
 * Handles the Jira `jira:issueTransitioned` event.
 * Fires when any Jira issue transitions to "Done" or "Resolved".
 *
 * Flow:
 *  1. Check if the transitioned issue has the "Incident" label
 *  2. Load the incident record from Forge Storage
 *  3. Fetch the GitHub error log (read-only)
 *  4. Generate a Confluence post-mortem page
 *  5. Add a comment to the Jira issue with the Confluence link
 *  6. Send a resolution notification to Slack/Teams
 *  7. Mark the incident resolved in Forge Storage
 */

import { getIncident, markResolved } from '../services/storageService.js';
import { getIssue, addComment }      from '../services/jiraService.js';
import { createPostMortem }          from '../services/confluenceService.js';
import { notifyResolution }          from '../services/notifier.js';
import { getJobLogs, getFailedJobs } from '../services/githubService.js';
import { logger }                    from '../utils/logger.js';
import { JIRA_LABEL_INCIDENT, INCIDENT_STATUS } from '../utils/constants.js';

/**
 * Forge jira:issueTransitioned event handler.
 *
 * @param {object} event   - Forge event payload
 * @param {object} context - Forge invocation context
 */
export async function handleResolution(event, context) {
  if (event.selfGenerated) {
    return;
  }

  const issueKey = event.issue?.key;
  if (!issueKey) {
    logger.warn('Resolution handler: no issue key in event');
    return;
  }

  const statusChange = event.changelog?.items?.find(item => item.field === 'status');
  const toStatus = (statusChange?.toString || event.transition?.to?.name || '').toLowerCase();

  const resolvedStatuses = ['done', 'resolved', 'closed', 'complete'];
  if (statusChange && !resolvedStatuses.includes(toStatus)) {
    // Status changed, but not to a resolved state
    return;
  }

  logger.info('Resolution handler: issue update received', { issueKey, toStatus });

  // ── 1. Check if this is an Incident issue ─────────────────────────────────
  const jiraIssue = await getIssue(issueKey);
  const labels    = jiraIssue?.fields?.labels || [];

  if (!labels.includes(JIRA_LABEL_INCIDENT)) {
    logger.info('Resolution handler: not an Incident issue, skipping', { issueKey });
    return;
  }

  // ── 2. Load incident record from Forge Storage ────────────────────────────
  const incident = await getIncident(issueKey);

  if (!incident) {
    logger.warn('Resolution handler: no storage record found for incident', { issueKey });
    // Still attempt post-mortem with what we know from Jira
    return;
  }

  if (incident.status === INCIDENT_STATUS.RESOLVED) {
    logger.info('Resolution handler: incident already marked resolved, skipping', { issueKey });
    return;
  }

  // ── 3. Fetch GitHub error logs (best-effort, read-only) ───────────────────
  let errorLog = '(Log not available)';
  try {
    const { githubOwner, githubRepo, githubRunId } = incident;
    if (githubOwner && githubRepo && githubRunId) {
      const failedJobs = await getFailedJobs(githubOwner, githubRepo, githubRunId);
      if (failedJobs.length > 0) {
        errorLog = await getJobLogs(githubOwner, githubRepo, failedJobs[0].id);
      }
    }
  } catch (err) {
    logger.warn('Resolution handler: failed to fetch GitHub logs (non-fatal)', { error: err.message });
  }

  // ── 4. Mark resolved in storage (get timestamp before Confluence call) ────
  const resolvedIncident = await markResolved(issueKey);
  const fullIncident     = resolvedIncident || incident;

  // ── 5. Generate Confluence post-mortem page ───────────────────────────────
  let confluenceUrl = null;
  try {
    confluenceUrl = await createPostMortem(fullIncident, errorLog);
    logger.info('Resolution handler: Confluence page created', { issueKey, confluenceUrl });
  } catch (err) {
    logger.error('Resolution handler: Confluence page creation failed', {
      issueKey,
      error: err.message,
    });
    confluenceUrl = null;
  }

  // ── 6. Comment on Jira issue with post-mortem link ────────────────────────
  const commentText = confluenceUrl
    ? `✅ Incident resolved. A post-mortem page has been automatically generated:\n${confluenceUrl}\n\nPlease fill in the Root Cause Analysis and Resolution Steps sections.`
    : '✅ Incident resolved. (Post-mortem page generation failed — please create manually.)';

  await addComment(issueKey, commentText);

  // ── 7. Send resolution notification to Slack/Teams ───────────────────────
  await notifyResolution(fullIncident, confluenceUrl || incident.jiraIssueUrl);

  logger.info('Resolution handler: incident pipeline complete', { issueKey, confluenceUrl });
}
