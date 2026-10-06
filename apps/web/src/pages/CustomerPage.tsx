import {
  Archive,
  ArchiveRestore,
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  EllipsisVertical,
  Link2,
  MessageCircle,
  Pencil,
  RefreshCw,
  Smartphone,
  Undo2,
} from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useOutletContext, useParams, useSearchParams } from 'react-router';
import { AmountInput } from '../components/AmountInput';
import { Sheet } from '../components/Sheet';
import { useToast } from '../components/Toast';
import { Alert, Avatar, Button, Field, Skeleton } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { addDays, dueLabel, money, normalizePhone, phone as formatPhone, today, when } from '../lib/format';
import { useCustomer, useCustomerMutation } from '../lib/queries';
import type { CustomerDetail, Entry, Merchant } from '../lib/types';
import { reminderMessage, statementUrl, whatsappLink } from '../lib/whatsapp';

type Panel =
  | { kind: 'credit' }
  | { kind: 'payment' }
  | { kind: 'reverse'; entry: Entry }
  | { kind: 'edit' }
  | { kind: 'share' }
  | null;

export function CustomerPage() {
  const { id = '' } = useParams();
  const merchant = useOutletContext<Merchant>();
  const query = useCustomer(id);
  const [params, setParams] = useSearchParams();
  const [panel, setPanel] = useState<Panel>(null);
  const [menu, setMenu] = useState(false);
  const toast = useToast();

  // « ?saisie=credit » : arrivée depuis le bouton + ou depuis la création du client.
  useEffect(() => {
    const action = params.get('saisie');
    if (query.data && (action === 'credit' || action === 'payment')) {
      setPanel({ kind: action });
      setParams({}, { replace: true });
    }
  }, [params, query.data, setParams]);

  const archive = useCustomerMutation((archived: boolean) =>
    api.post<CustomerDetail>(`/customers/${id}/archive`, { archived }),
  );
  const rotate = useCustomerMutation(() => api.post<CustomerDetail>(`/customers/${id}/share-link`));

  if (query.isError) {
    return (
      <main className="page" style={{ paddingTop: 24 }}>
        <Alert>
          {query.error instanceof ApiError && query.error.status === 404
            ? 'Ce client n’existe pas ou plus.'
            : query.error.message}
        </Alert>
        <Link to="/app/clients" className="btn btn--secondary" style={{ marginTop: 16 }}>
          Retour aux clients
        </Link>
      </main>
    );
  }

  const detail = query.data;
  const c = detail?.customer;

  return (
    <>
      <header className="topbar">
        <Link to="/app/clients" className="btn btn--ghost btn--icon" aria-label="Retour aux clients">
          <ArrowLeft size={22} />
        </Link>
        <div className="topbar__title" />
        {c ? (
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              className="btn btn--ghost btn--icon"
              aria-label="Plus d’actions"
              aria-expanded={menu}
              onClick={() => setMenu((m) => !m)}
            >
              <EllipsisVertical size={22} />
            </button>
            {menu ? (
              <div className="menu" role="menu" onMouseLeave={() => setMenu(false)}>
                <button type="button" role="menuitem" onClick={() => (setMenu(false), setPanel({ kind: 'edit' }))}>
                  <Pencil size={18} /> Modifier le client
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={async () => {
                    setMenu(false);
                    await rotate.mutateAsync();
                    toast('Nouveau lien créé, l’ancien ne marche plus');
                  }}
                >
                  <RefreshCw size={18} /> Renouveler le lien du relevé
                </button>
                <button
                  type="button"
                  role="menuitem"
                  data-danger={!c.archived}
                  onClick={async () => {
                    setMenu(false);
                    try {
                      await archive.mutateAsync(!c.archived);
                      toast(c.archived ? 'Client réactivé' : 'Client archivé');
                    } catch (err) {
                      toast(err instanceof Error ? err.message : 'Action impossible');
                    }
                  }}
                >
                  {c.archived ? <ArchiveRestore size={18} /> : <Archive size={18} />}
                  {c.archived ? 'Réactiver le client' : 'Archiver le client'}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </header>

      <main className="page">
        {!detail || !c ? (
          <>
            <Skeleton height={120} />
            <Skeleton height={150} style={{ marginTop: 12 }} />
          </>
        ) : (
          <>
            <section className="profile">
              <Avatar name={c.name} />
              <h1>{c.name}</h1>
              <p className="muted">{c.phone ? `+229 ${formatPhone(c.phone)}` : 'Pas de numéro'}</p>
              {c.archived ? <span className="badge badge--neutral">Archivé</span> : null}
            </section>

            <section className="card balance-card" aria-label="Solde">
              <p className="balance-card__label">{c.balance < 0 ? 'Avance du client' : 'Doit'}</p>
              <p
                className={`balance-card__amount num ${c.balance <= 0 ? 'balance-card__amount--zero' : ''}`}
                data-testid="balance"
              >
                {money(Math.abs(c.balance))}
              </p>
              <div className="balance-card__meta">
                {c.overdueAmount > 0 ? (
                  <span className="badge badge--late">{money(c.overdueAmount)} en retard</span>
                ) : null}
                {c.nextDueDate ? (
                  <span className="badge badge--neutral">Prochaine échéance : {dueLabel(c.nextDueDate)}</span>
                ) : null}
                {c.balance === 0 && detail.entries.length > 0 ? (
                  <span className="badge badge--ok">Tout est remboursé</span>
                ) : null}
              </div>
            </section>

            <div className="actions">
              <button
                type="button"
                className="action"
                disabled={c.archived}
                onClick={() => setPanel({ kind: 'credit' })}
              >
                <span className="action__icon entry__icon--credit">
                  <ArrowUpRight size={20} />
                </span>
                Crédit
              </button>
              <button
                type="button"
                className="action"
                disabled={c.archived || c.balance <= 0}
                onClick={() => setPanel({ kind: 'payment' })}
              >
                <span className="action__icon entry__icon--payment">
                  <ArrowDownLeft size={20} />
                </span>
                Rembourse
              </button>
              <a
                className="action"
                href={whatsappLink(c.phone, reminderMessage(merchant, detail))}
                target="_blank"
                rel="noreferrer"
                aria-disabled={c.balance <= 0}
                onClick={(e) => c.balance <= 0 && e.preventDefault()}
                style={c.balance <= 0 ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}
              >
                <span className="action__icon" style={{ background: '#1fa85522', color: '#1fa855' }}>
                  <MessageCircle size={20} />
                </span>
                Relancer
              </a>
              <button type="button" className="action" onClick={() => setPanel({ kind: 'share' })}>
                <span className="action__icon" style={{ background: 'var(--surface-2)', color: 'var(--ink)' }}>
                  <Link2 size={20} />
                </span>
                Relevé
              </button>
            </div>

            <h2 className="section-title">
              Historique
              <span className="num" style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 600 }}>
                {money(detail.totals.totalCredit)} prêtés · {money(detail.totals.totalPaid)} rendus
              </span>
            </h2>
            {detail.entries.length === 0 ? (
              <div className="card">
                <div className="empty">
                  <p>Aucune opération. Notez le premier crédit de {c.name.split(/\s+/)[0]}.</p>
                  <Button onClick={() => setPanel({ kind: 'credit' })} disabled={c.archived}>
                    <ArrowUpRight size={18} /> Noter un crédit
                  </Button>
                </div>
              </div>
            ) : (
              <ul className="list card" aria-label="Historique des opérations">
                {detail.entries.map((e) => (
                  <EntryRow
                    key={e.id}
                    entry={e}
                    entries={detail.entries}
                    onReverse={() => setPanel({ kind: 'reverse', entry: e })}
                  />
                ))}
              </ul>
            )}
          </>
        )}
      </main>

      {detail && panel?.kind === 'credit' ? (
        <EntrySheet type="credit" detail={detail} onClose={() => setPanel(null)} />
      ) : null}
      {detail && panel?.kind === 'payment' ? (
        <EntrySheet type="payment" detail={detail} onClose={() => setPanel(null)} />
      ) : null}
      {detail && panel?.kind === 'reverse' ? <ReverseSheet entry={panel.entry} onClose={() => setPanel(null)} /> : null}
      {detail && panel?.kind === 'edit' ? <EditSheet detail={detail} onClose={() => setPanel(null)} /> : null}
      {detail && panel?.kind === 'share' ? (
        <ShareSheet detail={detail} merchant={merchant} onClose={() => setPanel(null)} />
      ) : null}
    </>
  );
}

function EntryRow({ entry: e, entries, onReverse }: { entry: Entry; entries: Entry[]; onReverse: () => void }) {
  const target = e.type === 'reversal' ? entries.find((x) => x.id === e.reversesId) : undefined;
  const canReverse = e.type !== 'reversal' && !e.reversed && !e.viaMomo;
  const Icon =
    e.type === 'credit'
      ? ArrowUpRight
      : e.type === 'payment'
        ? e.method === 'momo'
          ? Smartphone
          : ArrowDownLeft
        : Undo2;
  const title =
    e.type === 'credit'
      ? 'Crédit'
      : e.type === 'payment'
        ? e.method === 'momo'
          ? 'Remboursement Mobile Money'
          : 'Remboursement en espèces'
        : `Annulation d’un ${target?.type === 'credit' ? 'crédit' : 'remboursement'}`;

  return (
    <li className={`entry ${e.reversed ? 'entry--reversed' : ''}`} data-testid="entry">
      <span className={`entry__icon entry__icon--${e.type}`} aria-hidden="true">
        <Icon size={18} />
      </span>
      <div className="entry__main">
        <div className="entry__title">{title}</div>
        {e.note ? <div className="entry__note">{e.note}</div> : null}
        <div className="entry__meta">
          <span>{when(e.createdAt)}</span>
          {e.type === 'credit' && e.dueDate ? <span>Échéance : {dueLabel(e.dueDate)}</span> : null}
          {e.reversed ? <span className="badge badge--neutral">Annulé</span> : null}
          {e.viaMomo ? <span className="badge badge--momo">Payé en ligne</span> : null}
        </div>
      </div>
      <div className="entry__end">
        <div className={`entry__amount num entry__amount--${e.type}`}>
          {e.type === 'credit' ? '+' : e.type === 'payment' ? '−' : ''}
          {money(e.amount)}
        </div>
        <div className="entry__after num">Solde {money(e.balanceAfter)}</div>
        {canReverse ? (
          <button type="button" className="btn btn--ghost btn--sm" style={{ marginRight: -10 }} onClick={onReverse}>
            Annuler
          </button>
        ) : null}
      </div>
    </li>
  );
}

const DUE_CHOICES = [
  { label: 'Sans date', days: null },
  { label: '1 semaine', days: 7 },
  { label: '2 semaines', days: 14 },
  { label: '1 mois', days: 30 },
] as const;

function EntrySheet({
  type,
  detail,
  onClose,
}: {
  type: 'credit' | 'payment';
  detail: CustomerDetail;
  onClose: () => void;
}) {
  const c = detail.customer;
  const toast = useToast();
  const [amount, setAmount] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [method, setMethod] = useState<'cash' | 'momo'>('cash');
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>();
  const mutation = useCustomerMutation((body: object) => api.post<CustomerDetail>(`/customers/${c.id}/entries`, body));
  const firstName = c.name.split(/\s+/)[0];
  const quick = type === 'credit' ? [500, 1_000, 2_000, 5_000, 10_000] : [];

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!amount) return setFieldError('Indiquez un montant.');
    if (type === 'payment' && amount > c.balance) return setFieldError(`${firstName} ne doit que ${money(c.balance)}.`);
    setFieldError(undefined);
    try {
      await mutation.mutateAsync(type === 'credit' ? { type, amount, note, dueDate } : { type, amount, note, method });
      toast(type === 'credit' ? `Crédit de ${money(amount)} noté` : `Remboursement de ${money(amount)} noté`);
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.fields.amount) setFieldError(err.fields.amount);
      else setError(err instanceof Error ? err.message : 'Erreur');
    }
  };

  return (
    <Sheet title={type === 'credit' ? `Crédit pour ${firstName}` : `${firstName} rembourse`} onClose={onClose}>
      <form className="form" onSubmit={submit} noValidate>
        {error ? <Alert>{error}</Alert> : null}
        <AmountInput label="Montant en francs CFA" value={amount} onChange={setAmount} error={fieldError} autoFocus />
        {type === 'credit' ? (
          <div className="chips" style={{ justifyContent: 'center' }}>
            {quick.map((v) => (
              <button key={v} type="button" className="chip num" onClick={() => setAmount((a) => (a ?? 0) + v)}>
                +{money(v)}
              </button>
            ))}
          </div>
        ) : (
          <div className="chips" style={{ justifyContent: 'center' }}>
            <button
              type="button"
              className="chip"
              aria-pressed={amount === c.balance}
              onClick={() => setAmount(c.balance)}
            >
              Tout ({money(c.balance)})
            </button>
            {c.balance >= 2_000 ? (
              <button
                type="button"
                className="chip"
                aria-pressed={amount === Math.round(c.balance / 2)}
                onClick={() => setAmount(Math.round(c.balance / 2))}
              >
                La moitié
              </button>
            ) : null}
          </div>
        )}

        <Field
          label={type === 'credit' ? 'Ce qu’il a pris (facultatif)' : 'Note (facultatif)'}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={140}
          placeholder={type === 'credit' ? 'Ex. 2 sacs de riz' : ''}
          autoComplete="off"
        />

        {type === 'credit' ? (
          <div className="field">
            <span className="field__label">À rembourser dans</span>
            <div className="chips" role="group" aria-label="Échéance">
              {DUE_CHOICES.map((choice) => {
                const value = choice.days === null ? null : addDays(today(), choice.days);
                return (
                  <button
                    key={choice.label}
                    type="button"
                    className="chip"
                    aria-pressed={dueDate === value}
                    onClick={() => setDueDate(value)}
                  >
                    {choice.label}
                  </button>
                );
              })}
            </div>
            {dueDate ? <p className="field__hint">Échéance : {dueLabel(dueDate)}</p> : null}
          </div>
        ) : (
          <div className="field">
            <span className="field__label">Payé en</span>
            <div className="segmented" role="group" aria-label="Moyen de paiement">
              <button type="button" aria-pressed={method === 'cash'} onClick={() => setMethod('cash')}>
                Espèces
              </button>
              <button type="button" aria-pressed={method === 'momo'} onClick={() => setMethod('momo')}>
                Mobile Money
              </button>
            </div>
          </div>
        )}

        <Button type="submit" block loading={mutation.isPending}>
          {type === 'credit' ? 'Noter le crédit' : 'Noter le remboursement'}
          {amount ? ` de ${money(amount)}` : ''}
        </Button>
      </form>
    </Sheet>
  );
}

