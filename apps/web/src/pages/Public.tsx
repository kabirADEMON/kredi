import { useQuery } from '@tanstack/react-query';
import { ArrowDownLeft, ArrowUpRight, CircleCheck, CircleX, Clock, Phone, ShieldCheck, Smartphone } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { AmountInput } from '../components/AmountInput';
import { Sheet } from '../components/Sheet';
import { Alert, Button, Field, Logo, Skeleton } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { dueLabel, money, when } from '../lib/format';
import type { PaymentStatus, Statement } from '../lib/types';

function PublicFoot() {
  return (
    <p className="public__foot">
      Relevé tenu avec <Link to="/">Kredi</Link>, le carnet de crédit des commerçants.
    </p>
  );
}

// Le relevé que le client ouvre depuis le lien WhatsApp. Lecture seule.
export function PublicStatement() {
  const { token = '' } = useParams();
  const [paying, setPaying] = useState(false);
  const statement = useQuery({
    queryKey: ['statement', token],
    queryFn: () => api.get<Statement>(`/public/statements/${token}`),
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 2,
  });

  if (statement.isError) {
    return (
      <main className="public">
        <div className="status card" style={{ marginTop: 40 }}>
          <span className="status__icon" style={{ background: 'var(--surface-2)' }}>
            <CircleX size={34} />
          </span>
          <h1>Ce lien ne fonctionne plus</h1>
          <p className="muted">Demandez un nouveau lien à la boutique.</p>
        </div>
        <PublicFoot />
      </main>
    );
  }

  const s = statement.data;
  return (
    <main className="public">
      <header className="public__head">
        <Logo />
        <div>
          <div style={{ fontWeight: 700 }}>{s ? s.shop.name : '…'}</div>
          <div className="muted" style={{ fontSize: '0.875rem' }}>
            Relevé de compte
          </div>
        </div>
      </header>

      {!s ? (
        <Skeleton height={220} />
      ) : (
        <>
          <section className="card balance-card">
            <p style={{ fontWeight: 600 }}>Bonjour {s.customer.name.split(/\s+/)[0]},</p>
            <p className="balance-card__label" style={{ marginTop: 10 }}>
              {s.balance > 0 ? 'Vous devez' : s.balance < 0 ? 'Vous avez une avance de' : 'Vous ne devez rien'}
            </p>
            <p
              className={`balance-card__amount num ${s.balance <= 0 ? 'balance-card__amount--zero' : ''}`}
              data-testid="public-balance"
            >
              {money(Math.abs(s.balance))}
            </p>
            <div className="balance-card__meta">
              {s.overdueAmount > 0 ? (
                <span className="badge badge--late">{money(s.overdueAmount)} déjà échus</span>
              ) : null}
              {s.nextDueDate ? (
                <span className="badge badge--neutral">À régler d’ici {dueLabel(s.nextDueDate)}</span>
              ) : null}
            </div>
            {s.balance > 0 ? (
              <div style={{ marginTop: 18 }}>
                <Button block onClick={() => setPaying(true)}>
                  <Smartphone size={18} /> Payer par Mobile Money
                </Button>
              </div>
            ) : null}
            {s.shop.phone ? (
              <a className="btn btn--ghost btn--block" style={{ marginTop: 6 }} href={`tel:+229${s.shop.phone}`}>
                <Phone size={16} /> Appeler {s.shop.ownerName.split(/\s+/)[0]}
              </a>
            ) : null}
          </section>

          <h2 className="section-title">Détail</h2>
          <ul className="list card">
            {s.entries.length === 0 ? (
              <li className="empty">
                <p>Aucune opération pour le moment.</p>
              </li>
            ) : (
              s.entries.map((e) => (
                <li className="entry" key={e.id}>
                  <span className={`entry__icon entry__icon--${e.type}`} aria-hidden="true">
                    {e.type === 'credit' ? <ArrowUpRight size={18} /> : <ArrowDownLeft size={18} />}
                  </span>
                  <div className="entry__main">
                    <div className="entry__title">
                      {e.type === 'credit'
                        ? 'Achat à crédit'
                        : e.method === 'momo'
                          ? 'Paiement Mobile Money'
                          : 'Paiement en espèces'}
                    </div>
                    {e.note ? <div className="entry__note">{e.note}</div> : null}
                    <div className="entry__meta">{when(e.createdAt)}</div>
                  </div>
                  <div className="entry__end">
                    <div className={`entry__amount num entry__amount--${e.type}`}>
                      {e.type === 'credit' ? '+' : '−'}
                      {money(e.amount)}
                    </div>
                    <div className="entry__after num">Solde {money(e.balanceAfter)}</div>
                  </div>
                </li>
              ))
            )}
          </ul>
          <p
            className="public__foot"
            style={{ display: 'flex', gap: 6, justifyContent: 'center', alignItems: 'center' }}
          >
            <ShieldCheck size={14} aria-hidden="true" /> Les opérations ne peuvent pas être effacées, seulement
            annulées.
          </p>
        </>
      )}
      <PublicFoot />
      {s && paying ? <PaySheet token={token} statement={s} onClose={() => setPaying(false)} /> : null}
    </main>
  );
}

