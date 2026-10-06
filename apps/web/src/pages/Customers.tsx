import { Search, UserPlus, Users } from 'lucide-react';
import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Avatar, Empty, Skeleton } from '../components/ui';
import { money, relativeDay } from '../lib/format';
import { useCustomers } from '../lib/queries';

const FILTERS = [
  { id: 'tous', label: 'Tous' },
  { id: 'doivent', label: 'Me doivent' },
  { id: 'retard', label: 'En retard' },
  { id: 'archives', label: 'Archivés' },
] as const;
type FilterId = (typeof FILTERS)[number]['id'];

export function Customers() {
  const customers = useCustomers();
  const [params, setParams] = useSearchParams();
  const filter = (FILTERS.find((f) => f.id === params.get('filtre'))?.id ?? 'tous') as FilterId;
  const q = params.get('q') ?? '';

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    const digits = term.replace(/\D/g, '');
    return (customers.data ?? [])
      .filter((c) => (filter === 'archives' ? c.archived : !c.archived))
      .filter((c) => filter !== 'doivent' || c.balance > 0)
      .filter((c) => filter !== 'retard' || c.overdueAmount > 0)
      .filter((c) => !term || c.name.toLowerCase().includes(term) || (digits.length >= 2 && c.phone?.includes(digits)))
      .sort((a, b) => b.overdueAmount - a.overdueAmount || b.balance - a.balance || a.name.localeCompare(b.name, 'fr'));
  }, [customers.data, filter, q]);

  return (
    <>
      <header className="topbar">
        <div className="topbar__title">Clients</div>
        <Link className="btn btn--primary btn--sm" to="/app/clients/nouveau">
          <UserPlus size={16} /> Nouveau
        </Link>
      </header>
      <main className="page">
        <div className="input-wrap">
          <span className="input-wrap__affix" aria-hidden="true">
            <Search size={18} />
          </span>
          <input
            type="search"
            placeholder="Rechercher un nom ou un numéro"
            aria-label="Rechercher un client"
            value={q}
            onChange={(e) => update('q', e.target.value)}
          />
        </div>
        <div className="chips" style={{ margin: '12px 0 14px' }} role="group" aria-label="Filtrer">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              className="chip"
              aria-pressed={filter === f.id}
              onClick={() => update('filtre', f.id === 'tous' ? '' : f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>

        {customers.isPending ? (
          <Skeleton height={300} />
        ) : list.length === 0 ? (
          <div className="card">
            <Empty
              icon={<Users size={26} />}
              title={customers.data?.length ? 'Aucun client ne correspond' : 'Aucun client pour le moment'}
            >
              {customers.data?.length ? (
                <p>Essayez un autre nom ou un autre filtre.</p>
              ) : (
                <Link className="btn btn--primary" to="/app/clients/nouveau">
                  <UserPlus size={18} /> Ajouter un client
                </Link>
              )}
            </Empty>
          </div>
        ) : (
          <ul className="list card" aria-label="Liste des clients">
            {list.map((c) => (
              <li key={c.id}>
                <Link className="row" to={`/app/clients/${c.id}`}>
                  <Avatar name={c.name} />
                  <div className="row__main">
                    <div className="row__title">{c.name}</div>
                    <div className="row__sub">{relativeDay(c.lastActivityAt)}</div>
                  </div>
                  <div className="row__end">
                    {c.balance > 0 ? (
                      <div className="row__amount num">{money(c.balance)}</div>
                    ) : c.balance < 0 ? (
                      <span className="badge badge--ok">Avance {money(-c.balance)}</span>
                    ) : (
                      <span className="badge badge--neutral">À jour</span>
                    )}
                    {c.overdueAmount > 0 ? <span className="badge badge--late">En retard</span> : null}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
