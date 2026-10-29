import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { strFromU8, unzipSync } from 'fflate';
import { supabase } from './supabase/client.js';
import CertificateEditor from './CertificateEditor';
import './styles.css';
import './auth.css';

const API = import.meta.env.VITE_API_URL || '/api';
// The main BUDO Studio app is public: visitors can open the editor without a
// Supabase login. Supabase sessions are still supported when users sign in,
// but authentication must not block the main application shell.
const authRequired = false;
let currentSession = null;

const emptyCandidate = { name: '', birth: '', obtained: '', serial: '', belt: '', kyu: '', examDate: '', ordinal: '', origin: 'Manual', status: 'incomplete' };
const fieldLabels = { name: 'Name / full name', birth: 'Birth date', obtained: 'Grade date', serial: 'Official number', belt: 'Belt', kyu: 'Kyu', examDate: 'Exam date', ordinal: 'Excel order', origin: 'Source' };
const defaultPreset = { name: 'New certificate preset', belt: 'Yellow', description: '', backgroundUrl: '', primaryColor: '#bd001c', secondaryColor: '#004aad', fontFamily: 'Mirza', layout: 'classic' };

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...authHeaders(), ...(options.headers || {}) };
  const response = await fetch(`${API}${path}`, { headers, ...options });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || `Request failed (${response.status})`);
  }
  return response.status === 204 ? null : response.json();
}

function authHeaders() {
  return currentSession?.access_token ? { Authorization: `Bearer ${currentSession.access_token}` } : {};
}

function csvRows(text) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  return lines.map((line) => {
    const cells = [];
    let current = '';
    let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      if (char === '"' && line[index + 1] === '"') { current += '"'; index += 1; continue; }
      if (char === '"') { quoted = !quoted; continue; }
      if (char === ',' && !quoted) { cells.push(current.trim()); current = ''; continue; }
      current += char;
    }
    cells.push(current.trim());
    return cells;
  });
}

function readXlsxRows(buffer) {
  const files = unzipSync(new Uint8Array(buffer));
  const workbookXml = new DOMParser().parseFromString(strFromU8(files['xl/workbook.xml']), 'application/xml');
  const firstSheet = workbookXml.querySelector('sheet');
  const relationshipId = firstSheet?.getAttribute('r:id');
  const relsXml = new DOMParser().parseFromString(strFromU8(files['xl/_rels/workbook.xml.rels']), 'application/xml');
  const relationship = [...relsXml.querySelectorAll('Relationship')].find((item) => item.getAttribute('Id') === relationshipId);
  const relationshipTarget = relationship?.getAttribute('Target')?.replace(/^\//, '');
  const sheetPath = relationshipTarget ? (relationshipTarget.startsWith('xl/') ? relationshipTarget : `xl/${relationshipTarget}`) : 'xl/worksheets/sheet1.xml';
  const sharedStrings = files['xl/sharedStrings.xml']
    ? [...new DOMParser().parseFromString(strFromU8(files['xl/sharedStrings.xml']), 'application/xml').querySelectorAll('si')].map((item) => [...item.querySelectorAll('t')].map((node) => node.textContent).join(''))
    : [];
  const sheetXml = new DOMParser().parseFromString(strFromU8(files[sheetPath]), 'application/xml');
  return [...sheetXml.querySelectorAll('row')].map((row) => {
    const cells = [];
    row.querySelectorAll('c').forEach((cell) => {
      const reference = cell.getAttribute('r') || '';
      const letters = reference.match(/[A-Z]+/i)?.[0] || 'A';
      const column = [...letters.toUpperCase()].reduce((value, letter) => value * 26 + letter.charCodeAt(0) - 64, 0) - 1;
      const type = cell.getAttribute('t');
      const value = type === 'inlineStr' ? cell.querySelector('is t')?.textContent || '' : cell.querySelector('v')?.textContent || '';
      cells[column] = type === 's' ? (sharedStrings[Number(value)] || '') : value;
    });
    return cells;
  });
}

function readSpreadsheet(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the selected file.'));
    reader.onload = () => {
      try {
        if (file.name.toLowerCase().endsWith('.csv')) return resolve(csvRows(String(reader.result)));
        if (file.name.toLowerCase().endsWith('.xls')) throw new Error('Legacy .xls files are not supported in the React preview yet. Save the workbook as .xlsx or .csv.');
        resolve(readXlsxRows(reader.result));
      } catch (error) { reject(error); }
    };
    if (file.name.toLowerCase().endsWith('.csv')) reader.readAsText(file); else reader.readAsArrayBuffer(file);
  });
}

