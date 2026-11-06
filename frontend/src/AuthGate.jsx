import React, { useEffect, useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import MainStudio from './MainStudio';
import budoBrand from '../../budo_studio.png';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;
const publicApiBase = String(import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');

function friendlyError(error) {
  const message = String(error?.message || error || 'Erreur inconnue.');
  if (/invalid login credentials/i.test(message)) return 'Email ou mot de passe incorrect.';
  if (/email not confirmed/i.test(message)) return 'Confirmez votre adresse email avant de vous connecter.';
  if (/failed to fetch|network/i.test(message)) return 'Connexion impossible. Vérifiez votre réseau puis réessayez.';
  return message;
}

function Icon({ name, size = 18, className = '' }) {
  const paths = {
    check: <path d="m5 12 4 4L19 6" />,
    arrow: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
    shield: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" /><path d="m9 12 2 2 4-4" /></>,
    download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5" /><path d="M12 15V3" /></>,
    copy: <><rect x="8" y="8" width="13" height="13" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></>,
    alert: <><path d="m10.3 3.9-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3.1l-8-14a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4m0 4h.01" /></>,
  };
  return <svg className={`ui-icon ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function LoginPage({ client, onAuthenticated }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const { data, error: signInError } = await client.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) throw signInError;
      onAuthenticated(data.session);
    } catch (signInError) {
      setError(friendlyError(signInError));
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async () => {
    if (!email.trim()) {
      setError('Saisissez votre email pour recevoir un lien de récupération.');
      return;
    }
    setError('');
    setNotice('');
    setResetBusy(true);
    try {
      const redirectTo = `${window.location.origin}${window.location.pathname}?reset-password=1`;
      const { error: resetError } = await client.auth.resetPasswordForEmail(email.trim(), { redirectTo });
      if (resetError) throw resetError;
      setNotice('Un lien de récupération a été envoyé à votre adresse email.');
    } catch (resetError) {
      setError(friendlyError(resetError));
    } finally {
      setResetBusy(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-shell" aria-label="Connexion BUDO Studio">
        <div className="auth-brand-panel">
          <div className="auth-brand"><img className="auth-brand-mark" src={budoBrand} alt="BUDO Studio" /><span><strong>BUDO<span>Studio</span></strong><small>Certificate Designer</small></span></div>
          <div className="auth-hero">
            <span className="auth-eyebrow">SELF DEFENSE BUDO · V3.0</span>
            <h1>Vos diplômes,<br /><em>parfaitement maîtrisés.</em></h1>
            <p>Importez vos candidats, personnalisez chaque modèle et générez vos certificats dans un espace sécurisé.</p>
          </div>
          <div className="auth-feature-list">
            <div><span className="auth-feature-icon"><Icon name="check" size={14} /></span><div><strong>Édition précise</strong><small>Zones, couleurs, polices et effets personnalisables.</small></div></div>
            <div><span className="auth-feature-icon"><Icon name="check" size={14} /></span><div><strong>Données synchronisées</strong><small>Vos candidats et modèles restent liés à votre compte.</small></div></div>
            <div><span className="auth-feature-icon"><Icon name="check" size={14} /></span><div><strong>Export privé</strong><small>Les PDF et ZIP sont générés directement dans votre navigateur.</small></div></div>
          </div>
        </div>
        <div className="auth-form-panel">
          <div className="auth-form-heading"><span className="auth-lock"><Icon name="shield" size={20} /></span><span className="auth-eyebrow">ESPACE SÉCURISÉ</span><h2>Bienvenue</h2><p>Connectez-vous pour accéder à votre studio.</p></div>
          <form className="auth-form" onSubmit={submit}>
            <label>Email professionnel<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="vous@exemple.com" required autoFocus /></label>
            <label>Mot de passe<div className="auth-password"><input type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" placeholder="Votre mot de passe" required /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}>{showPassword ? 'Masquer' : 'Afficher'}</button></div></label>
            {error && <div className="auth-message error" role="alert"><Icon name="alert" size={16} />{error}</div>}
            {notice && <div className="auth-message success" role="status"><Icon name="check" size={16} />{notice}</div>}
            <div className="auth-form-actions"><button className="auth-submit" type="submit" disabled={busy || resetBusy}>{busy ? 'Connexion…' : 'Se connecter'}<Icon name="arrow" size={18} /></button><button className="auth-forgot" type="button" onClick={resetPassword} disabled={busy || resetBusy}>{resetBusy ? 'Envoi…' : 'Mot de passe oublié ?'}</button></div>
          </form>
          <div className="auth-privacy"><Icon name="shield" size={18} /><div><strong>Vos données sont protégées</strong><small>Authentification Supabase · connexion chiffrée</small></div></div>
          <p className="auth-footer">Accès réservé aux utilisateurs autorisés de BUDO Studio.</p>
        </div>
      </section>
    </main>
  );
}

function isPasswordResetRoute() {
  return window.location.search.includes('reset-password') || window.location.hash.includes('reset-password');
}

function ResetPasswordPage({ client, onComplete }) {
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('Utilisez au moins 8 caractères pour votre nouveau mot de passe.');
      return;
    }
    if (password !== confirmation) {
      setError('Les deux mots de passe ne correspondent pas.');
      return;
    }
    setBusy(true);
    try {
      const { error: updateError } = await client.auth.updateUser({ password });
      if (updateError) throw updateError;
      onComplete();
    } catch (updateError) {
      setError(friendlyError(updateError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-shell auth-reset-shell" aria-label="Réinitialisation du mot de passe">
        <div className="auth-brand-panel">
          <div className="auth-brand"><img className="auth-brand-mark" src={budoBrand} alt="BUDO Studio" /><span><strong>BUDO<span>Studio</span></strong><small>Certificate Designer</small></span></div>
          <div className="auth-hero"><span className="auth-eyebrow">ESPACE SÉCURISÉ</span><h1>Un nouveau<br /><em>départ, simplement.</em></h1><p>Choisissez un mot de passe unique pour protéger vos candidats, modèles et exports.</p></div>
        </div>
        <div className="auth-form-panel">
          <div className="auth-form-heading"><span className="auth-lock"><Icon name="shield" size={20} /></span><span className="auth-eyebrow">RÉINITIALISATION</span><h2>Nouveau mot de passe</h2><p>Votre nouveau mot de passe doit contenir au moins 8 caractères.</p></div>
          <form className="auth-form" onSubmit={submit}>
            <label>Nouveau mot de passe<div className="auth-password"><input type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" placeholder="8 caractères minimum" required minLength={8} autoFocus /><button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}>{showPassword ? 'Masquer' : 'Afficher'}</button></div></label>
            <label>Confirmer le mot de passe<input type={showPassword ? 'text' : 'password'} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="new-password" placeholder="Répétez votre mot de passe" required minLength={8} /></label>
            {error && <div className="auth-message error" role="alert"><Icon name="alert" size={16} />{error}</div>}
            <div className="auth-form-actions"><button className="auth-submit" type="submit" disabled={busy}>{busy ? 'Mise à jour…' : 'Enregistrer le mot de passe'}<Icon name="arrow" size={18} /></button></div>
          </form>
          <div className="auth-privacy"><Icon name="shield" size={18} /><div><strong>Votre session de récupération est sécurisée</strong><small>Le lien expire automatiquement après utilisation.</small></div></div>
        </div>
      </section>
    </main>
  );
}

function certificateTokenFromLocation() {
  const params = new URLSearchParams(window.location.search);
  const queryToken = params.get('certificate');
  if (queryToken) return queryToken.trim();
  const hashMatch = window.location.hash.match(/^#\/verify\/([A-Za-z0-9_-]{32,100})$/);
  return hashMatch?.[1] || '';
}

function certificateFieldValue(field, certificate) {
  if (field.source === 'custom') return field.sample || '';
  if (field.source === 'qr' || field.type === 'qr') return '';
  if (field.source === 'kyu') return certificate.kyu ? `${certificate.kyu}ème Kyu` : '';
  if (field.source === 'serial') return certificate.serial || '';
  if (field.source === 'birth') return certificate.birth || '';
  if (field.source === 'examDate') return certificate.examDate || '';
  if (field.source === 'belt') return certificate.belt || '';
  if (field.source === 'obtained') return certificate.obtained || '';
  if (field.source === 'name') return certificate.name || '';
  if (field.source === 'ordinal') return certificate.ordinal || '';
  if (field.source === 'origin') return certificate.origin || '';
  return '';
}

function certificateFieldFontSize(field, value, family) {
  const base = Number(field.size || 30);
  const available = Math.max(12, Number(field.w || 200) - 8);
  const heightLimit = Math.max(8, (Number(field.h || 50) - 4) / 1.12);
  if (field.autoFit === false || !value) return base;
  const context = document.createElement('canvas').getContext('2d');
  if (!context) return base;
  context.font = `${field.italic ? 'italic ' : ''}${field.weight || 400} ${base}px '${family}', 'Amiri', serif`;
  const measured = context.measureText(value).width + (String(value).length - 1) * Number(field.letterSpacing || 0);
  const widthFit = measured > available ? base * available / measured : base;
  return Math.max(8, Math.min(base, widthFit, heightLimit));
}

function CertificateSnapshotPreview({ certificate, snapshot }) {
  return <CertificateSnapshotPreviewExact certificate={certificate} snapshot={snapshot} />;
}

function CertificateSnapshotPreviewExact({ certificate, snapshot, onBackgroundError }) {
  const [qrSources, setQrSources] = useState({});

  useEffect(() => {
    let active = true;
    const qrFields = (snapshot?.fields || []).filter((field) => field.source === 'qr' || field.type === 'qr');
    import('qrcode').then(async (module) => {
      const qr = module.default || module;
      const entries = await Promise.all(qrFields.map(async (field) => {
        const matrix = qr.create(window.location.href, { errorCorrectionLevel: field.qrErrorCorrection || 'H' });
        const margin = Math.min(8, Math.max(1, Number(field.qrMargin) || 2));
        const modules = matrix.modules.size;
        const cell = Math.max(2, Math.floor(320 / (modules + margin * 2)));
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = (modules + margin * 2) * cell;
        const context = canvas.getContext('2d');
        context.fillStyle = field.qrLight || '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = field.qrDark || '#0f172a';
        for (let row = 0; row < modules; row += 1) for (let column = 0; column < modules; column += 1) if (matrix.modules.get(row, column)) {
          const x = (column + margin) * cell;
          const y = (row + margin) * cell;
          if (field.qrShape === 'dots') { context.beginPath(); context.arc(x + cell / 2, y + cell / 2, cell * .42, 0, Math.PI * 2); context.fill(); }
          else context.fillRect(x, y, cell, cell);
        }
        return [field.id, canvas.toDataURL('image/png')];
      }));
      if (active) setQrSources(Object.fromEntries(entries));
    }).catch(() => { if (active) setQrSources({}); });
    return () => { active = false; };
  }, [certificate.id, snapshot]);

  if (!snapshot?.backgroundUrl) return null;
  const size = snapshot.size || { width: 645.75, height: 936.75 };
  const fontFamily = { Mirza: 'Mirza', MirzaImported: 'MirzaImported', Amiri: 'Amiri', Arial: 'Arial', Georgia: 'Georgia', Times: 'Times New Roman', Tahoma: 'Tahoma' };
  return <figure className="public-certificate-snapshot-figure">
    <div className="public-certificate-snapshot" style={{ aspectRatio: `${size.width} / ${size.height}` }}>
      <img className="public-certificate-snapshot-background" src={snapshot.backgroundUrl} alt="" aria-hidden="true" onError={onBackgroundError} />
      <div className="public-certificate-snapshot-fields">
        {(snapshot.fields || []).map((field) => {
          const isQr = field.source === 'qr' || field.type === 'qr';
          const value = certificateFieldValue(field, certificate);
          if (!isQr && !value) return null;
          const align = field.align === 'left' ? 'flex-start' : field.align === 'right' ? 'flex-end' : 'center';
          const style = {
            left: `${(field.x / size.width) * 100}%`, top: `${(field.y / size.height) * 100}%`,
            width: `${(field.w / size.width) * 100}%`, height: `${(field.h / size.height) * 100}%`,
            opacity: field.opacity, boxSizing: 'border-box',
            transform: `translate(-50%, -50%) rotate(${field.rotation || 0}deg)`,
            fontFamily: `'${String(fontFamily[field.family] || field.family || 'Arial').replace(/['"]/g, '')}', Arial, sans-serif`,
            '--qr-dark': field.qrDark || '#0f172a', '--qr-light': field.qrLight || '#ffffff',
          };
          const textStyle = {
            color: field.color || '#0f172a', fontFamily: style.fontFamily,
            fontSize: `${(certificateFieldFontSize(field, value, fontFamily[field.family] || field.family || 'Arial') / size.width) * 100}cqw`,
            fontWeight: field.weight || 400, fontStyle: field.italic ? 'italic' : 'normal',
            letterSpacing: `${(field.letterSpacing || 0) / size.width * 100}cqw`, direction: field.direction || 'rtl',
            justifyContent: align, textAlign: field.align || 'center', filter: `brightness(${field.brightness || 100}%)`,
            textShadow: [field.glow ? `0 0 ${(Number(field.glow) / 100) * 18}px ${field.glowColor || '#ffffff'}` : '', field.shadow ? `0 ${(Number(field.shadow) / 25).toFixed(1)}px ${(Number(field.shadow) / 100) * 10}px ${field.shadowColor || '#000000'}` : ''].filter(Boolean).join(', ') || 'none',
            textDecoration: field.underline ? 'underline' : 'none',
          };
          return <div className={`public-certificate-snapshot-field${isQr ? ' qr' : ''}`} key={field.id} style={style}>
            {isQr ? <div className={`public-certificate-snapshot-qr${field.qrFrame === 'rounded' ? ' rounded' : ''}`}>{qrSources[field.id] && <img src={qrSources[field.id]} alt="Certificate verification QR" />} {field.qrCaption && <small>{field.qrCaption}</small>}</div> : <div className="public-certificate-snapshot-inner" style={textStyle}><span>{value}</span></div>}
          </div>;
        })}
      </div>
    </div>
    <figcaption>Aperçu reconstruit depuis le modèle officiel et les données du certificat.</figcaption>
  </figure>;
}

