import { useQueryClient } from '@tanstack/react-query';
import { Download, KeyRound, LogOut, Store } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate, useOutletContext } from 'react-router';
import { useToast } from '../components/Toast';
import { Alert, Button, Field } from '../components/ui';
import { api, ApiError } from '../lib/api';
import type { Merchant } from '../lib/types';

export function Settings() {
  const merchant = useOutletContext<Merchant>();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const logout = async () => {
    await api.post('/auth/logout').catch(() => undefined);
    qc.clear();
    qc.setQueryData(['me'], null);
    navigate('/', { replace: true });
  };

  return (
    <>
      <header className="topbar">
        <div className="topbar__title">Réglages</div>
      </header>
      <main className="page">
        {merchant.isDemo ? (
          <Alert tone="warn">
            Vous êtes dans une boutique de démonstration. Elle sera effacée dans 24 h. Créez votre propre carnet pour
            garder vos données.
          </Alert>
        ) : null}
        <ProfileForm merchant={merchant} />
        {!merchant.isDemo ? <PinForm /> : null}

        <h2 className="section-title">Données</h2>
        <div className="card card--pad form">
          <p className="muted">Téléchargez la liste de vos clients et de leurs soldes, lisible dans Excel.</p>
          <a className="btn btn--secondary btn--block" href="/api/export/clients.csv" download>
            <Download size={18} /> Exporter mes clients (CSV)
          </a>
        </div>

        <div style={{ marginTop: 24 }}>
          <Button variant="ghost" block onClick={logout}>
            <LogOut size={18} /> Se déconnecter
          </Button>
        </div>
      </main>
    </>
  );
}

function ProfileForm({ merchant }: { merchant: Merchant }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [shopName, setShopName] = useState(merchant.shopName);
  const [ownerName, setOwnerName] = useState(merchant.ownerName);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await api.patch<{ merchant: Merchant }>('/merchant', { shopName, ownerName });
      qc.setQueryData(['me'], res.merchant);
      setErrors({});
      toast('Boutique enregistrée');
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fields);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <h2 className="section-title">
        <span>
          <Store size={14} aria-hidden="true" /> Ma boutique
        </span>
      </h2>
      <form className="card card--pad form" onSubmit={submit} noValidate>
        <Field
          label="Nom de la boutique"
          value={shopName}
          onChange={(e) => setShopName(e.target.value)}
          error={errors.shopName}
          maxLength={80}
        />
        <Field
          label="Votre nom"
          value={ownerName}
          onChange={(e) => setOwnerName(e.target.value)}
          error={errors.ownerName}
          maxLength={80}
        />
        {merchant.phoneDisplay ? (
          <Field label="Numéro de connexion" value={`+229 ${merchant.phoneDisplay}`} readOnly disabled />
        ) : null}
        <Button type="submit" variant="secondary" loading={saving}>
          Enregistrer
        </Button>
      </form>
    </>
  );
}

function PinForm() {
  const toast = useToast();
  const [currentPin, setCurrent] = useState('');
  const [newPin, setNew] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (newPin !== confirm) return setErrors({ confirm: 'Les deux codes ne sont pas identiques.' });
    setSaving(true);
    try {
      await api.post('/merchant/pin', { currentPin, newPin });
      setCurrent('');
      setNew('');
      setConfirm('');
      setErrors({});
      toast('Code PIN changé. Vos autres appareils sont déconnectés.');
    } catch (err) {
      if (err instanceof ApiError) setErrors(Object.keys(err.fields).length ? err.fields : { _: err.message });
    } finally {
      setSaving(false);
    }
  };

  const pinProps = {
    inputMode: 'numeric' as const,
    maxLength: 4,
    type: 'password',
    className: 'input-pin',
    pattern: '\\d{4}',
  };
  return (
    <>
      <h2 className="section-title">
        <span>
          <KeyRound size={14} aria-hidden="true" /> Code PIN
        </span>
      </h2>
      <form className="card card--pad form" onSubmit={submit} noValidate>
        {errors._ ? <Alert>{errors._}</Alert> : null}
        <Field
          label="Code actuel"
          autoComplete="current-password"
          value={currentPin}
          onChange={(e) => setCurrent(e.target.value.replace(/\D/g, ''))}
          error={errors.currentPin}
          {...pinProps}
        />
        <Field
          label="Nouveau code"
          autoComplete="new-password"
          value={newPin}
          onChange={(e) => setNew(e.target.value.replace(/\D/g, ''))}
          error={errors.newPin}
          {...pinProps}
        />
        <Field
          label="Confirmer le nouveau code"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ''))}
          error={errors.confirm}
          {...pinProps}
        />
        <Button
          type="submit"
          variant="secondary"
          loading={saving}
          disabled={currentPin.length !== 4 || newPin.length !== 4}
        >
          Changer le code
        </Button>
      </form>
    </>
  );
}
