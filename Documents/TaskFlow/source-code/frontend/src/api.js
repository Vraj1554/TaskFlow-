async function request(method, url, body) {
  const res = await fetch(`/api${url}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const localToday = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
};

export const api = {
  projects: () => request('GET', '/projects'),
  createProject: (p) => request('POST', '/projects', p),
  updateProject: (id, p) => request('PATCH', `/projects/${id}`, p),
  deleteProject: (id) => request('DELETE', `/projects/${id}`),

  tasks: (params) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString();
    return request('GET', `/tasks${qs ? `?${qs}` : ''}`);
  },
  createTask: (t) => request('POST', '/tasks', t),
  updateTask: (id, t) => request('PATCH', `/tasks/${id}`, t),
  deleteTask: (id) => request('DELETE', `/tasks/${id}`),

  stats: () => request('GET', `/stats?today=${localToday()}`),
};