function CertificatePreview({ certificate }) {
  const [failed, setFailed] = useState(false);
  const [snapshotBackgroundFailed, setSnapshotBackgroundFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
    setSnapshotBackgroundFailed(false);
  }, [certificate.id, certificate.previewUrl, certificate.templateSnapshot?.backgroundUrl]);

  // The saved template snapshot is the source of truth for this certificate.
  // Prefer it over an older uploaded preview so QR dimensions cannot fall
  // back to a previous export.
  if (certificate.templateSnapshot?.backgroundUrl && !snapshotBackgroundFailed) {
    return <CertificateSnapshotPreviewExact certificate={certificate} snapshot={certificate.templateSnapshot} onBackgroundError={() => setSnapshotBackgroundFailed(true)} />;
  }

  if (!certificate.previewUrl || failed) {
    return <div className="public-certificate-preview-placeholder">
      <span>{failed ? 'APERÇU TEMPORAIREMENT INDISPONIBLE' : 'APERÇU DU CERTIFICAT EN PRÉPARATION'}</span>
      <small>{failed ? 'Le certificat reste vérifiable. Réessayez dans quelques instants.' : 'L’organisation émettrice termine la génération de l’image du certificat.'}</small>
    </div>;
  }

  return <figure className="public-certificate-preview-figure">
    <img className="public-certificate-preview" src={certificate.previewUrl} alt={`Aperçu du certificat de ${certificate.name}`} loading="lazy" decoding="async" onError={() => setFailed(true)} />
    <figcaption>Aperçu généré depuis le modèle officiel avec les données émises.</figcaption>
  </figure>;
}

