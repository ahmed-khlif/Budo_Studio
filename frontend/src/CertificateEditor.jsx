import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BELTS, CERTIFICATE_HEIGHT, CERTIFICATE_WIDTH, FIELD_SOURCES, candidateValue, defaultEditorConfig, exportCertificatePdf, exportCertificateZip, normalizeConfig, sampleCandidate } from './certificate';
import './certificate.css';
import './editor-overrides.css';

function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }

export default function CertificateEditor({ candidates, presets, onSavePreset, onDeletePreset, onUploadBackground, flash }) {
  const [config, setConfig] = useState(defaultEditorConfig);
  const [loadedPresetId, setLoadedPresetId] = useState(null);
  const [selectedField, setSelectedField] = useState('name');
  const [previewId, setPreviewId] = useState('sample');
  const [zoom, setZoom] = useState(0.62);
  const [exporting, setExporting] = useState(false);
  const [exportMode, setExportMode] = useState('pdf');
  const drag = useRef(null);
  const candidate = useMemo(() => candidates.find((item) => item.id === previewId) || sampleCandidate, [candidates, previewId]);
  const field = config.fields.find((item) => item.id === selectedField) || config.fields[0];

  useEffect(() => { if (!config.fields.some((item) => item.id === selectedField)) setSelectedField(config.fields[0]?.id); }, [config.fields, selectedField]);
  useEffect(() => {
    const move = (event) => {
      if (!drag.current) return;
      const { id, startX, startY, pointerX, pointerY } = drag.current;
      const nextX = clamp(startX + (event.clientX - pointerX) / zoom, 0, CERTIFICATE_WIDTH);
      const nextY = clamp(startY + (event.clientY - pointerY) / zoom, 0, CERTIFICATE_HEIGHT);
      setConfig((current) => ({ ...current, fields: current.fields.map((item) => item.id === id ? { ...item, x: Math.round(nextX), y: Math.round(nextY) } : item) }));
    };
    const up = () => { drag.current = null; };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
  }, [zoom]);

  function updateConfig(props) { setConfig((current) => ({ ...current, ...props })); }
  function updateField(props) { if (!field) return; setConfig((current) => ({ ...current, fields: current.fields.map((item) => item.id === field.id ? { ...item, ...props } : item) })); }
  function addField() {
    const id = `custom_${Date.now()}`;
    setConfig((current) => ({ ...current, fields: [...current.fields, { id, source: 'custom', label: 'Custom text', text: 'Your text', x: CERTIFICATE_WIDTH / 2, y: CERTIFICATE_HEIGHT / 2, w: 300, h: 45, size: 30, color: current.primaryColor, family: current.fontFamily, weight: 400, align: 'center', direction: 'ltr', visible: true, opacity: 1, rotation: 0 }] }));
    setSelectedField(id);
  }
  function removeField() {
    if (!field) return;
    setConfig((current) => ({ ...current, fields: current.fields.filter((item) => item.id !== field.id) }));
  }
  async function uploadBackground(event) {
    const file = event.target.files?.[0]; if (!file) return;
    try { const url = await onUploadBackground(file, config.belt); updateConfig({ backgroundUrl: url }); flash('Background uploaded and applied to the editor.'); } catch (error) { flash(error.message, 'error'); }
    event.target.value = '';
  }
  async function savePreset() {
    try { await onSavePreset({ ...config, name: config.name || `${config.belt} certificate preset` }, loadedPresetId); flash(loadedPresetId ? 'Template configuration updated.' : 'Full editor configuration saved as a preset.'); } catch (error) { flash(error.message, 'error'); }
  }
  function loadPreset(item) {
    setConfig(normalizeConfig({ ...item.config, name: item.name, belt: item.belt || item.config?.belt || 'أصفر' }));
    setLoadedPresetId(item.id);
    setSelectedField(item.config?.fields?.[0]?.id || 'name');
    flash(`Preset loaded: ${item.name}`);
  }
  async function runExport() {
    const list = candidates.filter((item) => !config.belt || item.belt === config.belt);
    const exportList = list.length ? list : [sampleCandidate];
    setExporting(true);
    try {
      const onProgress = (current, total) => flash(`Rendering ${current}/${total} certificate(s)…`);
      if (exportMode === 'pdf') await exportCertificatePdf(exportList, config, onProgress); else await exportCertificateZip(exportList, config, onProgress);
      flash(`${exportMode.toUpperCase()} export completed in your browser.`);
    } catch (error) { flash(error.message, 'error'); } finally { setExporting(false); }
  }

  return <section className="editor-layout">
    <div className="panel editor-controls">
      <div className="panel-heading"><div><span className="eyebrow">REACT CERTIFICATE EDITOR</span><h2>Design the certificate</h2></div><span className="editor-lock">Client-side export</span></div>
      <div className="editor-control-block"><label>Preset name<input value={config.name} onChange={(event) => updateConfig({ name: event.target.value })} /></label><label>Belt / group<select value={config.belt} onChange={(event) => updateConfig({ belt: event.target.value })}>{BELTS.map((belt) => <option key={belt}>{belt}</option>)}</select></label><label>Preview candidate<select value={previewId} onChange={(event) => setPreviewId(event.target.value)}><option value="sample">Sample preview</option>{candidates.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>
       <div className="editor-control-block"><div className="block-title">Certificate appearance</div><div className="editor-two-col"><label>Primary<input type="color" value={config.primaryColor} onChange={(event) => updateConfig({ primaryColor: event.target.value })} /></label><label>Secondary<input type="color" value={config.secondaryColor} onChange={(event) => updateConfig({ secondaryColor: event.target.value })} /></label><label>Default font<select value={config.fontFamily} onChange={(event) => updateConfig({ fontFamily: event.target.value })}><option>Mirza</option><option>Amiri</option><option>Arial</option><option>Georgia</option><option>Tahoma</option></select></label><label>Zoom<div className="range-line"><input type="range" min=".35" max=".9" step=".01" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /><span>{Math.round(zoom * 100)}%</span></div></label></div><label>Background image/PDF URL<input value={config.backgroundUrl} onChange={(event) => updateConfig({ backgroundUrl: event.target.value })} /></label><div className="editor-actions"><label className="secondary-button">Upload background/PDF<input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={uploadBackground} hidden /></label><button className="secondary-button" onClick={() => updateConfig({ backgroundUrl: '' })}>Blank background</button></div></div>
      <div className="editor-control-block field-block"><div className="block-title row-between"><span>Editable zones</span><button className="text-button" onClick={addField}>＋ Add zone</button></div><div className="zone-list-react">{config.fields.map((item) => <button key={item.id} className={item.id === selectedField ? 'zone-item active' : 'zone-item'} onClick={() => setSelectedField(item.id)}><span className="zone-color" style={{ background: item.color }} /><span><strong>{item.label}</strong><small>{candidateValue(item, candidate) || 'Empty'}</small></span><em>{item.visible ? '◉' : '○'}</em></button>)}</div></div>
      {field && <div className="editor-control-block inspector-react"><div className="block-title row-between"><span>Selected zone</span><button className="text-button danger-text" onClick={removeField}>Delete</button></div><label>Zone label<input value={field.label} onChange={(event) => updateField({ label: event.target.value })} /></label><div className="editor-two-col"><label>Data source<select value={field.source} onChange={(event) => updateField({ source: event.target.value })}>{FIELD_SOURCES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Font<select value={field.family} onChange={(event) => updateField({ family: event.target.value })}><option>Mirza</option><option>Amiri</option><option>Arial</option><option>Georgia</option><option>Tahoma</option></select></label><label>Text / sample<input value={field.text || ''} onChange={(event) => updateField({ text: event.target.value })} /></label><label>Font size<input type="number" min="8" max="96" value={field.size} onChange={(event) => updateField({ size: Number(event.target.value) })} /></label><label>Color<input type="color" value={field.color} onChange={(event) => updateField({ color: event.target.value })} /></label><label>Weight<select value={field.weight} onChange={(event) => updateField({ weight: Number(event.target.value) })}><option value="400">Regular</option><option value="600">Semi-bold</option><option value="700">Bold</option></select></label></div><div className="editor-two-col numeric-grid"><label>X<input type="number" value={Math.round(field.x)} onChange={(event) => updateField({ x: Number(event.target.value) })} /></label><label>Y<input type="number" value={Math.round(field.y)} onChange={(event) => updateField({ y: Number(event.target.value) })} /></label><label>Width<input type="number" value={Math.round(field.w)} onChange={(event) => updateField({ w: Number(event.target.value) })} /></label><label>Rotation<input type="number" value={Math.round(field.rotation || 0)} onChange={(event) => updateField({ rotation: Number(event.target.value) })} /></label></div><div className="editor-checks"><label><input type="checkbox" checked={field.visible} onChange={(event) => updateField({ visible: event.target.checked })} /> Visible</label><label><input type="checkbox" checked={field.underline || false} onChange={(event) => updateField({ underline: event.target.checked })} /> Underline</label><label>Align<select value={field.align} onChange={(event) => updateField({ align: event.target.value })}><option>left</option><option>center</option><option>right</option></select></label></div></div>}
      <div className="editor-export"><select value={exportMode} onChange={(event) => setExportMode(event.target.value)}><option value="pdf">PDF — all matching candidates</option><option value="zip">ZIP — one PDF per candidate</option></select><button className="primary-button" disabled={exporting} onClick={runExport}>{exporting ? 'Rendering…' : 'Export locally'}</button></div>
    </div>
    <div className="panel editor-preview-panel"><div className="panel-heading"><div><span className="eyebrow">LIVE PREVIEW</span><h2>{candidate.name || 'Certificate preview'}</h2></div><div className="preview-badges"><span className="status-chip">{config.belt}</span><span className="status-chip muted">{config.fields.length} zones</span></div></div><div className="certificate-viewport" style={{ width: `${CERTIFICATE_WIDTH * zoom}px`, height: `${CERTIFICATE_HEIGHT * zoom}px` }}><div className="certificate-sheet-react" style={{ transform: `scale(${zoom})`, backgroundImage: config.backgroundUrl ? `url("${config.backgroundUrl}")` : 'none' }} onDoubleClick={addField}>{config.fields.filter((item) => item.visible).map((item) => <button key={item.id} className={item.id === selectedField ? 'certificate-field selected' : 'certificate-field'} style={{ left: item.x, top: item.y, width: item.w, height: item.h, opacity: item.opacity, transform: `translate(-50%,-50%) rotate(${item.rotation || 0}deg)`, color: item.color, fontFamily: `'${item.family || config.fontFamily}', Arial, sans-serif`, fontSize: item.size, fontWeight: item.weight, textAlign: item.align, direction: item.direction || 'ltr' }} onPointerDown={(event) => { event.preventDefault(); setSelectedField(item.id); drag.current = { id: item.id, startX: item.x, startY: item.y, pointerX: event.clientX, pointerY: event.clientY }; }}><span>{candidateValue(item, candidate)}</span></button>)}</div></div><div className="preview-footer"><span>Drag zones directly on the certificate. Double-click to add a new text zone.</span><button className="secondary-button" onClick={savePreset}>Save this configuration</button></div></div>
    <div className="panel saved-presets-panel"><div className="panel-heading"><div><span className="eyebrow">SAVED PRESETS</span><h2>Reusable designs</h2></div></div>{presets.length ? <div className="saved-presets">{presets.map((item) => <div key={item.id}><span className="preset-swatch" style={{ background: item.config?.primaryColor || '#bd001c' }} /><span><strong>{item.name}</strong><small>{item.belt || 'All groups'}</small></span><button className="preset-load" onClick={() => loadPreset(item)}>Load</button><button className="preset-delete" onClick={() => onDeletePreset(item)}>Delete</button></div>)}</div> : <div className="empty-state">Save your first full editor preset.</div>}</div>
  </section>;
}