function PaySheet({ token, statement, onClose }: { token: string; statement: Statement; onClose: () => void }) {
  const [amount, setAmount] = useState<number | null>(statement.balance);
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(false);
  const min = statement.payment.minAmount;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!amount || amount < min || amount > statement.balance) {
      return setError(`Entre ${money(min)} et ${money(statement.balance)}.`);
    }
    setLoading(true);
    try {
      const res = await api.post<{ url: string }>(`/public/statements/${token}/payments`, { amount });
      window.location.assign(res.url);
    } catch (err) {
      setError(err instanceof ApiError ? (err.fields.amount ?? err.message) : 'Erreur');
      setLoading(false);
    }
  };

  return (
    <Sheet title="Payer par Mobile Money" onClose={onClose}>
      <form className="form" onSubmit={submit} noValidate>
        <AmountInput label="Montant à payer" value={amount} onChange={setAmount} error={error} />
        <div className="chips" style={{ justifyContent: 'center' }}>
          <button
            type="button"
            className="chip"
            aria-pressed={amount === statement.balance}
            onClick={() => setAmount(statement.balance)}
          >
            Tout ({money(statement.balance)})
          </button>
        </div>
        <p className="muted" style={{ fontSize: '0.875rem' }}>
          Vous allez être redirigé vers la page de paiement sécurisée{' '}
          {statement.payment.provider === 'fedapay' ? 'FedaPay' : '(simulation)'}. Vous y choisissez votre opérateur :
          MTN MoMo ou Moov Money.
        </p>
        <Button type="submit" block loading={loading}>
          Payer {amount ? money(amount) : ''}
        </Button>
      </form>
    </Sheet>
  );
}

// Retour du client après la page de paiement : on attend la confirmation.
export function PaymentReturn() {
  const { id = '' } = useParams();
  const [startedAt] = useState(() => Date.now());
  const payment = useQuery({
    queryKey: ['payment', id],
    queryFn: () => api.get<PaymentStatus>(`/public/payments/${id}`),
    refetchInterval: (q) => (q.state.data?.status === 'pending' && Date.now() - startedAt < 120_000 ? 2_500 : false),
  });

  const p = payment.data;
  if (payment.isError) {
    return (
      <main className="public">
        <div style={{ marginTop: 40 }}>
          <Alert>Paiement introuvable.</Alert>
        </div>
      </main>
    );
  }
  if (!p) {
    return (
      <main className="auth">
        <span className="spinner" style={{ color: 'var(--brand)', width: 28, height: 28 }} />
      </main>
    );
  }

  const view = {
    approved: {
      icon: <CircleCheck size={38} />,
      bg: 'var(--brand-soft)',
      fg: 'var(--brand)',
      title: 'Paiement reçu, merci !',
      text: `${money(p.amount)} ont été versés à ${p.shopName}.`,
    },
    pending: {
      icon: <Clock size={38} />,
      bg: 'var(--warn-soft)',
      fg: 'var(--warn)',
      title: 'Paiement en cours…',
      text: 'Validez le paiement sur votre téléphone si on vous le demande. Cette page se met à jour toute seule.',
    },
    declined: {
      icon: <CircleX size={38} />,
      bg: 'var(--danger-soft)',
      fg: 'var(--danger)',
      title: 'Paiement refusé',
      text: 'Aucun montant n’a été prélevé. Vous pouvez réessayer.',
    },
    canceled: {
      icon: <CircleX size={38} />,
      bg: 'var(--surface-2)',
      fg: 'var(--muted)',
      title: 'Paiement annulé',
      text: 'Aucun montant n’a été prélevé.',
    },
  }[p.status];

  return (
    <main className="public">
      <div className="status card" style={{ marginTop: 40 }}>
        <span className="status__icon" style={{ background: view.bg, color: view.fg }}>
          {view.icon}
        </span>
        <h1 data-testid="payment-status">{view.title}</h1>
        <p className="muted">{view.text}</p>
        {p.status === 'approved' ? (
          <p className="num" style={{ fontWeight: 600 }}>
            {p.balance > 0 ? `Reste à payer : ${money(p.balance)}` : 'Votre compte est à jour.'}
          </p>
        ) : null}
        <Link className="btn btn--secondary" to={`/c/${p.shareToken}`}>
          Voir mon relevé
        </Link>
      </div>
      <PublicFoot />
    </main>
  );
}

