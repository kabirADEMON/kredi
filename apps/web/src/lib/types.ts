export type Merchant = {
  id: string;
  shopName: string;
  ownerName: string;
  phone: string | null;
  phoneDisplay: string | null;
  isDemo: boolean;
  createdAt: string;
};

export type EntryType = 'credit' | 'payment' | 'reversal';

export type Entry = {
  id: string;
  type: EntryType;
  amount: number;
  note: string | null;
  dueDate: string | null;
  method: 'cash' | 'momo' | null;
  reversesId: string | null;
  viaMomo: boolean;
  createdAt: string;
  balanceAfter: number;
  reversed: boolean;
};

export type CustomerSummary = {
  id: string;
  name: string;
  phone: string | null;
  archived: boolean;
  balance: number;
  overdueAmount: number;
  oldestOverdueDate: string | null;
  nextDueDate: string | null;
  lastActivityAt: string | null;
};

export type CustomerDetail = {
  customer: CustomerSummary & { shareToken: string; createdAt: string };
  totals: { totalCredit: number; totalPaid: number };
  entries: Entry[];
};

export type Dashboard = {
  totalDue: number;
  debtorsCount: number;
  overdueAmount: number;
  overdueCount: number;
  collectedThisMonth: number;
  creditedThisMonth: number;
  customersCount: number;
  recent: {
    id: string;
    customerId: string;
    customerName: string;
    type: EntryType;
    amount: number;
    note: string | null;
    viaMomo: boolean;
    createdAt: string;
  }[];
};

export type Statement = {
  shop: { name: string; ownerName: string; phone: string | null; phoneDisplay: string | null };
  customer: { name: string };
  balance: number;
  overdueAmount: number;
  nextDueDate: string | null;
  entries: Pick<Entry, 'id' | 'type' | 'amount' | 'note' | 'dueDate' | 'method' | 'createdAt' | 'balanceAfter'>[];
  payment: { provider: 'fedapay' | 'mock'; minAmount: number };
};

export type PaymentStatus = {
  id: string;
  status: 'pending' | 'approved' | 'declined' | 'canceled';
  amount: number;
  provider: 'fedapay' | 'mock';
  shopName: string;
  customerName: string;
  shareToken: string;
  balance: number;
};