function buildImportPreview(matrix, fileName) {
  const groupBelt = String(matrix[5]?.[3] || '').trim();
  const groupKyu = String(matrix[5]?.[2] || '').trim();
  const groupExamDate = String(matrix[5]?.[1] || '').trim();
  const isBudoSheet = matrix.length > 12 && (groupBelt || groupKyu || groupExamDate) && matrix.slice(12).some((row) => String(row?.[3] || '').trim());
  if (isBudoSheet) {
    const rows = matrix.slice(12).filter((row) => String(row?.[3] || '').trim()).map((row) => [
      String(row[3] || '').trim(), String(row[1] || '').trim(), String(row[0] || groupExamDate).trim(), groupBelt, groupKyu, groupExamDate, String(row[4] || '').trim(), fileName,
    ]);
    return { mode: 'BUDO sheet detected', headers: ['Name (D13)', 'Birth (B13)', 'Grade date (A13)', 'Belt (D6)', 'Kyu (C6)', 'Exam date (B6)', 'Excel order (E13)', 'Source'], rows };
  }
  const headers = (matrix[0] || []).map((value, index) => String(value || `Column ${index + 1}`));
  return { mode: 'Generic spreadsheet', headers, rows: matrix.slice(1) };
}

function guessMapping(headers) {
  const normalized = headers.map((header) => String(header).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, ''));
  const aliases = {
    name: ['name', 'nom', 'fullname', 'nomprenom', 'candidate'], birth: ['birth', 'naissance', 'datenaissance'],
    obtained: ['obtained', 'grade', 'obtention', 'dategrade'], serial: ['serial', 'number', 'numero', 'diplome'],
    belt: ['belt', 'ceinture', 'color', 'couleur'], kyu: ['kyu', 'gradekyu'], examDate: ['examdate', 'examen', 'dateexamen'],
    ordinal: ['ordinal', 'order', 'ligne', 'line'], origin: ['origin', 'source', 'fichier'],
  };
  return Object.fromEntries(Object.entries(aliases).map(([field, names]) => [field, Math.max(0, normalized.findIndex((header) => names.some((alias) => header.includes(alias))))]));
}

function ConfirmDialog({ dialog, onClose }) {
  const [busy, setBusy] = useState(false);
  if (!dialog) return null;
  async function confirm() {
    setBusy(true);
    try { await dialog.onConfirm(); } finally { setBusy(false); onClose(); }
  }
  return <div className="confirm-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}><div className="confirm-card" role="dialog" aria-modal="true" aria-labelledby="confirm-title"><div className={`confirm-icon ${dialog.danger ? 'danger' : ''}`}>{dialog.danger ? '!' : '?'}</div><div className="confirm-card-head"><div><h2 id="confirm-title">{dialog.title}</h2><p>{dialog.message}</p></div><button className="confirm-close" onClick={onClose} disabled={busy} aria-label="Close">×</button></div><div className="confirm-actions"><button className="secondary-button" onClick={onClose} disabled={busy}>Cancel</button><button className={dialog.danger ? 'danger-button' : 'primary-button'} onClick={confirm} disabled={busy}>{busy ? 'Working…' : dialog.confirmLabel || 'Confirm'}</button></div></div></div>;
}

