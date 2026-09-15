# Incident Response Automation — Setup Guide

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| Node.js | ≥ 24.x | https://nodejs.org |
| Forge CLI | Latest | `npm install -g @forge/cli@latest` |
| Atlassian Account | Cloud | https://id.atlassian.com |
| GitHub Account | Any | https://github.com |

---

## Step 1 — Install Dependencies

```powershell
# Forge app backend
cd forge-incident-response
npm install

# Custom UI frontend
cd static/admin-panel
npm install
cd ../..
```

---

## Step 2 — Log In to Forge

```bash
forge login
# Follow the browser-based OAuth flow
```

---

## Step 3 — Create the App (first time only)

> Skip this step if you already have an app ID in `manifest.yml`.

```bash
forge register
# This assigns a unique App ID to manifest.yml
```

---

## Step 4 — Set Environment Variables (Secrets)

Use `forge variables set` to configure all secrets. These are **encrypted at rest** and never appear in your code.

```bash
# GitHub webhook secret (generate any random string)
forge variables set --environment production GITHUB_WEBHOOK_SECRET "your-random-secret-here"

# GitHub Personal Access Token — create at:
# https://github.com/settings/tokens/new
# Required scope: actions:read (read-only)
forge variables set --environment production GITHUB_API_TOKEN "ghp_xxxxxxxxxxxx"

# Slack Incoming Webhook URL (optional)
# Create at: https://api.slack.com/apps → Incoming Webhooks
forge variables set --environment production SLACK_WEBHOOK_URL "https://hooks.slack.com/services/..."

# Microsoft Teams Incoming Webhook URL (optional)
# Create via: Teams channel → Connectors → Incoming Webhook
forge variables set --environment production TEAMS_WEBHOOK_URL "https://outlook.office.com/webhook/..."

# Which platform to notify: slack | teams | both
forge variables set --environment production NOTIFICATION_TARGET "slack"
```

> **Tip:** After setting variables, run `forge variables list` to confirm.

---

## Step 5 — Deploy the App

```bash
forge deploy --environment production
```

After deployment, you'll see:

```
✓ Deployed incident-response-automation to production
  Web Trigger URL:
    https://webhook.forge.atlassian.com/2/call/xxxxxxxx/github-webhook-receiver
```

**Copy this Web Trigger URL** — you need it for the next step.

---

## Step 6 — Install the App on Your Jira/Confluence Site

```bash
forge install
# Select: Jira Software
# Enter your Atlassian site URL: https://your-domain.atlassian.net
```

Repeat for Confluence if you want post-mortems:

```bash
forge install
# Select: Confluence
# Enter your Atlassian site URL: https://your-domain.atlassian.net
```

---

## Step 7 — Configure GitHub Webhook

1. Go to your GitHub repository → **Settings** → **Webhooks** → **Add webhook**
2. Fill in:
   - **Payload URL**: Paste the Web Trigger URL from Step 5
   - **Content type**: `application/json`
   - **Secret**: The same value you used for `GITHUB_WEBHOOK_SECRET`
   - **SSL verification**: Enabled ✅
   - **Which events?**: Select **"Let me select individual events"**
     - ✅ **Workflow runs**
3. Click **Add webhook**
4. GitHub will send a `ping` event — check Forge logs to confirm receipt:

```bash
forge logs --environment production
```

---

## Step 8 — Configure App Settings (Admin UI)

1. Open any Jira project → **Project settings** → **Apps** → **Incident Response Automation**
2. In the **Settings** tab, configure:
   - **Jira Project Key** (e.g., `OPS`)
   - **Confluence Space Key** (e.g., `ENG`)
   - **Level 1 Escalation** (Senior engineer name + Atlassian Account ID)
   - **Level 2 Escalation** (Manager name + Atlassian Account ID)
   - **Notification Target** + Webhook URLs

> **Finding an Atlassian Account ID:**
> Go to `https://your-domain.atlassian.net/rest/api/3/user/search?query=<email>`
> The `accountId` field in the JSON response is what you need.

---

## Step 9 — Test the Integration

### Option A: Trigger a real GitHub Actions failure
Push a breaking change to a branch and watch:
1. Jira issue created automatically
2. Slack/Teams notification sent
3. Resolve the Jira issue → Confluence page auto-generated

### Option B: Send a simulated webhook (for testing)

```powershell
# Compute HMAC-256 signature
$secret = "your-random-secret-here"
$body = Get-Content test/fixtures/workflow_run_failure.json -Raw
$hmac = [System.Security.Cryptography.HMACSHA256]::new([System.Text.Encoding]::UTF8.GetBytes($secret))
$hash = [System.BitConverter]::ToString($hmac.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($body))).Replace("-","").ToLower()
$sig = "sha256=$hash"

# Send the webhook
Invoke-WebRequest `
  -Uri "https://webhook.forge.atlassian.com/2/call/YOUR_TRIGGER_ID/github-webhook-receiver" `
  -Method POST `
  -ContentType "application/json" `
  -Headers @{ "X-Hub-Signature-256" = $sig; "X-GitHub-Event" = "workflow_run" } `
  -Body $body
```

---

## Step 10 — Monitor

```bash
# View real-time logs
forge logs --environment production --tail

# Check deployed functions
forge list
```

---

## SLA Reference

| Severity | Environment | SLA Window |
|---|---|---|
| 🔴 Critical | production/main | 1 hour |
| 🟠 High | staging/release | 4 hours |
| 🟡 Medium | dev/feature | 24 hours |
| 🟢 Low | Other branches | 72 hours |

---

## Architecture Summary

```
GitHub Actions (workflow failure)
    │  POST /webhook [HMAC-256 signed]
    ▼
Forge Web Trigger (Forge Cloud)
    │  Verify signature → classify → create Jira → notify
    ▼
Forge Storage API (SLA metadata)
    │  Polled every 5 min by scheduledTrigger
    ▼
Jira Issue Transition Event (Done/Resolved)
    │  Auto-generate Confluence post-mortem
    ▼
Slack / Teams (notifications at each stage)
```

**Security guarantees:**
- ✅ HMAC-256 signature verification on all webhook events
- ✅ Read-only GitHub API access (scope: `actions:read` only)
- ✅ No workflow reruns — detection and documentation only
- ✅ All secrets stored as encrypted Forge environment variables
- ✅ Forge runs on Atlassian infrastructure (no external servers needed)

---

## Troubleshooting

| Issue | Fix |
|---|---|
| Webhook returns 401 | Check `GITHUB_WEBHOOK_SECRET` matches GitHub webhook secret |
| Jira issue not created | Check `JIRA_PROJECT_KEY` or use Admin UI to set project |
| SLA not escalating | Verify `ESCALATION_L1_ACCOUNT_ID` is set in Admin UI |
| Confluence page missing | Verify `CONFLUENCE_SPACE_KEY` and app is installed on Confluence |
| No Slack notification | Check `SLACK_WEBHOOK_URL` is a valid Incoming Webhook URL |
| Forge logs show timeout | GitHub API token may be invalid — check `GITHUB_API_TOKEN` |
