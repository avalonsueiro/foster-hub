// Enrich stage: deterministic lookups only, no model decisions. Fetches
// each org's homepage (when it has a website) and regex-extracts a contact
// email plus capability keywords. Opt-in only — never called by default
// from the hot search path.

const FETCH_TIMEOUT_MS = 5000;
const MAX_BODY_BYTES = 200 * 1024; // 200KB
const DEFAULT_CONCURRENCY_LIMIT = 8;

const CAPABILITY_KEYWORDS = [
  'foster',
  'adopt',
  'spay',
  'neuter',
  'surrender',
  'transfer',
  'volunteer',
  'low-cost',
  'wildlife',
];

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

async function fetchCappedBody(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'dog-agentic-search/0.1 (hackathon project)' },
    });
    if (!res.ok || !res.body) {
      // Some environments don't support streaming bodies; fall back to text.
      const text = await res.text();
      return text.slice(0, MAX_BODY_BYTES);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let received = 0;
    let text = '';
    while (received < MAX_BODY_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      text += decoder.decode(value, { stream: true });
    }
    try {
      await reader.cancel();
    } catch {
      // ignore
    }
    return text.slice(0, MAX_BODY_BYTES);
  } finally {
    clearTimeout(timer);
  }
}

async function enrichOne(org) {
  if (!org.website) {
    return org;
  }

  try {
    const body = await fetchCappedBody(org.website, FETCH_TIMEOUT_MS);
    const emailMatch = body.match(EMAIL_REGEX);
    const lower = body.toLowerCase();
    const capabilities = CAPABILITY_KEYWORDS.filter((kw) => lower.includes(kw));

    return {
      ...org,
      enrichment: {
        email: emailMatch ? emailMatch[0] : null,
        capabilities,
        fetchedAt: new Date().toISOString(),
      },
      capabilities: Array.from(new Set([...(org.capabilities || []), ...capabilities])),
    };
  } catch {
    return { ...org, enrichment: null };
  }
}

// Runs enrichment for up to `limit` orgs concurrently, politely (a simple
// worker-pool pattern rather than Promise.all over everything at once).
export async function enrichOrganizations(orgs, { limit = DEFAULT_CONCURRENCY_LIMIT } = {}) {
  const results = new Array(orgs.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < orgs.length) {
      const i = nextIndex++;
      results[i] = await enrichOne(orgs[i]);
    }
  }

  const workerCount = Math.max(1, Math.min(limit, orgs.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return results;
}
