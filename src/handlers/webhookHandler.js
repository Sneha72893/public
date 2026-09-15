/**
 * webhookHandler.js
 * Entrypoint for GitHub Actions `workflow_run` webhook events.
 *
 * Flow:
 *  1. Verify HMAC-256 signature (X-Hub-Signature-256 header)
 *  2. Filter for workflow_run with conclusion = 'failure'
 *  3. Classify severity and environment
 *  4. Create Jira incident issue
 *  5. Persist incident record to Forge Storage
 *  6. Send Slack/Teams notification
 *  7. Return HTTP 200 immediately
 *
 * SECURITY: Workflow reruns are NEVER triggered here.
 */

import { verifyGithubSignature } from '../utils/hmac.js';
import { classify, getSlaLabel }  from '../services/severityEngine.js';
import { createIncident }          from '../services/jiraService.js';
import { saveIncident }            from '../services/storageService.js';
import { notifyNewIncident }       from '../services/notifier.js';
import {
  getFailedJobs,
  getJobLogs,
  countConsecutiveFailures,
} from '../services/githubService.js';
import { logger }                  from '../utils/logger.js';
import {
  GITHUB_EVENT_WORKFLOW_RUN,
  GITHUB_CONCLUSION_FAILURE,
} from '../utils/constants.js';

/**
 * Handle an incoming GitHub webhook event.
 * This is the Forge web trigger handler — called by Forge when
 * a POST arrives at the web trigger URL.
 *
 * @param {object} event      - Forge web trigger event
 * @param {object} context    - Forge invocation context
 * @returns {object}          - HTTP response: { statusCode, body }
 */
export async function handleGithubWebhook(event, context) {
  const body      = event.body;
  const headers   = event.headers || {};
  const rawBody   = typeof body === 'string' ? body : JSON.stringify(body);

  // ── 1. Verify HMAC signature ───────────────────────────────────────────────
  const signature = headers['x-hub-signature-256']?.[0] || headers['X-Hub-Signature-256']?.[0];
  const secret    = process.env.GITHUB_WEBHOOK_SECRET;

  if (!verifyGithubSignature(rawBody, signature, secret)) {
    logger.warn('Webhook: invalid or missing HMAC signature', { signature: signature?.slice(0, 15) });
    return { statusCode: 401, body: 'Unauthorized: invalid signature' };
  }

  // ── 2. Parse and validate event type ──────────────────────────────────────
  const githubEvent = headers['x-github-event']?.[0] || headers['X-GitHub-Event']?.[0];

  if (githubEvent !== GITHUB_EVENT_WORKFLOW_RUN) {
    // Accept but ignore non-workflow_run events (GitHub sends a ping on creation)
    logger.info('Webhook: ignoring non-workflow_run event', { githubEvent });
    return { statusCode: 200, body: 'Ignored (not a workflow_run event)' };
  }

  const payload     = typeof body === 'string' ? JSON.parse(body) : body;
  const workflowRun = payload.workflow_run;
  const action      = payload.action;

  // Only act on completed runs
  if (action !== 'completed') {
    return { statusCode: 200, body: 'Ignored (action is not completed)' };
  }

  // Only act on failed conclusions
  if (workflowRun.conclusion !== GITHUB_CONCLUSION_FAILURE) {
    logger.info('Webhook: workflow succeeded — no incident', {
      workflowName: workflowRun.name,
      conclusion:   workflowRun.conclusion,
    });
    return { statusCode: 200, body: 'No action — workflow succeeded' };
  }

  logger.info('Webhook: workflow failure detected', {
    workflowName: workflowRun.name,
    branch:       workflowRun.head_branch,
    repo:         payload.repository?.full_name,
    runId:        workflowRun.id,
  });

  // ── 3. Extract metadata ────────────────────────────────────────────────────
  const owner       = payload.repository?.owner?.login;
  const repoName    = payload.repository?.name;
  const repo        = payload.repository?.full_name;
  const branch      = workflowRun.head_branch;
  const workflowId  = workflowRun.workflow_id;
  const runId       = workflowRun.id;
  const actor       = workflowRun.triggering_actor?.login || workflowRun.actor?.login || 'unknown';
  const headSha     = workflowRun.head_sha;
  const runUrl      = workflowRun.html_url;
  const workflowName = workflowRun.name;

  // ── 4. Classify severity ──────────────────────────────────────────────────
  const consecutiveFailures = await countConsecutiveFailures(owner, repoName, workflowId, branch);
  const { severity, environment, slaDeadlineMs } = classify(workflowRun, consecutiveFailures);
  const slaLabel = getSlaLabel(severity);

  // ── 5. Fetch error context (best-effort, non-blocking path) ──────────────
  let errorSummary = `Workflow "${workflowName}" failed on branch "${branch}".`;
  try {
    const failedJobs = await getFailedJobs(owner, repoName, runId);
    if (failedJobs.length > 0) {
      const job     = failedJobs[0];
      const failedStep = (job.steps || []).find((s) => s.conclusion === 'failure');
      const logs    = await getJobLogs(owner, repoName, job.id);
      errorSummary = `Job: ${job.name}\nFailed Step: ${failedStep?.name || 'unknown'}\n\n${logs.slice(0, 2000)}`;
    }
  } catch (err) {
    logger.warn('Webhook: failed to fetch error details (non-fatal)', { error: err.message });
  }

  // ── 6. Create Jira incident issue ─────────────────────────────────────────
  let jiraIssue;
  try {
    jiraIssue = await createIncident({
      workflowName,
      repo,
      branch,
      actor,
      workflowRunUrl: runUrl,
      headSha,
      severity,
      environment,
      slaLabel,
      errorSummary,
    });
  } catch (err) {
    logger.error('Webhook: Jira issue creation failed', { error: err.message });
    // Still return 200 to GitHub so it doesn't retry indefinitely
    return { statusCode: 200, body: 'Webhook received; Jira creation failed (check logs)' };
  }

  // ── 7. Persist to Forge Storage ───────────────────────────────────────────
  const incidentRecord = {
    jiraIssueKey:   jiraIssue.key,
    jiraIssueUrl:   jiraIssue.url,
    severity,
    environment,
    slaDeadlineMs,
    workflowName,
    workflowRunUrl: runUrl,
    repo,
    branch,
    actor,
    headSha,
    conclusion:     workflowRun.conclusion,
    githubRunId:    runId,
    githubOwner:    owner,
    githubRepo:     repoName,
  };

  await saveIncident(jiraIssue.key, incidentRecord);

  // ── 8. Send Slack/Teams notification ──────────────────────────────────────
  await notifyNewIncident({
    ...incidentRecord,
    detectedAt: Date.now(),
  });

  logger.info('Webhook: incident pipeline complete', {
    jiraIssueKey: jiraIssue.key,
    severity,
    environment,
  });

  return {
    statusCode: 200,
    body: JSON.stringify({ message: 'Incident created', issueKey: jiraIssue.key }),
  };
}
