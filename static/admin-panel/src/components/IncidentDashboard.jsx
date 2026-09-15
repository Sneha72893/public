/**
 * IncidentDashboard.jsx
 * Live dashboard listing all open/escalated incidents with
 * severity badges, SLA countdown bars, and environment tags.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { safeInvoke as invoke } from '../bridge.js';

const SEVERITY_EMOJI = {
  Critical: '🔴',
  High:     '🟠',
  Medium:   '🟡',
  Low:      '🟢',
};

const ENV_LABEL = {
  production: 'PROD',
  staging:    'STAGING',
  dev:        'DEV',
  unknown:    'UNKNOWN',
};

function SlaBar({ slaDeadlineMs, detectedAt }) {
  const total   = slaDeadlineMs - (detectedAt || (slaDeadlineMs - 3_600_000));
  const elapsed = Date.now() - (detectedAt || Date.now());
  const pct     = Math.min(100, Math.round((elapsed / total) * 100));
  const cls     = pct >= 100 ? 'critical' : pct >= 70 ? 'warning' : 'ok';
  const remaining = Math.max(0, slaDeadlineMs - Date.now());
  const hrs  = Math.floor(remaining / 3_600_000);
  const mins = Math.floor((remaining % 3_600_000) / 60_000);

  return (
    <div className="sla-bar-wrapper">
      <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
        {pct >= 100 ? '⚠ SLA BREACHED' : `SLA: ${hrs}h ${mins}m remaining`}
      </span>
      <div className="sla-bar-track">
        <div
          className={`sla-bar-fill ${cls}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function IncidentCard({ incident }) {
  const envKey    = incident.environment || 'unknown';
  const envLabel  = ENV_LABEL[envKey] || envKey.toUpperCase();
  const detectedAgo = incident.detectedAt
    ? formatAgo(Date.now() - incident.detectedAt)
    : 'Unknown time ago';

  return (
    <div className={`incident-card severity-${incident.severity}`}>
      <div className="incident-sev-dot" />
      <div className="incident-body">
        <div className="incident-title">
          {incident.jiraIssueKey} — {incident.workflowName}
        </div>
        <div className="incident-meta">
          <span>📁 {incident.repo}</span>
          <span>🌿 {incident.branch}</span>
          <span>👤 {incident.actor}</span>
          <span>🕐 {detectedAgo}</span>
        </div>
        <div style={{ marginTop: 8 }}>
          <SlaBar
            slaDeadlineMs={incident.slaDeadlineMs}
            detectedAt={incident.detectedAt}
          />
        </div>
      </div>
      <div className="incident-badges">
        <span className={`badge badge-${incident.severity}`}>
          {SEVERITY_EMOJI[incident.severity]} {incident.severity}
        </span>
        <span className={`badge badge-env-${envKey}`}>{envLabel}</span>
        {incident.status === 'escalated' && (
          <span className="badge badge-escalated">⚡ L{incident.escalationLevel}</span>
        )}
        {incident.status === 'open' && (
          <span className="badge badge-open">● Open</span>
        )}
        {incident.jiraIssueUrl && (
          <a
            href={incident.jiraIssueUrl}
            target="_blank"
            rel="noreferrer"
            className="btn btn-secondary"
            style={{ padding: '4px 10px', fontSize: 11, marginTop: 4 }}
          >
            Open Jira ↗
          </a>
        )}
      </div>
    </div>
  );
}

const MOCK_INCIDENTS = [
  {
    jiraIssueKey: 'INC-101',
    workflowName: 'Production Deploy Pipeline',
    repository: 'acme-corp/api-gateway',
    severity: 'Critical',
    environment: 'production',
    status: 'escalated',
    detectedAt: Date.now() - 45 * 60 * 1000,
    slaDeadlineMs: Date.now() + 15 * 60 * 1000,
    branch: 'main',
    htmlUrl: 'https://github.com/acme-corp/api-gateway/actions/runs/12345678',
  },
  {
    jiraIssueKey: 'INC-102',
    workflowName: 'Staging Integration E2E',
    repository: 'acme-corp/web-frontend',
    severity: 'High',
    environment: 'staging',
    status: 'open',
    detectedAt: Date.now() - 15 * 60 * 1000,
    slaDeadlineMs: Date.now() + 105 * 60 * 1000,
    branch: 'release/v2.4',
    htmlUrl: 'https://github.com/acme-corp/web-frontend/actions/runs/12345679',
  },
  {
    jiraIssueKey: 'INC-103',
    workflowName: 'Nightly Security & Vulnerability Scan',
    repository: 'acme-corp/auth-service',
    severity: 'Medium',
    environment: 'dev',
    status: 'open',
    detectedAt: Date.now() - 70 * 60 * 1000,
    slaDeadlineMs: Date.now() + 170 * 60 * 1000,
    branch: 'develop',
    htmlUrl: 'https://github.com/acme-corp/auth-service/actions/runs/12345680',
  },
];

export default function IncidentDashboard() {
  const [incidents, setIncidents] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke('listOpenIncidents');
      setIncidents(result.incidents || []);
    } catch {
      // Local preview fallback when running outside Forge iframe
      setIncidents(MOCK_INCIDENTS);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 60_000); // refresh every minute
    return () => clearInterval(interval);
  }, [load]);

  const counts = incidents.reduce(
    (acc, inc) => {
      acc.total++;
      acc[inc.severity] = (acc[inc.severity] || 0) + 1;
      return acc;
    },
    { total: 0, Critical: 0, High: 0, Medium: 0, Low: 0 }
  );

  if (loading) return <div className="spinner" />;

  if (error) return (
    <div className="banner banner-error">⚠ {error}</div>
  );

  return (
    <div>
      {/* ── Stats Row ─────────────────────────────────────────────────── */}
      <div className="stats-row">
        <div className="stat-card stat-total">
          <div className="stat-value">{counts.total}</div>
          <div className="stat-label">Total Open</div>
        </div>
        <div className="stat-card stat-critical">
          <div className="stat-value">{counts.Critical}</div>
          <div className="stat-label">🔴 Critical</div>
        </div>
        <div className="stat-card stat-high">
          <div className="stat-value">{counts.High}</div>
          <div className="stat-label">🟠 High</div>
        </div>
        <div className="stat-card stat-medium">
          <div className="stat-value">{counts.Medium}</div>
          <div className="stat-label">🟡 Medium</div>
        </div>
      </div>

      {/* ── Header ────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 className="card-title" style={{ margin: 0 }}>Active Incidents</h2>
        <button className="btn btn-secondary" onClick={load} style={{ padding: '6px 14px' }}>
          🔄 Refresh
        </button>
      </div>

      {/* ── Incident List ─────────────────────────────────────────────── */}
      {incidents.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">✅</div>
          <p>No open incidents. All systems operational.</p>
        </div>
      ) : (
        <div className="incident-list">
          {incidents
            .sort((a, b) => {
              const order = { Critical: 0, High: 1, Medium: 2, Low: 3 };
              return (order[a.severity] ?? 9) - (order[b.severity] ?? 9);
            })
            .map((inc) => (
              <IncidentCard key={inc.jiraIssueKey} incident={inc} />
            ))
          }
        </div>
      )}
    </div>
  );
}

function formatAgo(ms) {
  const s = Math.floor(ms / 1000);
  if (s < 60)   return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60)   return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)   return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