function PublicCertificatePage({ token }) {
  const [state, setState] = useState({ status: 'loading', certificate: null, error: '' });
  const [retry, setRetry] = useState(0);
  const [copyState, setCopyState] = useState('idle');
  const certificate = state.certificate;

  useEffect(() => {
    let active = true;
    fetch(`${publicApiBase}/verify?token=${encodeURIComponent(token)}`, { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Certificat introuvable.');
        return data;
      })
      .then((certificate) => { if (active) setState({ status: 'ready', certificate, error: '' }); })
      .catch((error) => { if (active) setState({ status: 'error', certificate: null, error: error.message }); });
    return () => { active = false; };
  }, [token, retry]);

  const copyVerificationLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopyState('copied');
      window.setTimeout(() => setCopyState('idle'), 2200);
    } catch {
      setCopyState('unavailable');
      window.setTimeout(() => setCopyState('idle'), 2600);
    }
  };

  const issuedDate = certificate?.issuedAt && Number.isFinite(Date.parse(certificate.issuedAt))
    ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date(certificate.issuedAt))
    : '';

  return <main className="public-certificate-page">
    <section className="public-certificate-shell" aria-label="Vérification publique du certificat">
      <header className="public-certificate-header"><img src={budoBrand} alt="" /><span><strong>BUDO<span>Studio</span></strong><small>Vérification officielle des certificats</small></span><span className="public-certificate-issuer">Émetteur officiel</span></header>
      {state.status === 'loading' && <div className="public-certificate-state"><span className="auth-spinner" /><strong>Vérification du certificat…</strong><small>Connexion sécurisée à BUDO Studio</small></div>}
      {state.status === 'error' && <div className="public-certificate-state error"><span className="public-status-icon"><Icon name="alert" size={22} /></span><strong>Vérification impossible</strong><p>{state.error || 'Ce lien est incorrect ou expiré.'}</p><button className="public-certificate-action secondary" type="button" onClick={() => { setState({ status: 'loading', certificate: null, error: '' }); setRetry((value) => value + 1); }}>Réessayer</button></div>}
      {state.status === 'ready' && certificate && <>
        <div className={`public-certificate-status ${certificate.status === 'active' ? 'active' : 'revoked'}`} role="status" aria-live="polite"><Icon name={certificate.status === 'active' ? 'check' : 'alert'} size={18} /><span>{certificate.status === 'active' ? 'Certificat authentique et valide' : 'Certificat révoqué'}</span><small>{certificate.status === 'active' ? 'Référence confirmée par BUDO Studio' : 'Ce certificat n’est plus valide'}</small></div>
        {certificate.status === 'active' ? <>
          <div className="public-certificate-heading"><span className="auth-eyebrow">CERTIFICAT OFFICIEL</span><h1 id="public-certificate-title">{certificate.name}</h1><p>{certificate.belt || 'Grade non renseigné'}{certificate.kyu ? ` · ${certificate.kyu}ème Kyu` : ''}</p></div>
          <div className="public-certificate-actions" aria-label="Actions du certificat"><button className="public-certificate-action primary" type="button" onClick={() => window.print()}><Icon name="download" size={17} /> Imprimer / Enregistrer en PDF</button><button className="public-certificate-action secondary" type="button" onClick={copyVerificationLink}><Icon name="copy" size={16} /> {copyState === 'copied' ? 'Lien copié' : 'Copier le lien public'}</button></div>
          <span className="public-certificate-copy-status" aria-live="polite">{copyState === 'unavailable' ? 'La copie automatique est indisponible sur cet appareil.' : ''}</span>
          <CertificatePreview certificate={certificate} />
          <section className="public-certificate-record" aria-labelledby="public-certificate-record-title"><div className="public-certificate-record-heading"><span className="public-certificate-record-icon"><Icon name="shield" size={18} /></span><span><h2 id="public-certificate-record-title">Détails de vérification</h2><small>Informations confirmées par l’organisation émettrice</small></span></div><dl className="public-certificate-details"><div><dt>N° officiel</dt><dd>{certificate.serial || '—'}</dd></div><div><dt>Date d’examen</dt><dd>{certificate.examDate || '—'}</dd></div><div><dt>Date du grade</dt><dd>{certificate.obtained || '—'}</dd></div>{issuedDate && <div><dt>Date d’émission</dt><dd>{issuedDate}</dd></div>}<div className="verification-code"><dt>Code de vérification</dt><dd>{certificate.publicCode}</dd></div></dl></section>
          <p className="public-certificate-note"><Icon name="shield" size={15} /> Le statut est vérifié en direct auprès de BUDO Studio. Le modèle et les informations visibles sur le diplôme correspondent au certificat émis.</p>
        </> : <div className="public-certificate-revoked-panel" role="status">
          <span className="public-certificate-lock" aria-hidden="true"><Icon name="shield" size={28} /></span>
          <h1 id="public-certificate-title">Certificat verrouillé</h1>
          <p>Ce certificat a été révoqué par l’organisation émettrice et n’est plus considéré comme valide.</p>
          <dl className="public-certificate-revoked-details"><div><dt>Titulaire</dt><dd>{certificate.name}</dd></div><div><dt>Code de vérification</dt><dd>{certificate.publicCode}</dd></div>{certificate.revokedAt && <div><dt>Révoqué le</dt><dd>{new Intl.DateTimeFormat('fr-FR',{dateStyle:'medium'}).format(new Date(certificate.revokedAt))}</dd></div>}</dl>
          <p className="public-certificate-note revoked">Pour vérifier un nouveau certificat, demandez un lien réémis par l’organisation.</p>
        </div>}
      </>}
      <footer className="public-certificate-footer">BUDO Studio · Vérification publique de certificat</footer>
    </section>
  </main>;
}

