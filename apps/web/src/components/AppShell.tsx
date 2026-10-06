import { House, Plus, Search, Settings, UserPlus, Users } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router';
import { money } from '../lib/format';
import { useCustomers } from '../lib/queries';
import type { Merchant } from '../lib/types';
import { Sheet } from './Sheet';
import { Avatar } from './ui';

export function AppShell({ merchant }: { merchant: Merchant }) {
  const [quick, setQuick] = useState(false);
  return (
    <div className="shell">
      <Outlet context={merchant} />
      <nav className="bottomnav" aria-label="Navigation principale">
        <div className="bottomnav__inner">
          <NavItem to="/app" icon={<House size={22} />} label="Accueil" end />
          <NavItem to="/app/clients" icon={<Users size={22} />} label="Clients" />
          <button type="button" className="fab" onClick={() => setQuick(true)} aria-label="Noter une opération">
            <Plus size={28} strokeWidth={2.5} />
          </button>
          <NavItem to="/app/clients/nouveau" icon={<UserPlus size={22} />} label="Nouveau" />
          <NavItem to="/app/reglages" icon={<Settings size={22} />} label="Réglages" />
        </div>
      </nav>
      {quick ? <QuickPick onClose={() => setQuick(false)} /> : null}
    </div>
  );
}

function NavItem({ to, icon, label, end }: { to: string; icon: ReactNode; label: string; end?: boolean }) {
  return (
    <NavLink to={to} end={end}>
      {icon}
      {label}
    </NavLink>
  );
}

// Bouton « + » : choisir le client, puis la fiche s'ouvre directement sur la saisie.
function QuickPick({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const customers = useCustomers();
  const [q, setQ] = useState('');
  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (customers.data ?? [])
      .filter((c) => !c.archived)
      .filter((c) => !term || c.name.toLowerCase().includes(term) || c.phone?.includes(term.replace(/\s/g, '')))
      .sort((a, b) => (b.lastActivityAt ?? '').localeCompare(a.lastActivityAt ?? ''))
      .slice(0, 8);
  }, [customers.data, q]);

  const go = (path: string) => {
    onClose();
    navigate(path);
  };

  return (
    <Sheet title="Pour quel client ?" onClose={onClose}>
      <div className="input-wrap" style={{ marginBottom: 12 }}>
        <span className="input-wrap__affix" aria-hidden="true">
          <Search size={18} />
        </span>
        <input
          type="search"
          placeholder="Nom ou numéro"
          aria-label="Rechercher un client"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <ul className="list card">
        {results.map((c) => (
          <li key={c.id}>
            <button type="button" className="row" onClick={() => go(`/app/clients/${c.id}?saisie=credit`)}>
              <Avatar name={c.name} />
              <span className="row__main">
                <span className="row__title" style={{ display: 'block' }}>
                  {c.name}
                </span>
                <span className="row__sub" style={{ display: 'block' }}>
                  {c.balance > 0 ? `Doit ${money(c.balance)}` : 'Ne doit rien'}
                </span>
              </span>
            </button>
          </li>
        ))}
        <li>
          <button
            type="button"
            className="row"
            onClick={() => go(`/app/clients/nouveau${q.trim() ? `?nom=${encodeURIComponent(q.trim())}` : ''}`)}
          >
            <span
              className="avatar"
              style={{ background: 'var(--brand-soft)', color: 'var(--brand)' }}
              aria-hidden="true"
            >
              <UserPlus size={18} />
            </span>
            <span className="row__main row__title" style={{ color: 'var(--brand)' }}>
              {q.trim() ? `Nouveau client « ${q.trim()} »` : 'Nouveau client'}
            </span>
          </button>
        </li>
      </ul>
    </Sheet>
  );
}
