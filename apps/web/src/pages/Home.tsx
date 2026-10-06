import { ArrowDownLeft, ArrowUpRight, BellRing, CalendarClock, Plus, TrendingUp, Undo2, Wallet } from 'lucide-react';
import { Link, useOutletContext } from 'react-router';
import { Avatar, Empty, Skeleton } from '../components/ui';
import { daysLate, money, plural, when } from '../lib/format';
import { useCustomers, useDashboard } from '../lib/queries';
import type { Merchant } from '../lib/types';

export function Home() {
  const merchant = useOutletContext<Merchant>();
  const dashboard = useDashboard();
  const customers = useCustomers();
  const d = dashboard.data;

  const toRemind = (customers.data ?? [])
    .filter((c) => !c.archived && c.overdueAmount > 0)
    .sort((a, b) => (a.oldestOverdueDate ?? '').localeCompare(b.oldestOverdueDate ?? ''))
    .slice(0, 4);

  return (
    <>
      <header className="topbar">
        <div className="topbar__title">{merchant.shopName}</div>
        {merchant.isDemo ? <span className="badge badge--demo">Démo</span> : null}
      </header>
      <main className="page">
        <h1 className="page-title">Bonjour {merchant.ownerName.split(/\s+/)[0]}</h1>

        {!d ? (
          <>
            <Skeleton height={140} />
            <div className="stats">
              <Skeleton height={84} />
              <Skeleton height={84} />
            </div>
          </>
        ) : (
          <>
            <section className="hero-balance" aria-label="Total à récupérer">
              <p className="hero-balance__label">À récupérer</p>
              <p className="hero-balance__amount num" data-testid="total-due">
                {money(d.totalDue)}
              </p>
              <p className="hero-balance__sub">
                {d.debtorsCount === 0
                  ? 'Personne ne vous doit rien.'
                  : `${plural(d.debtorsCount, 'client vous doit', 'clients vous doivent')} de l’argent`}
              </p>
            </section>
            <div className="stats">
              <div className="card stat">
                <p className="stat__label">
                  <CalendarClock size={16} aria-hidden="true" /> En retard
                </p>
                <p
                  className={`stat__value num ${d.overdueAmount > 0 ? 'stat__value--late' : ''}`}
                  data-testid="overdue"
                >
                  {money(d.overdueAmount)}
                </p>
              </div>
              <div className="card stat">
                <p className="stat__label">
                  <TrendingUp size={16} aria-hidden="true" /> Encaissé ce mois
                </p>
                <p className="stat__value stat__value--ok num" data-testid="collected">
                  {money(d.collectedThisMonth)}
                </p>
              </div>
            </div>
          </>
        )}

        {toRemind.length > 0 ? (
          <>
            <h2 className="section-title">
              À relancer <Link to="/app/clients?filtre=retard">Tout voir</Link>
            </h2>
            <ul className="list card">
              {toRemind.map((c) => (
                <li key={c.id}>
                  <Link className="row" to={`/app/clients/${c.id}`}>
                    <Avatar name={c.name} />
                    <div className="row__main">
                      <div className="row__title">{c.name}</div>
                      <div className="row__sub">
                        <BellRing size={12} aria-hidden="true" /> Échu depuis{' '}
                        {plural(daysLate(c.oldestOverdueDate!), 'jour', 'jours')}
                      </div>
                    </div>
                    <div className="row__end">
                      <div className="row__amount num">{money(c.balance)}</div>
                      <span className="badge badge--late num">{money(c.overdueAmount)} en retard</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        ) : null}

        <h2 className="section-title">Dernières opérations</h2>
        {d && d.recent.length === 0 ? (
          <div className="card">
            <Empty icon={<Wallet size={26} />} title="Votre carnet est vide">
              <p>Ajoutez votre premier client, puis notez ce qu’il vous doit.</p>
              <Link className="btn btn--primary" to="/app/clients/nouveau">
                <Plus size={18} /> Ajouter un client
              </Link>
            </Empty>
          </div>
        ) : (
          <ul className="list card">
            {(d?.recent ?? []).map((e) => {
              const Icon = e.type === 'credit' ? ArrowUpRight : e.type === 'payment' ? ArrowDownLeft : Undo2;
              return (
                <li key={e.id}>
                  <Link className="row" to={`/app/clients/${e.customerId}`}>
                    <span className={`entry__icon entry__icon--${e.type}`} aria-hidden="true">
                      <Icon size={18} />
                    </span>
                    <div className="row__main">
                      <div className="row__title">{e.customerName}</div>
                      <div className="row__sub">
                        {e.type === 'credit'
                          ? 'Crédit'
                          : e.type === 'payment'
                            ? e.viaMomo
                              ? 'Paiement Mobile Money'
                              : 'Remboursement'
                            : 'Annulation'}
                        {e.note && e.type === 'credit' ? ` · ${e.note}` : ''} · {when(e.createdAt)}
                      </div>
                    </div>
                    <div className={`row__amount num entry__amount--${e.type}`}>
                      {e.type === 'credit' ? '+' : e.type === 'payment' ? '−' : ''}
                      {money(e.amount)}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </>
  );
}
