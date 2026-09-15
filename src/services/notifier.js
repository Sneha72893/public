/**
 * notifier.js
 * Sends real-time incident notifications to Slack and/or Microsoft Teams
 * using Incoming Webhooks.
 *
 * Slack:  Block Kit message format
 * Teams:  Adaptive Card via Incoming Webhook
 */

import { fetch } from '@forge/api';
import { NOTIFICATION_TARGET, SEVERITY } from '../utils/constants.js';
import { getSettings } from './storageService.js';
import { logger } from '../utils/logger.js';

// ─── Severity Visual Helpers ──────────────────────────────────────────────────

const SEVERITY_EMOJI = {
  [SEVERITY.CRITICAL]: '🔴',
  [SEVERITY.HIGH]:     '🟠',
  [SEVERITY.MEDIUM]:   '🟡',
  [SEVERITY.LOW]:      '🟢',
};

const SEVERITY_COLOR = {
  [SEVERITY.CRITICAL]: '#D04437',  // Red
  [SEVERITY.HIGH]:     '#F79232',  // Orange
  [SEVERITY.MEDIUM]:   '#F6C342',  // Yellow
  [SEVERITY.LOW]:      '#14892C',  // Green
};

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Notify about a new incident.
 *
 * @param {object} incident - Full incident record from storageService
 */
export async function notifyNewIncident(incident) {
  const { target, slackUrl, teamsUrl } = await getTargetConfig();

  const slackPayload = buildSlackNewIncident(incident);
  const teamsPayload = buildTeamsNewIncident(incident);

  await dispatch(target, slackUrl, teamsUrl, slackPayload, teamsPayload, 'new-incident');
}

/**
 * Notify about an SLA escalation.
 *
 * @param {object} incident        - Full incident record
 * @param {number} escalationLevel - New escalation level (1 or 2)
 * @param {string} assigneeName    - Display name of new assignee
 */
export async function notifyEscalation(incident, escalationLevel, assigneeName) {
  const { target, slackUrl, teamsUrl } = await getTargetConfig();

  const slackPayload = buildSlackEscalation(incident, escalationLevel, assigneeName);
  const teamsPayload = buildTeamsEscalation(incident, escalationLevel, assigneeName);

  await dispatch(target, slackUrl, teamsUrl, slackPayload, teamsPayload, 'escalation');
}

/**
 * Notify about incident resolution.
 *
 * @param {object} incident        - Full incident record
 * @param {string} confluenceUrl   - Link to the generated post-mortem page
 */
export async function notifyResolution(incident, confluenceUrl) {
  const { target, slackUrl, teamsUrl } = await getTargetConfig();

  const slackPayload = buildSlackResolution(incident, confluenceUrl);
  const teamsPayload = buildTeamsResolution(incident, confluenceUrl);

  await dispatch(target, slackUrl, teamsUrl, slackPayload, teamsPayload, 'resolution');
}

// ─── Slack Block Kit Builders ─────────────────────────────────────────────────

function buildSlackNewIncident(incident) {
  const emoji  = SEVERITY_EMOJI[incident.severity] || '⚪';
  const color  = SEVERITY_COLOR[incident.severity] || '#888888';
  const slaTs  = new Date(incident.slaDeadlineMs).toISOString();

  return {
    attachments: [{
      color,
      blocks: [
        { type: 'header', text: { type: 'plain_text', text: `${emoji} New Incident Detected`, emoji: true } },
        { type: 'divider' },
        {
          type:   'section',
          fields: [
            mdField('*Severity*',     `${emoji} ${incident.severity}`),
            mdField('*Environment*',  incident.environment),
            mdField('*Workflow*',     incident.workflowName),
            mdField('*Repository*',   incident.repo),
            mdField('*Branch*',       incident.branch),
            mdField('*Triggered By*', incident.actor),
          ],
        },
        {
          type: 'section',
          fields: [
            mdField('*SLA Deadline*', `<!date^${Math.floor(incident.slaDeadlineMs / 1000)}^{date_short_pretty} at {time}|${slaTs}>`),
            mdField('*Jira Issue*',   `<${incident.jiraIssueUrl}|${incident.jiraIssueKey}>`),
          ],
        },
        {
          type:     'actions',
          elements: [
            btnLink('View GitHub Run',  incident.workflowRunUrl),
            btnLink('Open Jira Issue',  incident.jiraIssueUrl),
          ],
        },
        { type: 'divider' },
        { type: 'context', elements: [{ type: 'mrkdwn', text: `Commit: \`${incident.headSha?.slice(0, 7)}\` • Detected at ${new Date(incident.detectedAt).toISOString()}` }] },
      ],
    }],
  };
}

