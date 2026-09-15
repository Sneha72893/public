/**
 * index.js — Main Forge app entry point.
 * Exports all function handlers declared in manifest.yml.
 *
 * Each export name must exactly match the `handler` field
 * in the manifest functions section (e.g. "index.handleGithubWebhook").
 */

import Resolver from '@forge/resolver';

import { handleGithubWebhook as _handleGithubWebhook } from './handlers/webhookHandler.js';
import { runSlaMonitor        as _runSlaMonitor        } from './handlers/slaMonitor.js';
import { handleResolution     as _handleResolution     } from './handlers/resolutionHandler.js';
import { listOpenIncidents, getSettings, updateSettings } from './services/storageService.js';
import { logger } from './utils/logger.js';

// ─── Web Trigger ──────────────────────────────────────────────────────────────
// Receives GitHub workflow_run webhook events
export async function handleGithubWebhook(event, context) {
  return _handleGithubWebhook(event, context);
}

// ─── Scheduled Trigger ───────────────────────────────────────────────────────
// Runs every 5 minutes to check SLA deadlines
export async function runSlaMonitor(event, context) {
  return _runSlaMonitor(event, context);
}

// ─── Jira Issue Transition Event ─────────────────────────────────────────────
// Fires when a Jira issue transitions to Done/Resolved
export async function handleResolution(event, context) {
  return _handleResolution(event, context);
}

// ─── Custom UI: Incident Issue Panel Resolver ────────────────────────────────
// Bridges UI ↔ backend for the incident issue panel
const incidentPanelResolverInstance = new Resolver();

incidentPanelResolverInstance.define('getIncidentByIssueKey', async ({ payload, context }) => {
  const { issueKey } = payload;
  const { getIncident } = await import('./services/storageService.js');
  const incident = await getIncident(issueKey);
  return { incident };
});

export const incidentPanelResolver = incidentPanelResolverInstance.getDefinitions();

// ─── Custom UI: Admin Settings Page Resolver ─────────────────────────────────
// Bridges UI ↔ backend for admin settings
const adminPanelResolverInstance = new Resolver();

adminPanelResolverInstance.define('getSettings', async ({ payload, context }) => {
  const settings = await getSettings();
  return { settings };
});

adminPanelResolverInstance.define('updateSettings', async ({ payload, context }) => {
  const updated = await updateSettings(payload.settings);
  return { settings: updated };
});

adminPanelResolverInstance.define('listOpenIncidents', async ({ payload, context }) => {
  const incidents = await listOpenIncidents();
  return { incidents };
});

export const adminPanelResolver = adminPanelResolverInstance.getDefinitions();
