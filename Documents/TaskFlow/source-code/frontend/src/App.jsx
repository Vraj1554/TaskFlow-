import { useCallback, useEffect, useState } from 'react';
import { api, localToday } from './api.js';

const PRIORITY = { 1: 'High', 2: 'Medium', 3: 'Low' };
const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#0ea5e9', '#8b5cf6'];

function dueLabel(date) {
  if (!date) return null;
  const today = localToday();
  const diff = Math.round((new Date(date) - new Date(today)) / 864e5);
  if (diff < 0) return { text: `Overdue · ${date}`, cls: 'overdue' };
  if (diff === 0) return { text: 'Today', cls: 'today' };
  if (diff === 1) return { text: 'Tomorrow', cls: '' };
  return { text: date, cls: '' };
}

export default function App() {
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [stats, setStats] = useState(null);
  const [projectId, setProjectId] = useState(null);
  const [status, setStatus] = useState('active');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const guard = (fn) => async (...args) => {
    try {
      setError('');
      return await fn(...args);
    } catch (e) {
      setError(e.message);
    }
  };

  const refresh = useCallback(async () => {
    try {
      const [p, t, s] = await Promise.all([
        api.projects(),
        api.tasks({ project: projectId, status: status === 'all' ? '' : status, q: query }),
        api.stats(),
      ]);
      setProjects(p);
      setTasks(t);
      setStats(s);
    } catch (e) {
      setError(e.message);
    }
  }, [projectId, status, query]);

  useEffect(() => {
    const id = setTimeout(refresh, query ? 200 : 0);
    return () => clearTimeout(id);
  }, [refresh, query]);

  const current = projects.find((p) => p.id === projectId);
  const projectById = Object.fromEntries(projects.map((p) => [p.id, p]));

  const toggle = guard(async (task) => {
    await api.updateTask(task.id, { done: !task.done });
    refresh();
  });

  const removeProject = guard(async (p) => {
    if (!confirm(`Delete "${p.name}" and its ${p.total} task(s)?`)) return;
    await api.deleteProject(p.id);
    setProjectId(null);
    refresh();
  });

  return (
    <div className="layout">
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="brand">
          <span className="logo">✓</span> TaskFlow
        </div>
        <nav>
          <button
            className={`nav-item ${projectId === null ? 'active' : ''}`}
            onClick={() => { setProjectId(null); setSidebarOpen(false); }}
          >
            <span className="dot" style={{ background: 'var(--muted)' }} />
            All tasks
          </button>
          <div className="nav-heading">Projects</div>
          {projects.map((p) => (
            <div key={p.id} className="nav-row">
              <button
                className={`nav-item ${projectId === p.id ? 'active' : ''}`}
                onClick={() => { setProjectId(p.id); setSidebarOpen(false); }}
              >
                <span className="dot" style={{ background: p.color }} />
                <span className="grow">{p.name}</span>
                {p.open > 0 && <span className="count">{p.open}</span>}
              </button>
              <button className="icon-btn subtle" title="Delete project" onClick={() => removeProject(p)}>
                ×
              </button>
            </div>
          ))}
          <NewProject onCreate={guard(async (p) => {
            const created = await api.createProject(p);
            setProjectId(created.id);
            refresh();
          })} />
        </nav>
      </aside>
      {sidebarOpen && <div className="scrim" onClick={() => setSidebarOpen(false)} />}

      <main>
        <header className="topbar">
          <button className="icon-btn menu" onClick={() => setSidebarOpen(true)} aria-label="Open menu">☰</button>
          <h1>{current ? current.name : 'All tasks'}</h1>
        </header>

        {stats && (
          <div className="stats">
            <Stat label="Open" value={stats.total - stats.done} />
            <Stat label="Due today" value={stats.due_today} />
            <Stat label="Overdue" value={stats.overdue} tone={stats.overdue ? 'danger' : ''} />
            <Stat
              label="Completed"
              value={`${stats.total ? Math.round((stats.done / stats.total) * 100) : 0}%`}
            />
          </div>
        )}

        {error && (
          <div className="error" role="alert">
            {error} <button className="link" onClick={() => setError('')}>Dismiss</button>
          </div>
        )}

        <NewTask
          projects={projects}
          defaultProject={projectId}
          onCreate={guard(async (t) => {
            await api.createTask(t);
            refresh();
          })}
        />

        <div className="toolbar">
          <div className="tabs" role="tablist">
            {['active', 'done', 'all'].map((s) => (
              <button
                key={s}
                role="tab"
                aria-selected={status === s}
                className={status === s ? 'active' : ''}
                onClick={() => setStatus(s)}
              >
                {s[0].toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
          <input
            className="search"
            type="search"
            placeholder="Search tasks…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>

        <ul className="tasks">
          {tasks.length === 0 && (
            <li className="empty">
              {query ? 'No tasks match your search.' : status === 'done' ? 'Nothing completed yet.' : 'All clear — add a task above.'}
            </li>
          )}
          {tasks.map((t) => {
            const due = dueLabel(t.due_date);
            const project = projectById[t.project_id];
            return (
              <li key={t.id} className={`task ${t.done ? 'done' : ''}`}>
                <input
                  type="checkbox"
                  checked={t.done}
                  onChange={() => toggle(t)}
                  aria-label={`Mark "${t.title}" ${t.done ? 'not done' : 'done'}`}
                />
                <button className="task-body" onClick={() => setEditing(t)}>
                  <span className="task-title">{t.title}</span>
                  {t.notes && <span className="task-notes">{t.notes}</span>}
                  <span className="meta">
                    <span className={`badge p${t.priority}`}>{PRIORITY[t.priority]}</span>
                    {due && <span className={`due ${t.done ? '' : due.cls}`}>{due.text}</span>}
                    {project && projectId === null && (
                      <span className="tag">
                        <span className="dot" style={{ background: project.color }} />
                        {project.name}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </main>

      {editing && (
        <EditTask
          task={editing}
          projects={projects}
          onClose={() => setEditing(null)}
          onSave={guard(async (changes) => {
            await api.updateTask(editing.id, changes);
            setEditing(null);
            refresh();
          })}
          onDelete={guard(async () => {
            await api.deleteTask(editing.id);
            setEditing(null);
            refresh();
          })}
        />
      )}
    </div>
  );
}

function Stat({ label, value, tone = '' }) {
  return (
    <div className={`stat ${tone}`}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

function NewProject({ onCreate }) {
  const [name, setName] = useState('');
  const [open, setOpen] = useState(false);
  if (!open) {
    return <button className="nav-item add" onClick={() => setOpen(true)}>+ New project</button>;
  }
  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    await onCreate({ name, color: COLORS[Math.floor(Math.random() * COLORS.length)] });
    setName('');
    setOpen(false);
  };
  return (
    <form className="new-project" onSubmit={submit}>
      <input
        autoFocus
        placeholder="Project name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
        onBlur={() => !name && setOpen(false)}
      />
    </form>
  );
}

function NewTask({ projects, defaultProject, onCreate }) {
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [priority, setPriority] = useState(2);
  const [project, setProject] = useState(defaultProject ?? '');

  useEffect(() => setProject(defaultProject ?? ''), [defaultProject]);

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    await onCreate({
      title,
      due_date: due || null,
      priority,
      project_id: project === '' ? null : Number(project),
    });
    setTitle('');
    setDue('');
    setPriority(2);
  };

  return (
    <form className="new-task" onSubmit={submit}>
      <input
        className="grow"
        placeholder="Add a task…"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        aria-label="Task title"
      />
      <div className="new-task-opts">
        <input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Due date" />
        <select value={priority} onChange={(e) => setPriority(Number(e.target.value))} aria-label="Priority">
          {[1, 2, 3].map((p) => <option key={p} value={p}>{PRIORITY[p]}</option>)}
        </select>
        <select value={project} onChange={(e) => setProject(e.target.value)} aria-label="Project">
          <option value="">No project</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button className="primary" type="submit" disabled={!title.trim()}>Add</button>
      </div>
    </form>
  );
}

function EditTask({ task, projects, onClose, onSave, onDelete }) {
  const [form, setForm] = useState({
    title: task.title,
    notes: task.notes,
    due_date: task.due_date ?? '',
    priority: task.priority,
    project_id: task.project_id ?? '',
  });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = (e) => {
    e.preventDefault();
    onSave({
      ...form,
      due_date: form.due_date || null,
      priority: Number(form.priority),
      project_id: form.project_id === '' ? null : Number(form.project_id),
    });
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal" onSubmit={submit} role="dialog" aria-label="Edit task">
        <h2>Edit task</h2>
        <label>Title<input autoFocus value={form.title} onChange={set('title')} required /></label>
        <label>Notes<textarea rows={4} value={form.notes} onChange={set('notes')} /></label>
        <div className="row">
          <label>Due<input type="date" value={form.due_date} onChange={set('due_date')} /></label>
          <label>Priority
            <select value={form.priority} onChange={set('priority')}>
              {[1, 2, 3].map((p) => <option key={p} value={p}>{PRIORITY[p]}</option>)}
            </select>
          </label>
        </div>
        <label>Project
          <select value={form.project_id} onChange={set('project_id')}>
            <option value="">No project</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <div className="modal-actions">
          <button type="button" className="danger" onClick={onDelete}>Delete</button>
          <span className="grow" />
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="submit" className="primary">Save</button>
        </div>
      </form>
    </div>
  );
}
