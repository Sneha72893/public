/**
 * App.jsx — Root component for the Incident Response Automation Custom UI.
 * Renders the tabbed admin panel: Dashboard | Settings
 */

import React, { useState } from 'react';
import IncidentDashboard from './components/IncidentDashboard.jsx';
import SettingsPanel     from './components/SettingsPanel.jsx';

const TABS = [
  { id: 'dashboard', label: '📊 Dashboard' },
  { id: 'settings',  label: '⚙️ Settings'  },
];

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');

  return (
    <div className="app-container">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <header className="app-header">
        <div className="app-header-icon">🚨</div>
        <div>
          <div className="app-header-title">Incident Response Automation</div>
          <div className="app-header-subtitle">
            GitHub Actions · Jira · Confluence · Slack/Teams
          </div>
        </div>
      </header>

      {/* ── Tabs ─────────────────────────────────────────────────────── */}
      <nav className="tabs" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* ── Content ──────────────────────────────────────────────────── */}
      <main role="tabpanel">
        {activeTab === 'dashboard' && <IncidentDashboard />}
        {activeTab === 'settings'  && <SettingsPanel />}
      </main>
    </div>
  );
}
