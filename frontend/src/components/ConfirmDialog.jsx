import React, { useState } from 'react';

export default function ConfirmDialog({ dialog, onClose }) {
  const [busy, setBusy] = useState(false);
  if (!dialog) return null;

  async function confirm() {
    setBusy(true);
    try {
      await dialog.onConfirm();
    } finally {
      setBusy(false);
      onClose();
    }
  }

  return <div className="confirm-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <div className="confirm-card" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <div className={`confirm-icon ${dialog.danger ? 'danger' : ''}`}>{dialog.danger ? '!' : '?'}</div>
      <div className="confirm-card-head">
        <div><h2 id="confirm-title">{dialog.title}</h2><p>{dialog.message}</p></div>
        <button className="confirm-close" onClick={onClose} disabled={busy} aria-label="Close">×</button>
      </div>
      <div className="confirm-actions">
        <button className="secondary-button" onClick={onClose} disabled={busy}>Cancel</button>
        <button className={dialog.danger ? 'danger-button' : 'primary-button'} onClick={confirm} disabled={busy}>{busy ? 'Working…' : dialog.confirmLabel || 'Confirm'}</button>
      </div>
    </div>
  </div>;
}
