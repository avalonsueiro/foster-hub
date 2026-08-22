const DEFAULT_ERROR = 'Something went wrong talking to the search service.';

/**
 * Calls POST /api/search with the given params and returns the parsed JSON.
 * Throws an Error with a useful message on non-2xx responses or network failure.
 */
export async function searchOrganizations({
  location,
  radiusMiles,
  kinds,
  enrich,
  includeSynthetic,
}) {
  let response;
  try {
    response = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        location,
        radiusMiles,
        kinds,
        enrich,
        includeSynthetic,
      }),
    });
  } catch (networkError) {
    throw new Error(
      `Could not reach the search service. Check that the backend is running and try again. (${networkError.message})`
    );
  }

  let body = null;
  const text = await response.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      // fall through, body stays null
    }
  }

  if (!response.ok) {
    const message =
      (body && (body.error || body.message)) ||
      `Search failed with status ${response.status}.`;
    throw new Error(message);
  }

  if (!body) {
    throw new Error(DEFAULT_ERROR);
  }

  return body;
}

/**
 * Calls GET /api/health. Returns true if the backend reports healthy,
 * false otherwise (including on network failure). Never throws.
 */
export async function checkHealth() {
  try {
    const response = await fetch('/api/health');
    return response.ok;
  } catch {
    return false;
  }
}
