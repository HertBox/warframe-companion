// api.js — the ONLY place the frontend talks to the backend.
// Default: derive the backend host from however the page was opened, so it works
// both at http://localhost:3000 (on the host) and http://<LAN-IP>:3000 (other
// devices) with no config. Override with VITE_API_URL if the backend lives
// elsewhere.
const BASE =
  import.meta.env.VITE_API_URL ||
  `${window.location.protocol}//${window.location.hostname}:3001`;

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    let detail = '';
    try {
      const body = await res.json();
      detail = body.error || body.detail || '';
    } catch {
      /* ignore */
    }
    const err = new Error(detail || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  if (res.status === 204) return null;
  return res.json();
}

export function searchItems(query) {
  return request('/api/search', {
    method: 'POST',
    body: JSON.stringify({ query }),
  });
}

export function fetchObjectives() {
  return request('/api/objectives');
}

export function addObjective(wikiPage, name) {
  return request('/api/objectives', {
    method: 'POST',
    body: JSON.stringify({ wikiPage, name }),
  });
}

export function togglePart(objectiveId, partId, obtained) {
  return request(`/api/objectives/${objectiveId}/parts/${partId}`, {
    method: 'PATCH',
    body: JSON.stringify({ obtained }),
  });
}

export function markObtained(objectiveId, obtained) {
  return request(`/api/objectives/${objectiveId}/obtained`, {
    method: 'PATCH',
    body: JSON.stringify({ obtained }),
  });
}

export function removeObjective(objectiveId) {
  return request(`/api/objectives/${objectiveId}`, { method: 'DELETE' });
}

export function refreshObjective(objectiveId) {
  return request(`/api/objectives/${objectiveId}/refresh`, { method: 'POST' });
}

export function fetchCompleted() {
  return request('/api/completed');
}

export function readdCompleted(id) {
  return request(`/api/objectives/completed/${id}/readd`, { method: 'POST' });
}

export function fetchCatalog(refresh = false) {
  return request(`/api/catalog${refresh ? '?refresh=1' : ''}`);
}