const OPERATORS = [
  { id: 'mtn', label: 'MTN MoMo', color: '#ffcc00' },
  { id: 'moov', label: 'Moov Money', color: '#0066b3' },
];

// Page de paiement simulée (mode démo) : remplace FedaPay quand aucune clé n'est configurée.
export function PaymentSimulation() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [operator, setOperator] = useState('mtn');
  const [number, setNumber] = useState('');
  const [loading, setLoading] = useState<'approved' | 'declined' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const payment = useQuery({
    queryKey: ['payment', id],
    queryFn: () => api.get<PaymentStatus>(`/public/payments/${id}`),
  });

  useEffect(() => {
    if (payment.data && payment.data.status !== 'pending') navigate(`/paiement/${id}`, { replace: true });
  }, [payment.data, id, navigate]);

  const decide = async (outcome: 'approved' | 'declined') => {
    setLoading(outcome);
    try {
      await api.post(`/public/payments/${id}/simulate`, { outcome });
      navigate(`/paiement/${id}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
      setLoading(null);
    }
  };

  const p = payment.data;
  return (
    <main className="public">
      <header className="public__head">
        <Logo />
        <div style={{ fontWeight: 700 }}>Paiement Mobile Money</div>
      </header>
      <Alert tone="warn">Simulation de démonstration : aucun argent réel n’est prélevé.</Alert>
      {!p ? (
        <Skeleton height={300} style={{ marginTop: 14 }} />
      ) : (
        <div className="card card--pad form simulator" style={{ marginTop: 14 }}>
          {error ? <Alert>{error}</Alert> : null}
          <div style={{ textAlign: 'center' }}>
            <p className="muted">
              {p.customerName} → {p.shopName}
            </p>
            <p className="balance-card__amount num">{money(p.amount)}</p>
          </div>
          <div className="operators" role="group" aria-label="Opérateur">
            {OPERATORS.map((o) => (
              <button
                key={o.id}
                type="button"
                className="operator"
                aria-pressed={operator === o.id}
                onClick={() => setOperator(o.id)}
              >
                <span className="operator__dot" style={{ background: o.color }} />
                {o.label}
              </button>
            ))}
          </div>
          <Field
            label="Numéro Mobile Money"
            prefix="+229"
            inputMode="tel"
            placeholder="01 97 12 34 56"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
          />
          <Button block loading={loading === 'approved'} disabled={loading !== null} onClick={() => decide('approved')}>
            Valider le paiement de {money(p.amount)}
          </Button>
          <Button
            variant="ghost"
            block
            loading={loading === 'declined'}
            disabled={loading !== null}
            onClick={() => decide('declined')}
          >
            Simuler un refus
          </Button>
        </div>
      )}
    </main>
  );
}

export function NotFound() {
  return (
    <main className="auth">
      <div className="status">
        <h1>Page introuvable</h1>
        <p className="muted">Le lien est peut-être incomplet.</p>
        <Link className="btn btn--primary" to="/">
          Retour à l’accueil
        </Link>
      </div>
    </main>
  );
}