function buildSlackEscalation(incident, level, assigneeName) {
  const emoji = SEVERITY_EMOJI[incident.severity] || '⚪';
  const label = level === 1 ? '⚡ Escalated to Senior Engineer' : '🚨 Escalated to Manager';

  return {
    attachments: [{
      color: '#D04437',
      blocks: [
        { type: 'header', text: { type: 'plain_text', text: label, emoji: true } },
        { type: 'divider' },
        {
          type: 'section',
          text: { type: 'mrkdwn', text: `SLA breach detected for *<${incident.jiraIssueUrl}|${incident.jiraIssueKey}>*. Reassigned to *${assigneeName}*.` },
        },
        {
          type:   'section',
          fields: [
            mdField('*Severity*',    `${emoji} ${incident.severity}`),
            mdField('*Environment*', incident.environment),
            mdField('*Workflow*',    incident.workflowName),
            mdField('*SLA Breached*', new Date(incident.slaDeadlineMs).toISOString()),
          ],
        },
        { type: 'actions', elements: [btnLink('Open Jira Issue', incident.jiraIssueUrl)] },
      ],
    }],
  };
}

function buildSlackResolution(incident, confluenceUrl) {
  const duration = incident.resolvedAt
    ? formatDuration(incident.resolvedAt - incident.detectedAt)
    : 'Unknown';

  return {
    attachments: [{
      color: '#14892C',
      blocks: [
        { type: 'header', text: { type: 'plain_text', text: '✅ Incident Resolved', emoji: true } },
        { type: 'divider' },
        {
          type:   'section',
          fields: [
            mdField('*Incident*',    `<${incident.jiraIssueUrl}|${incident.jiraIssueKey}>`),
            mdField('*Severity*',    incident.severity),
            mdField('*Environment*', incident.environment),
            mdField('*Duration*',    duration),
          ],
        },
        {
          type:     'actions',
          elements: [
            btnLink('View Post-Mortem', confluenceUrl),
            btnLink('View Jira Issue',  incident.jiraIssueUrl),
          ],
        },
      ],
    }],
  };
}

// ─── Microsoft Teams Adaptive Card Builders ───────────────────────────────────

function buildTeamsNewIncident(incident) {
  const emoji = SEVERITY_EMOJI[incident.severity] || '⚪';
  const color = teamsColor(incident.severity);

  return {
    type:        'message',
    attachments: [{
      contentType: 'application/vnd.microsoft.card.adaptive',
      content:     {
        $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
        type:    'AdaptiveCard',
        version: '1.4',
        body: [
          { type: 'TextBlock', text: `${emoji} New Incident Detected`, weight: 'Bolder', size: 'Large', color },
          { type: 'FactSet', facts: teamsFactSet(incident) },
          {
            type:    'ActionSet',
            actions: [
              teamsLink('View GitHub Run', incident.workflowRunUrl),
              teamsLink('Open Jira Issue', incident.jiraIssueUrl),
            ],
          },
        ],
      },
    }],
  };
}

function buildTeamsEscalation(incident, level, assigneeName) {
  const label = level === 1 ? '⚡ SLA Escalation — Senior Engineer' : '🚨 SLA Escalation — Manager';

  return {
    type:        'message',
    attachments: [{
      contentType: 'application/vnd.microsoft.card.adaptive',
      content:     {
        $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
        type:    'AdaptiveCard',
        version: '1.4',
        body: [
          { type: 'TextBlock', text: label, weight: 'Bolder', size: 'Large', color: 'Attention' },
          { type: 'TextBlock', text: `Reassigned to **${assigneeName}**`, wrap: true },
          {
            type: 'FactSet',
            facts: [
              { title: 'Issue',       value: incident.jiraIssueKey },
              { title: 'Severity',    value: incident.severity },
              { title: 'Environment', value: incident.environment },
              { title: 'SLA Missed',  value: new Date(incident.slaDeadlineMs).toISOString() },
            ],
          },
          { type: 'ActionSet', actions: [teamsLink('Open Jira Issue', incident.jiraIssueUrl)] },
        ],
      },
    }],
  };
}

