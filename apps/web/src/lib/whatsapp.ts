import { dueLabel, money } from './format';
import type { CustomerDetail, Merchant } from './types';

export function statementUrl(token: string): string {
  return `${window.location.origin}/c/${token}`;
}

// Message de relance poli, en français simple, avec le lien vers le relevé.
export function reminderMessage(merchant: Merchant, detail: CustomerDetail): string {
  const c = detail.customer;
  const firstName = c.name.split(/\s+/)[0];
  const lines = [`Bonjour ${firstName},`, ''];
  if (c.overdueAmount > 0) {
    lines.push(
      `Petit rappel de ${merchant.shopName} : votre solde est de ${money(c.balance)}, dont ${money(c.overdueAmount)} déjà échus.`,
    );
  } else if (c.nextDueDate) {
    lines.push(
      `Petit rappel de ${merchant.shopName} : votre solde est de ${money(c.balance)}, à régler d’ici ${dueLabel(c.nextDueDate)}.`,
    );
  } else {
    lines.push(`Petit rappel de ${merchant.shopName} : votre solde est de ${money(c.balance)}.`);
  }
  lines.push(
    '',
    `Le détail, et le paiement par Mobile Money : ${statementUrl(c.shareToken)}`,
    '',
    'Merci et bonne journée !',
  );
  return lines.join('\n');
}

export function whatsappLink(phone: string | null, message: string): string {
  const text = encodeURIComponent(message);
  return phone ? `https://wa.me/229${phone}?text=${text}` : `https://wa.me/?text=${text}`;
}
