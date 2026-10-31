import React, { useEffect, useMemo, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import MainStudio from './MainStudio';
import budoBrand from '../../budo_studio.png';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;

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
      const redirectTo = `${window.location.origin}${window.location.pathname}#/reset-password`;
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

export default function AuthGate() {
  const client = useMemo(() => {
    if (!supabaseUrl || !supabaseKey) return null;
    return createClient(supabaseUrl, supabaseKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  }, []);
  const [status, setStatus] = useState(client ? 'checking' : 'config-error');
  const [session, setSession] = useState(null);

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
    const { data: listener } = client.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
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
    window.addEventListener('budo:auth-state', handleLegacyAuth);
    return () => { mounted = false; listener?.subscription?.unsubscribe(); window.removeEventListener('budo:auth-state', handleLegacyAuth); if (window.BudoAuthClient === client) delete window.BudoAuthClient; };
  }, [client]);

  if (status === 'config-error') return <main className="auth-page"><div className="auth-system-message"><strong>Configuration Supabase manquante</strong><p>Ajoutez VITE_SUPABASE_URL et VITE_SUPABASE_PUBLISHABLE_KEY dans les variables Vercel, puis redéployez.</p></div></main>;
  if (status === 'error') return <main className="auth-page"><div className="auth-system-message"><strong>Connexion Supabase impossible</strong><p>Rechargez la page et vérifiez la configuration du projet.</p><button className="auth-submit" onClick={() => window.location.reload()}>Réessayer</button></div></main>;
  if (status === 'checking') return <main className="auth-page"><div className="auth-loading"><span className="auth-spinner" /><strong>Vérification de votre session…</strong><small>BUDO Studio</small></div></main>;
  if (!session) return <LoginPage client={client} onAuthenticated={(nextSession) => { setSession(nextSession); setStatus('authenticated'); window.location.hash = '#/studio'; }} />;
  return <MainStudio authClient={client} />;
}
