import { ArrowDownLeft, ArrowUpRight, BookLock, MessageCircle, Smartphone, WifiOff } from 'lucide-react';
import { Link } from 'react-router';
import { Avatar, Logo } from '../components/ui';
import { money } from '../lib/format';
import { useMe } from '../lib/session';
import { DemoButton } from './Auth';

const SAMPLE = [
  { name: 'Afi Houngbo', amount: 11_000, late: true },
  { name: 'Koffi Agossou', amount: 14_000, late: true },
  { name: 'Mariam Bio Tchané', amount: 4_000, late: false },
];

export function Landing() {
  const me = useMe();
  return (
    <div className="landing">
      <nav className="landing__nav">
        <Link to="/" className="auth__brand" style={{ margin: 0 }}>
          <Logo /> Kredi
        </Link>
        {me.data ? (
          <Link className="btn btn--primary btn--sm" to="/app">
            Ouvrir mon carnet
          </Link>
        ) : (
          <Link className="btn btn--secondary btn--sm" to="/connexion">
            Se connecter
          </Link>
        )}
      </nav>

      <section className="landing__hero">
        <div>
          <h1>
            Le cahier de crédit de votre boutique, <em>dans votre téléphone.</em>
          </h1>
          <p className="landing__lead">
            Notez en quelques secondes qui vous doit combien. Vos clients voient leur solde, vous les relancez sur
            WhatsApp et ils vous remboursent en Mobile Money.
          </p>
          <div className="landing__ctas">
            <Link className="btn btn--primary" to={me.data ? '/app' : '/inscription'}>
              {me.data ? 'Ouvrir mon carnet' : 'Créer mon carnet gratuitement'}
            </Link>
            <div style={{ minWidth: 260 }}>
              <DemoButton />
            </div>
          </div>
          <p className="landing__proof">Sans email ni mot de passe compliqué : votre numéro et un code à 4 chiffres.</p>
        </div>

        <div className="phone" aria-hidden="true">
          <div className="phone__screen">
            <div className="hero-balance">
              <p className="hero-balance__label">À récupérer</p>
              <p className="hero-balance__amount num">{money(29_000)}</p>
              <p className="hero-balance__sub">3 clients vous doivent de l’argent</p>
            </div>
            <ul className="list card">
              {SAMPLE.map((s) => (
                <li key={s.name}>
                  <div className="row">
                    <Avatar name={s.name} />
                    <div className="row__main">
                      <div className="row__title">{s.name}</div>
                      <div className="row__sub">{s.late ? 'Échu depuis 4 jours' : 'Échéance dans 9 jours'}</div>
                    </div>
                    <div className="row__end">
                      <div className="row__amount num">{money(s.amount)}</div>
                      {s.late ? <span className="badge badge--late">En retard</span> : null}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <div className="features">
        <article className="card feature">
          <span className="feature__icon">
            <ArrowUpRight size={22} />
          </span>
          <h3>Un crédit noté en 10 secondes</h3>
          <p>
            Le client, le montant, ce qu’il a pris, et quand il doit rembourser. Le solde et les retards se calculent
            tout seuls.
          </p>
        </article>
        <article className="card feature">
          <span className="feature__icon">
            <MessageCircle size={22} />
          </span>
          <h3>Relance WhatsApp en un clic</h3>
          <p>
            Un message poli et déjà rédigé, avec un lien vers le relevé du client. Fini les disputes sur les montants.
          </p>
        </article>
        <article className="card feature">
          <span className="feature__icon">
            <Smartphone size={22} />
          </span>
          <h3>Remboursement en Mobile Money</h3>
          <p>
            Depuis son relevé, le client paie par MTN MoMo ou Moov Money. Le remboursement s’inscrit dans votre carnet
            automatiquement.
          </p>
        </article>
      </div>

      <h2>Pourquoi vos clients lui feront confiance</h2>
      <div className="features">
        <article className="card feature">
          <span className="feature__icon">
            <BookLock size={22} />
          </span>
          <h3>Un carnet infalsifiable</h3>
          <p>
            Une opération ne s’efface jamais. Une erreur s’annule par une nouvelle ligne, visible dans l’historique.
          </p>
        </article>
        <article className="card feature">
          <span className="feature__icon">
            <ArrowDownLeft size={22} />
          </span>
          <h3>Chaque client voit son compte</h3>
          <p>
            Le lien du relevé montre tout ce qu’il a pris et rendu, sans pouvoir rien modifier. Vous pouvez le
            renouveler à tout moment.
          </p>
        </article>
        <article className="card feature">
          <span className="feature__icon">
            <WifiOff size={22} />
          </span>
          <h3>Pensé pour le terrain</h3>
          <p>S’installe comme une application, s’ouvre même avec un réseau faible, et parle en francs CFA.</p>
        </article>
      </div>

      <h2>Comment ça marche</h2>
      <ol className="steps">
        <li>
          <div>
            <strong>Créez votre carnet</strong>
            <p className="muted">Nom de la boutique, numéro, code PIN. C’est tout.</p>
          </div>
        </li>
        <li>
          <div>
            <strong>Notez les crédits au fil de la journée</strong>
            <p className="muted">Le bouton + est toujours à portée de pouce.</p>
          </div>
        </li>
        <li>
          <div>
            <strong>Relancez et encaissez</strong>
            <p className="muted">WhatsApp pour le rappel, Mobile Money pour le paiement.</p>
          </div>
        </li>
      </ol>

      <footer className="landing__footer">
        <span>Kredi · fait à Cotonou</span>
        <a href="https://github.com/kabirADEMON/kredi" target="_blank" rel="noreferrer">
          Code source
        </a>
      </footer>
    </div>
  );
}