function App() {
  const [tab, setTab] = useState('editor');
  const [theme, setTheme] = useState(() => localStorage.getItem('budo-theme') || 'light');
  const [session, setSession] = useState(null);
  const [authMode, setAuthMode] = useState('signin');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [health, setHealth] = useState(null);
  const [adminAccess, setAdminAccess] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState(null);
  const [form, setForm] = useState(emptyCandidate);
  const [editingId, setEditingId] = useState(null);
  const [rows, setRows] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [mapping, setMapping] = useState({});
  const [selectedRows, setSelectedRows] = useState(new Set());
  const [importFile, setImportFile] = useState(null);
  const [importMode, setImportMode] = useState('');
  const [presets, setPresets] = useState([]);
  const [preset, setPreset] = useState(defaultPreset);
  const [brainstormPrompt, setBrainstormPrompt] = useState('Suggest three elegant layouts for a martial arts belt certificate.');
  const [brainstorm, setBrainstorm] = useState('');
  const [ocrFile, setOcrFile] = useState(null);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState(null);

  const visibleCandidates = useMemo(() => {
    const term = query.trim().toLowerCase();
    return term ? candidates.filter((candidate) => `${candidate.name} ${candidate.belt} ${candidate.serial}`.toLowerCase().includes(term)) : candidates;
  }, [candidates, query]);

  function flash(message, type = 'success') {
    setNotice({ message, type });
    window.setTimeout(() => setNotice(null), 4200);
  }

  async function loadData() {
    setLoading(true);
    try {
      const [healthData, adminData] = await Promise.all([api('/health'), api('/admin/access').catch(() => ({ authenticated: false, isAdmin: false }))]);
      setHealth(healthData); setAdminAccess(adminData);
      if (!healthData.schemaReady) {
        setCandidates([]); setPresets([]);
        flash(healthData.schemaError || 'Supabase schema is not ready.', 'error');
        return;
      }
      const [candidateData, presetData] = await Promise.all([api('/candidates?pageSize=100'), api('/templates/presets')]);
      setCandidates(candidateData.data || []); setPresets(presetData || []);
    } catch (error) { flash(error.message, 'error'); } finally { setLoading(false); }
  }

  useEffect(() => {
    if (!supabase) return undefined;
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      currentSession = data.session;
      if (active) setSession(data.session);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      currentSession = nextSession;
      if (active) setSession(nextSession);
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);
  useEffect(() => {
    if (authRequired && !session) return;
    loadData();
  }, [session]);
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem('budo-theme', theme); }, [theme]);
  useEffect(() => {
    if (!supabase || (authRequired && !session)) return undefined;
    const channel = supabase.channel('budo-workspace-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'candidates' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'template_presets' }, loadData)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session]);

  function updateForm(key, value) { setForm((current) => ({ ...current, [key]: value })); }
  function startEdit(candidate) { setEditingId(candidate.id); setForm({ ...emptyCandidate, ...candidate }); setTab('candidates'); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  function resetForm() { setEditingId(null); setForm(emptyCandidate); }
  async function saveCandidate(event) {
    event.preventDefault();
    try {
      const payload = { ...form, status: form.name && form.belt && form.obtained ? 'ready' : 'incomplete' };
      if (editingId) await api(`/candidates/${editingId}`, { method: 'PUT', body: JSON.stringify(payload) }); else await api('/candidates', { method: 'POST', body: JSON.stringify(payload) });
      await loadData(); resetForm(); flash(editingId ? 'Candidate updated.' : 'Candidate saved.');
    } catch (error) { flash(error.message, 'error'); }
  }
  async function removeCandidate(candidate) {
    setConfirmDialog({ title: 'Delete candidate?', message: `The record for ${candidate.name} will be removed from the database.`, confirmLabel: 'Delete candidate', danger: true, onConfirm: async () => { try { await api(`/candidates/${candidate.id}`, { method: 'DELETE' }); await loadData(); flash('Candidate deleted.'); } catch (error) { flash(error.message, 'error'); } } });
  }
  async function importCandidates() {
    const selected = [...selectedRows].map((index) => rows[index]).filter(Boolean);
    if (!selected.length) return flash('Select at least one preview row first.', 'error');
    try {
      for (const row of selected) {
      const candidate = Object.fromEntries(Object.keys(fieldLabels).map((field) => [field, row[mapping[field]] ?? '']));
      candidate.serial = candidate.serial || candidate.ordinal || '';
        const status = candidate.name && candidate.belt && candidate.obtained ? 'ready' : 'incomplete';
        await api('/candidates', { method: 'POST', body: JSON.stringify({ ...candidate, status, origin: candidate.origin || importFile?.name || 'Spreadsheet import' }) });
      }
      await loadData(); setRows([]); setHeaders([]); setSelectedRows(new Set()); flash(`${selected.length} candidate(s) imported after review.`);
    } catch (error) { flash(error.message, 'error'); }
  }
  async function handleImport(event) {
    const file = event.target.files?.[0]; if (!file) return;
    try { const preview = buildImportPreview(await readSpreadsheet(file), file.name); setImportFile(file); setImportMode(preview.mode); setHeaders(preview.headers); setRows(preview.rows); setMapping(guessMapping(preview.headers)); setSelectedRows(new Set(preview.rows.map((_row, index) => index))); setTab('import'); flash(`${preview.mode} preview ready. Review the mapping before saving.`); } catch (error) { flash(error.message, 'error'); }
    event.target.value = '';
  }
  function toggleRow(index) { setSelectedRows((current) => { const next = new Set(current); if (next.has(index)) next.delete(index); else next.add(index); return next; }); }
  async function runBrainstorm() {
    try { const result = await api('/ai/brainstorm', { method: 'POST', body: JSON.stringify({ prompt: brainstormPrompt, context: preset }) }); setBrainstorm(result.suggestions); } catch (error) { flash(error.message, 'error'); }
  }
  async function runOCR(event) {
    const file = event.target.files?.[0]; if (!file) return; setOcrFile(file); setOcrBusy(true);
    try { const body = new FormData(); body.append('file', file); const result = await fetch(`${API}/ai/extract-candidate`, { method: 'POST', headers: authHeaders(), body }).then(async (response) => { const payload = await response.json(); if (!response.ok) throw new Error(payload.error); return payload; }); setForm((current) => ({ ...current, ...result.candidate })); setTab('candidates'); flash('AI extracted a draft. Review it before saving.'); } catch (error) { flash(error.message, 'error'); } finally { setOcrBusy(false); event.target.value = ''; }
  }
  async function savePreset() {
    try { const config = { backgroundUrl: preset.backgroundUrl, primaryColor: preset.primaryColor, secondaryColor: preset.secondaryColor, fontFamily: preset.fontFamily, layout: preset.layout }; await api('/templates/presets', { method: 'POST', body: JSON.stringify({ name: preset.name, belt: preset.belt, description: preset.description, config }) }); await loadData(); flash('Template preset saved.'); } catch (error) { flash(error.message, 'error'); }
  }
  async function uploadAsset(event) {
    const file = event.target.files?.[0]; if (!file) return; const body = new FormData(); body.append('file', file); body.append('belt', preset.belt); body.append('name', file.name);
    try { const response = await fetch(`${API}/templates/assets`, { method: 'POST', headers: authHeaders(), body }); const result = await response.json(); if (!response.ok) throw new Error(result.error); setPreset((current) => ({ ...current, backgroundUrl: result.previewUrl || result.url })); flash('Template asset uploaded to Cloudinary.'); } catch (error) { flash(error.message, 'error'); } finally { event.target.value = ''; }
  }
  async function uploadEditorBackground(file, belt) {
    const body = new FormData(); body.append('file', file); body.append('belt', belt); body.append('name', file.name);
    const response = await fetch(`${API}/templates/assets`, { method: 'POST', headers: authHeaders(), body });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    return result.previewUrl || result.url;
  }
  async function submitAuth(event) {
    event.preventDefault();
    if (!supabase) return;
    setAuthBusy(true);
    try {
      const result = authMode === 'signin'
        ? await supabase.auth.signInWithPassword({ email: authEmail, password: authPassword })
        : await supabase.auth.signUp({ email: authEmail, password: authPassword });
      if (result.error) throw result.error;
      flash(authMode === 'signin' ? 'Signed in.' : 'Account created. Check your email if confirmation is enabled.');
    } catch (error) { flash(error.message, 'error'); } finally { setAuthBusy(false); }
  }
  async function signOut() {
    if (supabase) await supabase.auth.signOut();
    currentSession = null; setSession(null);
  }
  async function saveEditorPreset(config, presetId) {
    const method = presetId ? 'PUT' : 'POST';
    const path = presetId ? `/templates/presets/${presetId}` : '/templates/presets';
    await api(path, { method, body: JSON.stringify({ name: config.name, belt: config.belt, description: 'React visual editor preset', previewUrl: config.backgroundUrl || null, config }) });
    await loadData();
  }
  async function deleteEditorPreset(item) {
    setConfirmDialog({ title: 'Delete template preset?', message: `The saved configuration “${item.name}” will be permanently removed.`, confirmLabel: 'Delete preset', danger: true, onConfirm: async () => { try { await api(`/templates/presets/${item.id}`, { method: 'DELETE' }); await loadData(); flash('Preset deleted.'); } catch (error) { flash(error.message, 'error'); } } });
  }

  if (authRequired && !session) return <div className="auth-shell"><div className="auth-card"><div className="brand auth-brand"><span className="brand-mark">B</span><div><strong>BUDO</strong><small>STUDIO WORKSPACE</small></div></div><span className="eyebrow">PRIVATE WORKSPACE</span><h1>{authMode === 'signin' ? 'Sign in to BUDO Studio' : 'Create your workspace account'}</h1><p>Your candidate records and template presets are scoped to your Supabase user.</p><form onSubmit={submitAuth}><label>Email<input type="email" required value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} /></label><label>Password<input type="password" required minLength="6" value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} /></label><button className="primary-button" disabled={authBusy}>{authBusy ? 'Working…' : authMode === 'signin' ? 'Sign in' : 'Create account'}</button></form><button className="text-button auth-toggle" onClick={() => setAuthMode(authMode === 'signin' ? 'signup' : 'signin')}>{authMode === 'signin' ? 'Need an account? Create one' : 'Already have an account? Sign in'}</button></div></div>;

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">B</span><div><strong>BUDO</strong><small>STUDIO WORKSPACE</small></div></div>
      <div className="workspace-pill"><span className="online-dot" /> {session?.user?.email || (health?.storage === 'supabase' ? 'Supabase workspace' : 'Local API workspace')}</div>
      <nav><button className={tab === 'editor' ? 'active' : ''} onClick={() => setTab('editor')}>✎ <span>Certificate editor</span></button><button className={tab === 'candidates' ? 'active' : ''} onClick={() => setTab('candidates')}>◉ <span>Candidates</span><b>{candidates.length}</b></button><button className={tab === 'import' ? 'active' : ''} onClick={() => setTab('import')}>⇩ <span>Import review</span></button><button className={tab === 'templates' ? 'active' : ''} onClick={() => setTab('templates')}>✦ <span>Templates & AI</span></button></nav>
      <div className="sidebar-bottom"><a href="../index.html" target="_blank" rel="noreferrer">Open legacy certificate editor ↗</a><button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? '☼ Light mode' : '☾ Dark mode'}</button></div>
    </aside>
    <main className="main-content">
      <header className="topbar"><div><span className="eyebrow">BUDO STUDIO / WORKSPACE</span><h1>{tab === 'editor' ? 'Certificate editor' : tab === 'candidates' ? 'Candidate Management' : tab === 'import' ? 'Review before database save' : 'Template Studio'}</h1><p>{tab === 'editor' ? 'Design, preview, save, and export certificate layouts entirely in the browser.' : tab === 'candidates' ? 'Create, correct, and manage certificate-ready candidate records.' : tab === 'import' ? 'Map your spreadsheet columns, visually check rows, then confirm the import.' : 'Save visual presets, upload backgrounds, and ask AI for design ideas.'}</p></div><div className="status-cluster"><span className="status-chip">{health?.clientSideExports ? 'PDF/ZIP stays client-side' : 'Checking export mode'}</span><span className={`status-chip ${health?.storage === 'supabase' ? '' : 'muted'}`}>{health?.storage === 'supabase' ? 'Supabase connected' : 'Local memory storage'}</span><span className={`status-chip ${health?.cloudinary ? '' : 'muted'}`}>{health?.cloudinary ? 'Cloudinary enabled' : 'Cloudinary not configured'}</span><span className={`status-chip ${health?.gemini ? '' : 'muted'}`}>{health?.gemini ? 'Gemini enabled' : 'Gemini not configured'}</span>{session && <button className="text-button" onClick={signOut}>Sign out</button>}</div></header>
      {notice && <div className={`notice ${notice.type}`}>{notice.message}</div>}
      {adminAccess?.isAdmin && <div className="admin-banner">Administrator access enabled for {adminAccess.user?.email || 'this account'}.</div>}
      {tab === 'editor' && <CertificateEditor candidates={candidates} presets={presets} onSavePreset={saveEditorPreset} onDeletePreset={deleteEditorPreset} onUploadBackground={uploadEditorBackground} flash={flash} />}
      {tab === 'candidates' && <section className="workspace-grid"><div className="panel form-panel"><div className="panel-heading"><div><span className="eyebrow">{editingId ? 'EDIT RECORD' : 'NEW RECORD'}</span><h2>{editingId ? 'Update candidate' : 'Add candidate manually'}</h2></div>{editingId && <button className="text-button" onClick={resetForm}>Cancel edit</button>}</div><form onSubmit={saveCandidate}><div className="form-grid">{Object.keys(fieldLabels).map((field) => <label key={field} className={field === 'name' || field === 'origin' ? 'wide' : ''}>{fieldLabels[field]}<input required={field === 'name'} value={form[field] ?? ''} onChange={(event) => updateForm(field, event.target.value)} placeholder={field === 'name' ? 'e.g. Hamza Khalili' : 'Optional'} /></label>)}</div><div className="form-actions"><button type="submit" className="primary-button">{editingId ? 'Save changes' : 'Create candidate'}</button><button type="button" className="secondary-button" onClick={resetForm}>Clear</button></div></form><div className="divider" /><div className="ai-upload"><div><span className="eyebrow">AI OCR REVIEW</span><strong>{ocrFile ? ocrFile.name : 'Extract fields from a candidate picture'}</strong><small>Image is analyzed first; nothing is saved until you review and click save.</small></div><label className="secondary-button">{ocrBusy ? 'Reading…' : 'Drop / choose picture'}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={runOCR} disabled={ocrBusy} hidden /></label></div></div><div className="panel table-panel"><div className="panel-heading"><div><span className="eyebrow">DATABASE RECORDS</span><h2>{loading ? 'Loading…' : `${visibleCandidates.length} candidate${visibleCandidates.length === 1 ? '' : 's'}`}</h2></div><input className="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, belt, number" /></div><div className="table-wrap"><table><thead><tr><th>Name</th><th>Belt</th><th>Dates</th><th>Official no.</th><th>Status</th><th /></tr></thead><tbody>{visibleCandidates.map((candidate) => <tr key={candidate.id}><td><strong>{candidate.name}</strong><small>{candidate.origin}</small></td><td><span className="belt-dot" />{candidate.belt || '—'}</td><td>{candidate.birth || '—'}<small>{candidate.obtained || 'No grade date'}</small></td><td>{candidate.serial || '—'}</td><td><span className={`record-status ${candidate.status}`}>{candidate.status}</span></td><td><div className="row-actions"><button onClick={() => startEdit(candidate)}>Edit</button><button className="danger" onClick={() => removeCandidate(candidate)}>Delete</button></div></td></tr>)}</tbody></table>{!loading && !visibleCandidates.length && <div className="empty-state">No candidates yet. Add one manually or use Import review.</div>}</div></div></section>}
      {tab === 'import' && <section className="panel import-panel"><div className="drop-zone"><div className="drop-icon">⇩</div><h2>Import Excel or CSV for review</h2><p>Rows are parsed in your browser first. The database receives only the rows you select after mapping.</p><label className="primary-button">Choose spreadsheet<input type="file" accept=".xlsx,.xls,.csv" onChange={handleImport} hidden /></label></div>{headers.length > 0 && <><div className="import-header"><div><span className="eyebrow">{importFile?.name} · {importMode}</span><h2>Column mapping</h2></div><button className="primary-button" onClick={importCandidates}>Save {selectedRows.size} selected row(s)</button></div><div className="mapping-grid">{Object.entries(fieldLabels).map(([field, label]) => <label key={field}>{label}<select value={mapping[field] ?? 0} onChange={(event) => setMapping((current) => ({ ...current, [field]: Number(event.target.value) }))}>{headers.map((header, index) => <option key={index} value={index}>{header || `Column ${index + 1}`}</option>)}</select></label>)}</div><div className="preview-table-wrap"><table><thead><tr><th><input type="checkbox" checked={selectedRows.size === rows.length && rows.length > 0} onChange={(event) => setSelectedRows(event.target.checked ? new Set(rows.map((_row, index) => index)) : new Set())} /></th>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{rows.slice(0, 100).map((row, index) => <tr key={index} className={selectedRows.has(index) ? '' : 'not-selected'}><td><input type="checkbox" checked={selectedRows.has(index)} onChange={() => toggleRow(index)} /></td>{headers.map((_header, column) => <td key={column}>{String(row[column] ?? '')}</td>)}</tr>)}</tbody></table></div></>}</section>}
      {tab === 'templates' && <section className="template-layout"><div className="panel preset-panel"><div className="panel-heading"><div><span className="eyebrow">PRESET LIBRARY</span><h2>Save a visual template preset</h2></div></div><div className="form-grid">{[['name','Preset name'],['belt','Belt / group'],['description','Description']].map(([field,label]) => <label key={field} className="wide">{label}<input value={preset[field]} onChange={(event) => setPreset((current) => ({ ...current, [field]: event.target.value }))} /></label>)}<label>Primary color<input type="color" value={preset.primaryColor} onChange={(event) => setPreset((current) => ({ ...current, primaryColor: event.target.value }))} /></label><label>Secondary color<input type="color" value={preset.secondaryColor} onChange={(event) => setPreset((current) => ({ ...current, secondaryColor: event.target.value }))} /></label><label>Font family<select value={preset.fontFamily} onChange={(event) => setPreset((current) => ({ ...current, fontFamily: event.target.value }))}><option>Mirza</option><option>Amiri</option><option>Arial</option><option>Georgia</option></select></label><label>Layout<select value={preset.layout} onChange={(event) => setPreset((current) => ({ ...current, layout: event.target.value }))}><option value="classic">Classic</option><option value="modern">Modern</option><option value="minimal">Minimal</option></select></label><label className="wide">Background image URL<input value={preset.backgroundUrl} onChange={(event) => setPreset((current) => ({ ...current, backgroundUrl: event.target.value }))} placeholder="Cloudinary URL appears here after upload" /></label></div><div className="form-actions"><label className="secondary-button">Upload background<input type="file" accept="image/png,image/jpeg,image/webp" onChange={uploadAsset} hidden /></label><button className="primary-button" onClick={savePreset}>Save preset</button></div><div className="preset-list">{presets.map((item) => <div key={item.id}><span className="preset-swatch" style={{ background: item.config?.primaryColor || '#bd001c' }} /><div><strong>{item.name}</strong><small>{item.belt || 'All belts'} · {item.description || 'No description'}</small></div></div>)}</div></div><div className="panel ai-panel"><span className="eyebrow">AI BRAINSTORMING</span><h2>Ask for layout or wording ideas</h2><textarea value={brainstormPrompt} onChange={(event) => setBrainstormPrompt(event.target.value)} /><button className="primary-button" onClick={runBrainstorm}>Generate suggestions</button>{brainstorm && <div className="ai-result">{brainstorm}</div>}<div className="privacy-note">Final PDF and ZIP exports remain on the client. AI is only used when you explicitly submit a prompt or image.</div></div></section>}
    </main>
    <ConfirmDialog dialog={confirmDialog} onClose={() => setConfirmDialog(null)} />
  </div>;
}

createRoot(document.getElementById('root')).render(<App />);
