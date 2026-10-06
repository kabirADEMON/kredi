import { Sparkles } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { Alert, Button, Field, Logo } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { normalizePhone } from '../lib/format';
import { useHealth, useMe, useSignedIn } from '../lib/session';
import type { Merchant } from '../lib/types';

const pinProps = {
  inputMode: 'numeric' as const,
  maxLength: 4,
  type: 'password',
  className: 'input-pin',
  pattern: '\\d{4}',
};

function useAfterSignIn() {
  const signedIn = useSignedIn();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  return (merchant: Merchant) => {
    signedIn(merchant);
    const back = params.get('retour');
    navigate(back?.startsWith('/app') ? back : '/app', { replace: true });
  };
}

export function DemoButton() {
  const health = useHealth();
  const after = useAfterSignIn();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!health.data?.demo) return null;
  return (
    <>
      {error ? <Alert>{error}</Alert> : null}
      <Button
        type="button"
        variant="secondary"
        block
        loading={loading}
        onClick={async () => {
          setLoading(true);
          try {
            after((await api.post<{ merchant: Merchant }>('/auth/demo')).merchant);
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Erreur');
            setLoading(false);
          }
        }}
      >
        <Sparkles size={18} /> Essayer avec une boutique d’exemple
      </Button>
    </>
  );
}

function AuthLayout({ title, lead, children }: { title: string; lead: string; children: React.ReactNode }) {
  const me = useMe();
  if (me.data) return <Navigate to="/app" replace />;
  return (
    <main className="auth">
      <div className="auth__card">
        <Link to="/" className="auth__brand">
          <Logo /> Kredi
        </Link>
        <h1>{title}</h1>
        <p className="auth__lead">{lead}</p>
        {children}
      </div>
    </main>
  );
}

export function Login() {
  const after = useAfterSignIn();
  const [phone, setPhone] = useState('');
  const [pin, setPin] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const normalized = normalizePhone(phone);
    if (!normalized) return setErrors({ phone: 'Numéro béninois invalide (ex. 01 97 12 34 56).' });
    setLoading(true);
    try {
      after((await api.post<{ merchant: Merchant }>('/auth/login', { phone: normalized, pin })).merchant);
    } catch (err) {
      setErrors(
        err instanceof ApiError ? (Object.keys(err.fields).length ? err.fields : { _: err.message }) : { _: 'Erreur' },
      );
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="Content de vous revoir" lead="Connectez-vous avec votre numéro et votre code PIN.">
      <form className="form" onSubmit={submit} noValidate>
        {errors._ ? <Alert>{errors._}</Alert> : null}
        <Field
          label="Numéro de téléphone"
          prefix="+229"
          inputMode="tel"
          autoComplete="tel-national"
          placeholder="01 97 12 34 56"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          error={errors.phone}
          autoFocus
        />
        <Field
          label="Code PIN"
          autoComplete="current-password"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
          error={errors.pin}
          {...pinProps}
        />
        <Button type="submit" block loading={loading} disabled={pin.length !== 4 || !phone}>
          Se connecter
        </Button>
      </form>
      <div className="divider">ou</div>
      <DemoButton />
      <p className="auth__foot">
        Pas encore de carnet ? <Link to="/inscription">Créer mon carnet</Link>
      </p>
    </AuthLayout>
  );
}

export function Register() {
  const after = useAfterSignIn();
  const [form, setForm] = useState({ shopName: '', ownerName: '', phone: '', pin: '', confirm: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({
      ...f,
      [key]: key === 'pin' || key === 'confirm' ? e.target.value.replace(/\D/g, '') : e.target.value,
    }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (form.shopName.trim().length < 2) next.shopName = 'Indiquez le nom de votre boutique.';
    if (form.ownerName.trim().length < 2) next.ownerName = 'Indiquez votre nom.';
    if (!normalizePhone(form.phone)) next.phone = 'Numéro béninois invalide (ex. 01 97 12 34 56).';
    if (form.pin.length !== 4) next.pin = 'Le code PIN fait 4 chiffres.';
    else if (form.pin !== form.confirm) next.confirm = 'Les deux codes ne sont pas identiques.';
    setErrors(next);
    if (Object.keys(next).length) return;
    setLoading(true);
    try {
      const res = await api.post<{ merchant: Merchant }>('/auth/register', {
        shopName: form.shopName,
        ownerName: form.ownerName,
        phone: normalizePhone(form.phone),
        pin: form.pin,
      });
      after(res.merchant);
    } catch (err) {
      setErrors(
        err instanceof ApiError ? (Object.keys(err.fields).length ? err.fields : { _: err.message }) : { _: 'Erreur' },
      );
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="Créer mon carnet" lead="Gratuit, sans email. Votre numéro et un code à 4 chiffres suffisent.">
      <form className="form" onSubmit={submit} noValidate>
        {errors._ ? <Alert>{errors._}</Alert> : null}
        <Field
          label="Nom de la boutique"
          placeholder="Ex. Boutique Sika"
          value={form.shopName}
          onChange={set('shopName')}
          error={errors.shopName}
          autoComplete="organization"
          maxLength={80}
          autoFocus
        />
        <Field
          label="Votre nom"
          placeholder="Ex. Sika Mensah"
          value={form.ownerName}
          onChange={set('ownerName')}
          error={errors.ownerName}
          autoComplete="name"
          maxLength={80}
        />
        <Field
          label="Numéro de téléphone"
          prefix="+229"
          inputMode="tel"
          autoComplete="tel-national"
          placeholder="01 97 12 34 56"
          value={form.phone}
          onChange={set('phone')}
          error={errors.phone}
        />
        <Field
          label="Choisissez un code PIN"
          hint="4 chiffres, pas 1234 ni 0000."
          autoComplete="new-password"
          value={form.pin}
          onChange={set('pin')}
          error={errors.pin}
          {...pinProps}
        />
        <Field
          label="Confirmez le code PIN"
          autoComplete="new-password"
          value={form.confirm}
          onChange={set('confirm')}
          error={errors.confirm}
          {...pinProps}
        />
        <Button type="submit" block loading={loading}>
          Créer mon carnet
        </Button>
      </form>
      <p className="auth__foot">
        Déjà un carnet ? <Link to="/connexion">Se connecter</Link>
      </p>
    </AuthLayout>
  );
}
