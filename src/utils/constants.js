/**
 * constants.js
 * Central configuration: SLA windows, severity mappings,
 * environment patterns, Jira labels, escalation levels.
 */

// ─── Severity Levels ──────────────────────────────────────────────────────────
export const SEVERITY = {
  CRITICAL: 'Critical',
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low',
};

// ─── SLA Windows (milliseconds) ──────────────────────────────────────────────
export const SLA_WINDOWS_MS = {
  [SEVERITY.CRITICAL]: 1 * 60 * 60 * 1000,      // 1 hour
  [SEVERITY.HIGH]:     4 * 60 * 60 * 1000,      // 4 hours
  [SEVERITY.MEDIUM]:   24 * 60 * 60 * 1000,     // 24 hours
  [SEVERITY.LOW]:      72 * 60 * 60 * 1000,     // 72 hours
};

// ─── Jira Issue Priority Mapping ─────────────────────────────────────────────
export const JIRA_PRIORITY = {
  [SEVERITY.CRITICAL]: 'Highest',
  [SEVERITY.HIGH]:     'High',
  [SEVERITY.MEDIUM]:   'Medium',
  [SEVERITY.LOW]:      'Low',
};

// ─── Environment Detection Patterns ──────────────────────────────────────────
// Matched against branch name (case-insensitive)
export const ENV_PATTERNS = {
  production: [/^main$/, /^master$/, /^prod(uction)?$/, /^release(\/|-).+/],
  staging:    [/^staging(-.*)?$/, /^stage(-.*)?$/, /^uat(-.*)?$/, /^pre-?prod(-.*)?$/],
  dev:        [/^dev(elop(ment)?)?$/, /^develop.*$/, /^feature\/.+/, /^hotfix\/.+/, /^test.*$/],
};

// ─── Severity by Environment ──────────────────────────────────────────────────
export const ENV_TO_SEVERITY = {
  production: SEVERITY.CRITICAL,
  staging:    SEVERITY.HIGH,
  dev:        SEVERITY.MEDIUM,
  unknown:    SEVERITY.LOW,
};

// ─── Jira Labels ─────────────────────────────────────────────────────────────
export const JIRA_LABEL_INCIDENT = 'Incident';
export const JIRA_LABEL_PREFIX_ENV = 'env:';
export const JIRA_LABEL_PREFIX_SEV = 'severity:';

// ─── Escalation Configuration ────────────────────────────────────────────────
export const ESCALATION_LEVELS = {
  NONE:      0,  // Not yet escalated
  SENIOR:    1,  // Escalated to senior engineer
  MANAGER:   2,  // Escalated to manager
  MAX:       2,  // No further escalation beyond this
};

// ─── Storage Key Prefixes ─────────────────────────────────────────────────────
export const STORAGE_PREFIX = {
  INCIDENT:  'incident_',   // incident_<jiraIssueKey>
  SETTINGS:  'settings_',  // settings_app
};
export const SETTINGS_KEY = 'settings_app';

// ─── Confluence Post-Mortem ───────────────────────────────────────────────────
export const POSTMORTEM_PARENT_TITLE = 'Incident Post-Mortems';
export const POSTMORTEM_LABEL = 'incident-postmortem';

// ─── Notification Targets ─────────────────────────────────────────────────────
export const NOTIFICATION_TARGET = {
  SLACK:  'slack',
  TEAMS:  'teams',
  BOTH:   'both',
};

// ─── GitHub Webhook Event Types ───────────────────────────────────────────────
export const GITHUB_EVENT_WORKFLOW_RUN = 'workflow_run';
export const GITHUB_CONCLUSION_FAILURE = 'failure';
export const GITHUB_CONCLUSION_SUCCESS = 'success';

// ─── Incident Statuses ───────────────────────────────────────────────────────
export const INCIDENT_STATUS = {
  OPEN:      'open',
  ESCALATED: 'escalated',
  RESOLVED:  'resolved',
};
