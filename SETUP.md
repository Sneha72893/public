# SmartOps Incident Response Automation — User & Setup Guide

**Incident Response Automation** seamlessly connects GitHub Actions workflows with Atlassian Jira Cloud and Confluence Cloud to automate incident triage, SLA escalation tracking, and post-mortem generation.

---

## 1. Installation

1. Log in to your **Jira Cloud** instance as an Administrator.
2. Navigate to **Apps** → **Find new apps** (or visit the [Atlassian Marketplace](https://marketplace.atlassian.com)).
3. Search for **Incident Response Automation** and click **Get it now**.
4. *(Optional)* Install on your **Confluence Cloud** site if you wish to use automated post-mortem document generation.

---

## 2. In-App Configuration (Jira Admin Settings)

Once installed, configure the app directly from your Jira project:

1. Open Jira and go to your project → **Project settings** → **Apps** → **Incident Response Settings** (or Jira Settings → Apps).
2. Configure the following settings:
   * **Jira Project Key:** The key where incident issues should be generated (e.g., `OPS`, `DEV`).
   * **Confluence Space Key:** The space where post-mortems should be published upon incident resolution (e.g., `ENG`, `DOCS`).
   * **Notification Target:** Choose `Slack`, `Microsoft Teams`, or `Both`.
   * **Notification Webhook URLs:** Enter your Incoming Webhook URL(s) for your alerts channel.
   * **Escalation Contacts:** (Optional) Add your Level 1 and Level 2 on-call engineer Account IDs for SLA escalations.
3. Click **Save Settings**.

---

## 3. Connect GitHub Actions (Webhook Setup)

To receive real-time failure alerts from your GitHub Actions workflows:

1. Open your GitHub repository and go to **Settings** → **Webhooks** → **Add webhook**.
2. Fill in the fields:
   * **Payload URL:** Paste your app's Web Trigger URL (displayed in the Jira Admin Settings panel).
   * **Content type:** Select `application/json`.
   * **Secret:** Enter your configured webhook secret string (used for HMAC-SHA256 signature verification).
   * **SSL verification:** Ensure **Enable SSL verification** is checked ✅.
   * **Which events would you like to trigger this webhook?:** Select **"Let me select individual events"** and check **Workflow runs**.
3. Click **Add webhook**. GitHub will send a test ping to confirm connectivity.

---

## 4. How the Incident Lifecycle Works

```
GitHub Actions Workflow Fails
          │
          ▼ (HMAC-256 Webhook)
Forge Cloud Incident Classifier
          │
          ├─────────────────────────┬─────────────────────────┐
          ▼                         ▼                         ▼
Jira Incident Created       Live Issue Panel Widget     Slack / Teams Alert Sent
(Priority & SLA Assigned)   (Run logs & status)         (Immediate on-call ping)
          │
          ▼ (Issue Resolved / Done)
Confluence Post-Mortem Auto-Generated
```

### Incident SLA Matrix
| Severity | Triggered By | SLA Target | Automated Escalation |
|---|---|---|---|
| 🔴 **Critical** | `main` / `production` workflow failure | 1 Hour | Level 1 & Level 2 Alert |
| 🟠 **High** | `staging` / `release` workflow failure | 4 Hours | Level 1 Alert |
| 🟡 **Medium** | `dev` / feature branch failure | 24 Hours | Notification Channel |
| 🟢 **Low** | Other branches / manual runs | 72 Hours | Standard Queue |

---

## 5. Viewing Incidents & Post-Mortems

* **Live Incident Details Panel:** Open any generated Jira incident issue. The custom **Incident Details** panel displays the failed workflow name, commit hash, branch, run duration, and direct link to GitHub Actions.
* **Automated Post-Mortems:** When the incident issue is transitioned to **Done** or **Resolved**, the app automatically compiles the incident timeline and publishes a formatted post-mortem page to your configured Confluence space.

---

## 6. Security & Privacy

* **100% Hosted on Atlassian Cloud:** The app runs entirely within Atlassian's secure Forge serverless infrastructure.
* **Zero External Databases:** All configuration settings and metadata are stored exclusively inside your own Atlassian tenant using encrypted Forge Storage.
* **Cryptographic Verification:** Every incoming webhook is authenticated using HMAC-SHA256 signature checking.
* **Principle of Least Privilege:** Requires minimal Jira and Confluence scopes strictly necessary to create and manage incident records.

---

## 7. Support & Assistance

If you have questions, feedback, or need help with setup:
* **Email Support:** `snehakothawade769@gmail.com`
* **Community:** You can also ask questions through the Atlassian Developer Community.