function ReverseSheet({ entry, onClose }: { entry: Entry; onClose: () => void }) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const mutation = useCustomerMutation((body: object) =>
    api.post<CustomerDetail>(`/entries/${entry.id}/reverse`, body),
  );

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await mutation.mutateAsync({ reason });
      toast('Opération annulée');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    }
  };

  return (
    <Sheet title="Annuler cette opération ?" onClose={onClose}>
      <form className="form" onSubmit={submit}>
        {error ? <Alert>{error}</Alert> : null}
        <p className="muted">
          Le {entry.type === 'credit' ? 'crédit' : 'remboursement'} de{' '}
          <strong className="num">{money(entry.amount)}</strong> restera visible, barré, dans l’historique : rien n’est
          jamais effacé du carnet.
        </p>
        <Field
          label="Raison (facultatif)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={140}
          placeholder="Ex. erreur de montant"
          autoComplete="off"
        />
        <Button type="submit" variant="danger" block loading={mutation.isPending}>
          <Undo2 size={18} /> Annuler l’opération
        </Button>
        <Button type="button" variant="ghost" block onClick={onClose}>
          Garder
        </Button>
      </form>
    </Sheet>
  );
}

function EditSheet({ detail, onClose }: { detail: CustomerDetail; onClose: () => void }) {
  const c = detail.customer;
  const toast = useToast();
  const [name, setName] = useState(c.name);
  const [phone, setPhone] = useState(c.phone ? formatPhone(c.phone) : '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const mutation = useCustomerMutation((body: object) => api.patch<CustomerDetail>(`/customers/${c.id}`, body));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (name.trim().length < 2) next.name = 'Indiquez au moins 2 lettres.';
    if (phone.trim() && !normalizePhone(phone)) next.phone = 'Numéro béninois invalide.';
    setErrors(next);
    if (Object.keys(next).length) return;
    try {
      await mutation.mutateAsync({ name: name.trim(), phone: phone.trim() ? normalizePhone(phone) : null });
      toast('Client modifié');
      onClose();
    } catch (err) {
      if (err instanceof ApiError) setErrors(Object.keys(err.fields).length ? err.fields : { _: err.message });
    }
  };

  return (
    <Sheet title="Modifier le client" onClose={onClose}>
      <form className="form" onSubmit={submit} noValidate>
        {errors._ ? <Alert>{errors._}</Alert> : null}
        <Field label="Nom" value={name} onChange={(e) => setName(e.target.value)} error={errors.name} maxLength={80} />
        <Field
          label="Numéro WhatsApp"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          error={errors.phone}
          inputMode="tel"
          prefix="+229"
        />
        <Button type="submit" block loading={mutation.isPending}>
          Enregistrer
        </Button>
      </form>
    </Sheet>
  );
}

