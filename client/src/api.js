// The access token lives only in memory (never localStorage), so XSS cannot
// read it from storage. The refresh token is an httpOnly cookie JS cannot see.
let accessToken = null;
let refreshing = null;
let onExpired = () => {};

export class ApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.status = status;
    this.details = body?.details;
    this.code = body?.code;
  }
}

function send(path, { method, body, auth }) {
  const headers = { 'X-Requested-With': 'XMLHttpRequest' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth && accessToken) headers.Authorization = `Bearer ${accessToken}`;
  return fetch(`/api${path}`, {
    method,
    headers,
    credentials: 'include',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

// Concurrent callers share one in-flight refresh. Rotation would otherwise
// treat the second call as token reuse and kill the session.
function refresh() {
  if (!refreshing) {
    refreshing = send('/auth/refresh', { method: 'POST', auth: false })
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (!res.ok) throw new ApiError(data?.error || 'Session expired', res.status, data);
        accessToken = data.accessToken;
        return data;
      })
      .finally(() => {
        refreshing = null;
      });
  }
  return refreshing;
}

async function request(path, { method = 'GET', body, auth = true } = {}) {
  let res = await send(path, { method, body, auth });
  if (res.status === 401 && auth) {
    try {
      await refresh();
      res = await send(path, { method, body, auth });
    } catch {
      onExpired();
    }
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(data?.error || 'Request failed', res.status, data);
  return data;
}

export const api = {
  get: (path) => request(path),
  post: (path, body, opts) => request(path, { method: 'POST', body: body ?? undefined, ...opts }),
  patch: (path, body) => request(path, { method: 'PATCH', body }),
  refresh,
  setAccessToken: (t) => {
    accessToken = t;
  },
  onSessionExpired: (fn) => {
    onExpired = fn;
  },
};
