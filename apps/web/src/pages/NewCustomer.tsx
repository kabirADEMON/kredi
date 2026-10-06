import { ArrowLeft, Contact } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useToast } from '../components/Toast';
import { Alert, Button, Field } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { normalizePhone } from '../lib/format';
import { useCustomerMutation } from '../lib/queries';
import type { CustomerDetail } from '../lib/types';

type ContactsManager = {
  select: (props: string[], opts: { multiple: boolean }) => Promise<{ name?: string[]; tel?: string[] }[]>;
};

export function NewCustomer() {
  const navigate = useNavigate();
  const toast = useToast();
  const [params] = useSearchParams();
  const [name, setName] = useState(params.get('nom') ?? '');
  const [phone, setPhone] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const create = useCustomerMutation((body: { name: string; phone: string | null }) =>
    api.post<CustomerDetail>('/customers', body),
  );

  // Sur Android (Chrome), on peut piocher directement dans le répertoire du téléphone.
  const contacts = (navigator as Navigator & { contacts?: ContactsManager }).contacts;
  const pickContact = async () => {
    try {
      const [picked] = await contacts!.select(['name', 'tel'], { multiple: false });
      if (picked?.name?.[0]) setName(picked.name[0]);
      if (picked?.tel?.[0]) setPhone(picked.tel[0]);
    } catch {
      // Sélection annulée.
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (name.trim().length < 2) next.name = 'Indiquez au moins 2 lettres.';
    if (phone.trim() && !normalizePhone(phone)) next.phone = 'Numéro béninois invalide (ex. 01 97 12 34 56).';
    setErrors(next);
    if (Object.keys(next).length) return;
    try {
      const detail = await create.mutateAsync({
        name: name.trim(),
        phone: phone.trim() ? normalizePhone(phone) : null,
      });
      toast(`${detail.customer.name} ajouté`);
      navigate(`/app/clients/${detail.customer.id}?saisie=credit`, { replace: true });
    } catch (err) {
      if (err instanceof ApiError) setErrors(err.fields.phone || err.fields.name ? err.fields : { _: err.message });
    }
  };

  return (
    <>
      <header className="topbar">
        <Link to="/app/clients" className="btn btn--ghost btn--icon" aria-label="Retour">
          <ArrowLeft size={22} />
        </Link>
        <div className="topbar__title">Nouveau client</div>
      </header>
      <main className="page">
        <form className="form card card--pad" onSubmit={submit} noValidate>
          {errors._ ? <Alert>{errors._}</Alert> : null}
          {contacts ? (
            <Button type="button" variant="secondary" onClick={pickContact}>
              <Contact size={18} /> Choisir dans mes contacts
            </Button>
          ) : null}
          <Field
            label="Nom du client"
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={errors.name}
            autoComplete="off"
            autoFocus
            placeholder="Ex. Afi Houngbo"
            maxLength={80}
          />
          <Field
            label="Numéro WhatsApp"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            error={errors.phone}
            inputMode="tel"
            autoComplete="off"
            prefix="+229"
            placeholder="01 97 12 34 56"
            hint="Facultatif, mais nécessaire pour relancer sur WhatsApp."
          />
          <Button type="submit" block loading={create.isPending}>
            Ajouter le client
          </Button>
        </form>
      </main>
    </>
  );
}
