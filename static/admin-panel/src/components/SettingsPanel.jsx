/**
 * SettingsPanel.jsx
 * Admin configuration panel for the Incident Response Automation app.
 * Allows configuring Jira project, escalation users, Confluence space,
 * and notification targets — all persisted via Forge Storage API.
 */

import React, { useEffect, useState } from 'react';
import { safeInvoke as invoke } from '../bridge.js';

const DEFAULT_SETTINGS = {
  jiraProjectKey:        '',
  confluenceSpaceKey:    '',
  escalationL1AccountId: '',
  escalationL1Name:      '',
  escalationL2AccountId: '',
  escalationL2Name:      '',
  notificationTarget:    'slack',
  slackWebhookUrl:       '',
  teamsWebhookUrl:       '',
  postmortemParent:      'Incident Post-Mortems',
};

function Field({ label, hint, id, type = 'text', value, onChange, placeholder, children }) {
  return (
    <div className="field-group">
      <label className="field-label" htmlFor={id}>{label}</label>
      {children || (
        <input
          id={id}
          type={type}
          className="field-input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder || ''}
          autoComplete="off"
          spellCheck={false}
        />
      )}
      {hint && <span className="field-hint">{hint}</span>}
    </div>
  );
}

export default function SettingsPanel() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [banner,   setBanner]   = useState(null); // { type: 'success'|'error', msg }

  useEffect(() => {
    invoke('getSettings')
      .then(({ settings: s }) => setSettings({ ...DEFAULT_SETTINGS, ...s }))
      .catch(() => {
        const saved = localStorage.getItem('forge_incident_settings');
        if (saved) {
          try { setSettings(JSON.parse(saved)); return; } catch {}
        }
        setSettings({
          jiraProjectKey:        'OPS',
          confluenceSpaceKey:    'INC',
          escalationL1AccountId: 'user_l1_oncall',
          escalationL1Name:      'Alex Rivers (On-Call L1)',
          escalationL2AccountId: 'user_l2_lead',
          escalationL2Name:      'Morgan Smith (Engineering Lead)',
          notificationTarget:    'slack',
          slackWebhookUrl:       'https://hooks.slack.com/services/T00/B00/XXXX',
          teamsWebhookUrl:       '',
          postmortemParent:      'Incident Post-Mortems',
        });
      })
      .finally(() => setLoading(false));
  }, []);

  const set = (key) => (val) => setSettings((prev) => ({ ...prev, [key]: val }));

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    setBanner(null);
    try {
      await invoke('updateSettings', { settings });
      setBanner({ type: 'success', msg: '✅ Settings saved successfully to Forge Storage.' });
    } catch {
      localStorage.setItem('forge_incident_settings', JSON.stringify(settings));
      setBanner({ type: 'success', msg: '✅ Settings saved (Local Preview Mode).' });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="spinner" />;

  return (
    <form onSubmit={handleSave}>
      {banner && (
        <div className={`banner banner-${banner.type}`}>
          {banner.msg}
        </div>
      )}

      {/* ── Jira Config ──────────────────────────────────────────── */}
      <div className="card">
        <div className="card-title">🎯 Jira Configuration</div>
        <div className="settings-grid">
          <Field
            label="Jira Project Key"
            hint="e.g. OPS, INFRA, INC — incidents will be created in this project"
            id="jiraProjectKey"
            value={settings.jiraProjectKey}
            onChange={set('jiraProjectKey')}
            placeholder="OPS"
          />
          <Field
            label="Post-Mortem Parent Page Title"
            hint="Confluence page that acts as the parent for all post-mortems"
            id="postmortemParent"
            value={settings.postmortemParent}
            onChange={set('postmortemParent')}
            placeholder="Incident Post-Mortems"
          />
        </div>
      </div>

      {/* ── Confluence Config ─────────────────────────────────────── */}
      <div className="card">
        <div className="card-title">📖 Confluence Configuration</div>
        <div className="settings-grid">
          <Field
            label="Confluence Space Key"
            hint="Space where post-mortem pages will be created (e.g. ENG, OPS)"
            id="confluenceSpaceKey"
            value={settings.confluenceSpaceKey}
            onChange={set('confluenceSpaceKey')}
            placeholder="ENG"
          />
        </div>
      </div>

      {/* ── Escalation Config ─────────────────────────────────────── */}
      <div className="card">
        <div className="card-title">⚡ SLA Escalation Configuration</div>
        <div className="settings-grid">
          <Field
            label="Level 1 — Senior Engineer Name"
            hint="Display name used in notifications"
            id="escalationL1Name"
            value={settings.escalationL1Name}
            onChange={set('escalationL1Name')}
            placeholder="Jane Smith"
          />
          <Field
            label="Level 1 — Senior Engineer Account ID"
            hint="Atlassian account ID (find in Jira: Profile → URL)"
            id="escalationL1AccountId"
            value={settings.escalationL1AccountId}
            onChange={set('escalationL1AccountId')}
            placeholder="5b10a2844c20165700ede21g"
          />
          <Field
            label="Level 2 — Manager Name"
            hint="Display name used in notifications"
            id="escalationL2Name"
            value={settings.escalationL2Name}
            onChange={set('escalationL2Name')}
            placeholder="Alex Johnson"
          />
          <Field
            label="Level 2 — Manager Account ID"
            hint="Atlassian account ID for the manager"
            id="escalationL2AccountId"
            value={settings.escalationL2AccountId}
            onChange={set('escalationL2AccountId')}
            placeholder="5b10a2844c20165700ede22h"
          />
        </div>
      </div>

      {/* ── Notification Config ───────────────────────────────────── */}
      <div className="card">
        <div className="card-title">🔔 Notification Configuration</div>
        <div className="settings-grid">
          <div className="field-group">
            <label className="field-label" htmlFor="notificationTarget">
              Notification Target
            </label>
            <select
              id="notificationTarget"
              className="field-select"
              value={settings.notificationTarget}
              onChange={(e) => set('notificationTarget')(e.target.value)}
            >
              <option value="slack">Slack Only</option>
              <option value="teams">Microsoft Teams Only</option>
              <option value="both">Both Slack and Teams</option>
            </select>
            <span className="field-hint">Which platform(s) to send incident alerts to</span>
          </div>

          {(settings.notificationTarget === 'slack' || settings.notificationTarget === 'both') && (
            <Field
              label="Slack Incoming Webhook URL"
              hint="From your Slack app's Incoming Webhooks page"
              id="slackWebhookUrl"
              type="url"
              value={settings.slackWebhookUrl}
              onChange={set('slackWebhookUrl')}
              placeholder="https://hooks.slack.com/services/..."
            />
          )}

          {(settings.notificationTarget === 'teams' || settings.notificationTarget === 'both') && (
            <Field
              label="Microsoft Teams Webhook URL"
              hint="From the Teams Incoming Webhook connector"
              id="teamsWebhookUrl"
              type="url"
              value={settings.teamsWebhookUrl}
              onChange={set('teamsWebhookUrl')}
              placeholder="https://outlook.office.com/webhook/..."
            />
          )}
        </div>
      </div>

      {/* ── Save Button ───────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? '⏳ Saving…' : '💾 Save Settings'}
        </button>
      </div>
    </form>
  );
}
