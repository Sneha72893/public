/**
 * jiraService.js
 * Jira Cloud REST API interactions via Forge's `api` module.
 * Handles: incident issue creation, reassignment,
 * commenting, and field updates.
 */

import api, { route } from '@forge/api';
import {
  JIRA_LABEL_INCIDENT,
  JIRA_LABEL_PREFIX_ENV,
  JIRA_LABEL_PREFIX_SEV,
  JIRA_PRIORITY,
  SEVERITY,
} from '../utils/constants.js';
import { getSettings } from './storageService.js';
import { logger } from '../utils/logger.js';

// ─── Issue Creation ───────────────────────────────────────────────────────────

/**
 * Create a Jira incident issue.
 *
 * @param {object} params
 * @param {string} params.workflowName
 * @param {string} params.repo
 * @param {string} params.branch
 * @param {string} params.actor           - GitHub user who triggered the run
 * @param {string} params.workflowRunUrl  - Direct link to the GitHub Actions run
 * @param {string} params.headSha
 * @param {string} params.severity        - One of SEVERITY constants
 * @param {string} params.environment     - 'production' | 'staging' | 'dev' | 'unknown'
 * @param {string} params.slaLabel        - Human-readable SLA e.g. "1 hour"
 * @param {string} params.errorSummary    - Short error description
 * @returns {Promise<{key: string, id: string, url: string}>}
 */
export async function createIncident(params) {
  const settings = await getSettings();
  const projectKey = settings.jiraProjectKey || process.env.JIRA_PROJECT_KEY || 'OPS';

  const {
    workflowName,
    repo,
    branch,
    actor,
    workflowRunUrl,
    headSha,
    severity,
    environment,
    slaLabel,
    errorSummary = 'No error summary available.',
  } = params;

  const summary = `[${severity.toUpperCase()}] Workflow Failure: ${workflowName} on ${branch}`;

  const description = buildDescription({
    workflowName,
    repo,
    branch,
    actor,
    workflowRunUrl,
    headSha,
    severity,
    environment,
    slaLabel,
    errorSummary,
  });

  const labels = [
    JIRA_LABEL_INCIDENT,
    `${JIRA_LABEL_PREFIX_SEV}${severity.toLowerCase()}`,
    `${JIRA_LABEL_PREFIX_ENV}${environment}`,
    'github-actions',
  ];

  const body = {
    fields: {
      project:   { key: projectKey },
      summary,
      issuetype: { name: 'Bug' },
      priority:  { name: JIRA_PRIORITY[severity] || 'Medium' },
      labels,
      description: {
        type:    'doc',
        version: 1,
        content: description,
      },
    },
  };

  try {
    const response = await api
      .asApp()
      .requestJira(route`/rest/api/3/issue`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });

    const data = await response.json();

    if (!response.ok) {
      logger.error('Jira: failed to create issue', { status: response.status, data });
      throw new Error(`Jira issue creation failed: ${JSON.stringify(data)}`);
    }

    const issueKey = data.key;
    const issueId  = data.id;
    const issueUrl = await buildIssueUrl(issueKey);

    logger.info('Jira incident issue created', { issueKey, severity, environment });
    return { key: issueKey, id: issueId, url: issueUrl };
  } catch (err) {
    logger.error('Jira: createIncident threw', { error: err.message });
    throw err;
  }
}

// ─── Issue Updates ────────────────────────────────────────────────────────────

/**
 * Reassign a Jira issue to a different user.
 *
 * @param {string} issueKey
 * @param {string} accountId - Atlassian account ID of the new assignee
 * @returns {Promise<void>}
 */
export async function reassignIssue(issueKey, accountId) {
  try {
    const response = await api
      .asApp()
      .requestJira(route`/rest/api/3/issue/${issueKey}/assignee`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ accountId }),
      });

    if (!response.ok) {
      const data = await response.json();
      logger.error('Jira: failed to reassign issue', { issueKey, accountId, data });
    } else {
      logger.info('Jira: issue reassigned', { issueKey, accountId });
    }
  } catch (err) {
    logger.error('Jira: reassignIssue threw', { issueKey, error: err.message });
  }
}