function buildTeamsResolution(incident, confluenceUrl) {
  const duration = incident.resolvedAt
    ? formatDuration(incident.resolvedAt - incident.detectedAt)
    : 'Unknown';

  return {
    type:        'message',
    attachments: [{
      contentType: 'application/vnd.microsoft.card.adaptive',
      content:     {
        $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
        type:    'AdaptiveCard',
        version: '1.4',
        body: [
          { type: 'TextBlock', text: '✅ Incident Resolved', weight: 'Bolder', size: 'Large', color: 'Good' },
          {
            type: 'FactSet',
            facts: [
              { title: 'Issue',       value: incident.jiraIssueKey },
              { title: 'Severity',    value: incident.severity },
              { title: 'Environment', value: incident.environment },
              { title: 'Duration',    value: duration },
            ],
          },
          {
            type:    'ActionSet',
            actions: [
              teamsLink('View Post-Mortem', confluenceUrl),
              teamsLink('View Jira Issue',  incident.jiraIssueUrl),
            ],
          },
        ],
      },
    }],
  };
}

// ─── Dispatch ─────────────────────────────────────────────────────────────────

async function dispatch(target, slackUrl, teamsUrl, slackPayload, teamsPayload, label) {
  const tasks = [];

  if ((target === NOTIFICATION_TARGET.SLACK || target === NOTIFICATION_TARGET.BOTH) && slackUrl) {
    tasks.push(postWebhook(slackUrl, slackPayload, `Slack [${label}]`));
  }

  if ((target === NOTIFICATION_TARGET.TEAMS || target === NOTIFICATION_TARGET.BOTH) && teamsUrl) {
    tasks.push(postWebhook(teamsUrl, teamsPayload, `Teams [${label}]`));
  }

  if (tasks.length === 0) {
    logger.warn('No notification targets configured', { label });
  }

  await Promise.allSettled(tasks);
}

async function postWebhook(url, payload, label) {
  try {
    const response = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });
    if (!response.ok) {
      logger.warn(`${label}: webhook call failed`, { status: response.status });
    } else {
      logger.info(`${label}: notification sent`);
    }
  } catch (err) {
    logger.error(`${label}: fetch threw`, { error: err.message });
  }
}

async function getTargetConfig() {
  const settings = await getSettings();
  return {
    target:   settings.notificationTarget || process.env.NOTIFICATION_TARGET || NOTIFICATION_TARGET.SLACK,
    slackUrl: settings.slackWebhookUrl    || process.env.SLACK_WEBHOOK_URL,
    teamsUrl: settings.teamsWebhookUrl    || process.env.TEAMS_WEBHOOK_URL,
  };
}

// ─── Formatting Helpers ───────────────────────────────────────────────────────

function mdField(title, value) {
  return { type: 'mrkdwn', text: `${title}\n${value}` };
}

function btnLink(text, url) {
  return { type: 'button', text: { type: 'plain_text', text }, url };
}

function teamsLink(text, url) {
  return { type: 'Action.OpenUrl', title: text, url };
}

function teamsFactSet(incident) {
  return [
    { title: 'Severity',    value: `${SEVERITY_EMOJI[incident.severity]} ${incident.severity}` },
    { title: 'Environment', value: incident.environment },
    { title: 'Workflow',    value: incident.workflowName },
    { title: 'Repository',  value: incident.repo },
    { title: 'Branch',      value: incident.branch },
    { title: 'SLA Deadline', value: new Date(incident.slaDeadlineMs).toISOString() },
    { title: 'Jira Issue',  value: incident.jiraIssueKey },
  ];
}

function teamsColor(severity) {
  return {
    [SEVERITY.CRITICAL]: 'Attention',
    [SEVERITY.HIGH]:     'Warning',
    [SEVERITY.MEDIUM]:   'Warning',
    [SEVERITY.LOW]:      'Good',
  }[severity] || 'Default';
}

function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const h  = Math.floor(totalSeconds / 3600);
  const m  = Math.floor((totalSeconds % 3600) / 60);
  const s  = totalSeconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