export default function AuthGate() {
  const certificateToken = useMemo(() => certificateTokenFromLocation(), []);
  if (certificateToken) return <PublicCertificatePage token={certificateToken} />;
  const client = useMemo(() => {
    if (!supabaseUrl || !supabaseKey) return null;
    return createClient(supabaseUrl, supabaseKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  }, []);
  const [status, setStatus] = useState(client ? 'checking' : 'config-error');
  const [session, setSession] = useState(null);
  const [resetRequested, setResetRequested] = useState(() => isPasswordResetRoute());

  useEffect(() => {
    if (!client) return undefined;
    // The legacy studio must use the same authenticated client/session as this
    // gate. Creating a second client can miss the mobile browser session.
    window.BudoAuthClient = client;
    let mounted = true;
    client.auth.getSession().then(({ data, error }) => {
      if (!mounted) return;
      if (error) { setStatus('error'); return; }
      setSession(data.session);
      setStatus(data.session ? 'authenticated' : 'login');
      if (!data.session) window.location.hash = '#/login';
    });
    const { data: listener } = client.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return;
      if (event === 'PASSWORD_RECOVERY') setResetRequested(true);
      setSession(nextSession);
      setStatus(nextSession ? 'authenticated' : 'login');
      if (!nextSession) window.location.hash = '#/login';
    });
    const handleLegacyAuth = (event) => {
      if (event.detail?.session === null) {
        setSession(null);
        setStatus('login');
        window.location.hash = '#/login';
      }
    };
    const handleRouteChange = () => setResetRequested(isPasswordResetRoute());
    window.addEventListener('hashchange', handleRouteChange);
    window.addEventListener('popstate', handleRouteChange);
    window.addEventListener('budo:auth-state', handleLegacyAuth);
    return () => { mounted = false; listener?.subscription?.unsubscribe(); window.removeEventListener('hashchange', handleRouteChange); window.removeEventListener('popstate', handleRouteChange); window.removeEventListener('budo:auth-state', handleLegacyAuth); if (window.BudoAuthClient === client) delete window.BudoAuthClient; };
  }, [client]);

  if (status === 'config-error') return <main className="auth-page"><div className="auth-system-message"><strong>Configuration Supabase manquante</strong><p>Ajoutez VITE_SUPABASE_URL et VITE_SUPABASE_PUBLISHABLE_KEY dans les variables Vercel, puis redéployez.</p></div></main>;
  if (status === 'error') return <main className="auth-page"><div className="auth-system-message"><strong>Connexion Supabase impossible</strong><p>Rechargez la page et vérifiez la configuration du projet.</p><button className="auth-submit" onClick={() => window.location.reload()}>Réessayer</button></div></main>;
  if (status === 'checking') return <main className="auth-page"><div className="auth-loading"><span className="auth-spinner" /><strong>Vérification de votre session…</strong><small>BUDO Studio</small></div></main>;
  if (resetRequested) return <ResetPasswordPage client={client} onComplete={() => { window.history.replaceState({}, '', window.location.pathname); window.location.hash = '#/studio'; setResetRequested(false); setStatus('authenticated'); }} />;
  if (!session) return <LoginPage client={client} onAuthenticated={(nextSession) => { setSession(nextSession); setStatus('authenticated'); window.location.hash = '#/studio'; }} />;
  return <MainStudio authClient={client} />;
}