/**
 * Add a comment to a Jira issue (Atlassian Document Format).
 *
 * @param {string} issueKey
 * @param {string} text   - Plain text comment body
 * @returns {Promise<void>}
 */
export async function addComment(issueKey, text) {
  const body = {
    body: {
      type:    'doc',
      version: 1,
      content: [
        {
          type:    'paragraph',
          content: [{ type: 'text', text }],
        },
      ],
    },
  };

  try {
    const response = await api
      .asApp()
      .requestJira(route`/rest/api/3/issue/${issueKey}/comment`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });

    if (!response.ok) {
      logger.error('Jira: failed to add comment', { issueKey });
    }
  } catch (err) {
    logger.error('Jira: addComment threw', { issueKey, error: err.message });
  }
}

/**
 * Fetch a Jira issue's current fields (labels, status, assignee, etc.).
 *
 * @param {string} issueKey
 * @returns {Promise<object|null>}
 */
export async function getIssue(issueKey) {
  try {
    const response = await api
      .asApp()
      .requestJira(route`/rest/api/3/issue/${issueKey}?fields=labels,status,assignee,summary,priority`);

    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Resolve the Jira Cloud base URL for generating issue links.
 *
 * @param {string} issueKey
 * @returns {Promise<string>}
 */
async function buildIssueUrl(issueKey) {
  try {
    const response = await api
      .asApp()
      .requestJira(route`/rest/api/3/serverInfo`);
    const info = await response.json();
    return `${info.baseUrl}/browse/${issueKey}`;
  } catch {
    return `https://your-domain.atlassian.net/browse/${issueKey}`;
  }
}

/**
 * Build an Atlassian Document Format (ADF) description body.
 */
function buildDescription({
  workflowName,
  repo,
  branch,
  actor,
  workflowRunUrl,
  headSha,
  severity,
  environment,
  slaLabel,
  errorSummary,
}) {
  const severityEmoji = {
    [SEVERITY.CRITICAL]: '🔴',
    [SEVERITY.HIGH]:     '🟠',
    [SEVERITY.MEDIUM]:   '🟡',
    [SEVERITY.LOW]:      '🟢',
  }[severity] || '⚪';

  return [
    heading(`${severityEmoji} Incident Details`),
    table([
      ['Field',        'Value'],
      ['Severity',     `${severity} ${severityEmoji}`],
      ['Environment',  environment],
      ['SLA Deadline', `${slaLabel} from detection`],
      ['Workflow',     workflowName],
      ['Repository',   repo],
      ['Branch',       branch],
      ['Triggered By', actor],
      ['Commit SHA',   headSha],
      ['Run URL',      workflowRunUrl],
    ]),
    heading('Error Summary'),
    codeBlock(errorSummary, 'text'),
    heading('Resolution Checklist'),
    bulletList([
      '[ ] Acknowledge this incident',
      '[ ] Investigate root cause',
      '[ ] Apply fix and verify',
      '[ ] Update this ticket with resolution notes',
      '[ ] Post-mortem will be auto-generated on resolution',
    ]),
  ];
}

// ─── ADF Mini-DSL Helpers ─────────────────────────────────────────────────────

function heading(text, level = 2) {
  return {
    type:    'heading',
    attrs:   { level },
    content: [{ type: 'text', text }],
  };
}

function codeBlock(text, language = 'text') {
  return {
    type:  'codeBlock',
    attrs: { language },
    content: [{ type: 'text', text }],
  };
}

function table(rows) {
  return {
    type:    'table',
    attrs:   { isNumberColumnEnabled: false, layout: 'default' },
    content: rows.map((row, i) => ({
      type:    'tableRow',
      content: row.map((cell) => ({
        type:    i === 0 ? 'tableHeader' : 'tableCell',
        attrs:   {},
        content: [{ type: 'paragraph', content: [{ type: 'text', text: cell }] }],
      })),
    })),
  };
}

function bulletList(items) {
  return {
    type:    'bulletList',
    content: items.map((item) => ({
      type:    'listItem',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: item }] }],
    })),
  };
}
