/**
 * bridge.js — Safe wrapper around @forge/bridge.
 * Enables both:
 * 1. Live Atlassian Jira Forge execution (via @forge/bridge invoke)
 * 2. Standalone browser preview (fails gracefully to mock data when opened on localhost)
 */

let forgeBridge = null;

export async function safeInvoke(functionKey, payload) {
  // Only attempt Forge bridge if running inside an iframe (Jira container)
  const isInsideIframe = typeof window !== 'undefined' && window.self !== window.top;

  if (isInsideIframe) {
    try {
      if (!forgeBridge) {
        forgeBridge = await import('@forge/bridge');
      }
      return await forgeBridge.invoke(functionKey, payload);
    } catch (e) {
      console.warn('[Forge Bridge] Invocation failed, falling back to preview mode:', e);
      throw e;
    }
  }

  // Not in iframe — immediately throw so caller uses preview/mock data
  throw new Error('Running outside Jira iframe (standalone preview mode)');
}
