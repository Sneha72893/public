/**
 * githubService.js
 * Read-only GitHub REST API interactions.
 * Uses a Personal Access Token with scope: actions:read (read-only).
 *
 * IMPORTANT: This service NEVER triggers or reruns any workflow.
 * It only fetches metadata and log artifacts for documentation purposes.
 */

import api, { fetch } from '@forge/api';
import { logger } from '../utils/logger.js';

const GITHUB_API_BASE = 'https://api.github.com';

/**
 * Build authenticated headers for GitHub API requests.
 *
 * @returns {object}
 */
function githubHeaders() {
  const token = process.env.GITHUB_API_TOKEN;
  return {
    Authorization: `Bearer ${token}`,
    Accept:        'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

/**
 * Fetch detailed metadata about a specific workflow run.
 *
 * @param {string} owner   - GitHub org or user
 * @param {string} repo    - Repository name
 * @param {number} runId   - Workflow run ID
 * @returns {Promise<object>}
 */
export async function getWorkflowRunDetails(owner, repo, runId) {
  const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/actions/runs/${runId}`;

  try {
    const response = await fetch(url, {
      method:  'GET',
      headers: githubHeaders(),
    });

    if (!response.ok) {
      logger.warn('GitHub API: failed to fetch run details', {
        owner, repo, runId, status: response.status,
      });
      return null;
    }

    return await response.json();
  } catch (err) {
    logger.error('GitHub API: unexpected error fetching run details', {
      owner, repo, runId, error: err.message,
    });
    return null;
  }
}

/**
 * Fetch the list of failed jobs in a workflow run.
 *
 * @param {string} owner
 * @param {string} repo
 * @param {number} runId
 * @returns {Promise<Array<{name: string, conclusion: string, steps: Array}>>}
 */
export async function getFailedJobs(owner, repo, runId) {
  const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/actions/runs/${runId}/jobs`;

  try {
    const response = await fetch(url, {
      method:  'GET',
      headers: githubHeaders(),
    });

    if (!response.ok) {
      logger.warn('GitHub API: failed to fetch jobs', {
        owner, repo, runId, status: response.status,
      });
      return [];
    }

    const data = await response.json();
    return (data.jobs || []).filter((job) => job.conclusion === 'failure');
  } catch (err) {
    logger.error('GitHub API: unexpected error fetching jobs', {
      owner, repo, runId, error: err.message,
    });
    return [];
  }
}

/**
 * Fetch the log content for a specific job (truncated to last 5000 chars).
 * GitHub returns a redirect URL for logs; we follow it.
 *
 * @param {string} owner
 * @param {string} repo
 * @param {number} jobId
 * @returns {Promise<string>} Raw log text (last 5000 chars)
 */
export async function getJobLogs(owner, repo, jobId) {
  const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/actions/jobs/${jobId}/logs`;

  try {
    const response = await fetch(url, {
      method:  'GET',
      headers: githubHeaders(),
      redirect: 'follow',
    });

    if (!response.ok) {
      logger.warn('GitHub API: failed to fetch job logs', {
        owner, repo, jobId, status: response.status,
      });
      return '(Logs unavailable)';
    }

    const text = await response.text();
    // Return last 5000 chars to avoid Jira/Confluence content limits
    return text.length > 5000
      ? `...[truncated]\n${text.slice(-5000)}`
      : text;
  } catch (err) {
    logger.error('GitHub API: unexpected error fetching job logs', {
      owner, repo, jobId, error: err.message,
    });
    return '(Logs unavailable)';
  }
}

/**
 * Count consecutive failures for the same workflow on the same branch.
 * Looks at the last 10 runs. Used to potentially escalate severity.
 *
 * @param {string} owner
 * @param {string} repo
 * @param {string} workflowId - Workflow file name or ID
 * @param {string} branch
 * @returns {Promise<number>} Count of consecutive failures (current run inclusive)
 */
export async function countConsecutiveFailures(owner, repo, workflowId, branch) {
  const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/actions/workflows/${workflowId}/runs?branch=${encodeURIComponent(branch)}&per_page=10&status=completed`;

  try {
    const response = await fetch(url, {
      method:  'GET',
      headers: githubHeaders(),
    });

    if (!response.ok) return 1;

    const data = await response.json();
    const runs = data.workflow_runs || [];

    let count = 0;
    for (const run of runs) {
      if (run.conclusion === 'failure') {
        count++;
      } else {
        break; // Stop counting on first non-failure
      }
    }
    return Math.max(count, 1);
  } catch {
    return 1;
  }
}