function ShareSheet({
  detail,
  merchant,
  onClose,
}: {
  detail: CustomerDetail;
  merchant: Merchant;
  onClose: () => void;
}) {
  const toast = useToast();
  const url = statementUrl(detail.customer.shareToken);
  const input = useRef<HTMLInputElement>(null);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      input.current?.select();
      document.execCommand('copy');
    }
    toast('Lien copié');
  };

  return (
    <Sheet title="Relevé du client" onClose={onClose}>
      <div className="form">
        <p className="muted">
          {detail.customer.name.split(/\s+/)[0]} voit son solde, le détail de ce qu’il a pris et peut payer par Mobile
          Money. Le lien ne permet de rien modifier.
        </p>
        <div className="input-wrap">
          <input ref={input} readOnly value={url} aria-label="Lien du relevé" onFocus={(e) => e.target.select()} />
        </div>
        <Button type="button" variant="secondary" block onClick={copy}>
          <Link2 size={18} /> Copier le lien
        </Button>
        <a
          className="btn btn--whatsapp btn--block"
          href={whatsappLink(detail.customer.phone, reminderMessage(merchant, detail))}
          target="_blank"
          rel="noreferrer"
        >
          <MessageCircle size={18} /> Envoyer sur WhatsApp
        </a>
        <a className="btn btn--ghost btn--block" href={url} target="_blank" rel="noreferrer">
          Voir comme le client
        </a>
      </div>
    </Sheet>
  );
}
