import React from 'react';

const titles = {
  editor: ['Certificate editor', 'Design, preview, save, and export certificate layouts entirely in the browser.'],
  candidates: ['Candidate Management', 'Create, correct, and manage certificate-ready candidate records.'],
  import: ['Review before database save', 'Map your spreadsheet columns, visually check rows, then confirm the import.'],
  templates: ['Template Studio', 'Save visual presets, upload backgrounds, and ask AI for design ideas.'],
};

export function AppSidebar({ tab, setTab, candidates, theme, setTheme }) {
  return <aside className="sidebar">
    <div className="brand"><span className="brand-mark">B</span><div><strong>BUDO</strong><small>STUDIO CERTIFICATE APP</small></div></div>
    <div className="workspace-pill"><span className="online-dot" /> Main BUDO Studio</div>
    <nav>
      <button className={tab === 'editor' ? 'active' : ''} onClick={() => setTab('editor')}>✎ <span>Certificate editor</span></button>
      <button className={tab === 'candidates' ? 'active' : ''} onClick={() => setTab('candidates')}>◉ <span>Candidates</span><b>{candidates.length}</b></button>
      <button className={tab === 'import' ? 'active' : ''} onClick={() => setTab('import')}>⇩ <span>Import review</span></button>
      <button className={tab === 'templates' ? 'active' : ''} onClick={() => setTab('templates')}>✦ <span>Templates & AI</span></button>
    </nav>
    <div className="sidebar-bottom"><button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? '☼ Light mode' : '☾ Dark mode'}</button></div>
  </aside>;
}

export function AppHeader({ tab, health, session, signOut }) {
  const [title, subtitle] = titles[tab] || titles.editor;
  return <header className="topbar">
    <div><span className="eyebrow">BUDO STUDIO / MAIN APP</span><h1>{title}</h1><p>{subtitle}</p></div>
    <div className="status-cluster">
      <span className="status-chip">{health?.clientSideExports ? 'PDF/ZIP stays client-side' : 'Checking export mode'}</span>
      <span className={`status-chip ${health?.storage === 'supabase' ? '' : 'muted'}`}>{health?.storage === 'supabase' ? 'Supabase connected' : 'Local API storage'}</span>
      <span className={`status-chip ${health?.cloudinary ? '' : 'muted'}`}>{health?.cloudinary ? 'Cloudinary enabled' : 'Cloudinary not configured'}</span>
      <span className={`status-chip ${health?.gemini ? '' : 'muted'}`}>{health?.gemini ? 'Gemini enabled' : 'Gemini not configured'}</span>
      {session && <button className="text-button" onClick={signOut}>Sign out</button>}
    </div>
  </header>;
}
