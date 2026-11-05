export type ArtworkVariant =
  'accounts' | 'categories' | 'cashflow' | 'budgets' | 'overview' | 'review' | 'goals';

export type Feature = {
  title: string;
  category: string;
  tag: string;
  description: string;
  variant: ArtworkVariant;
};

export const featureCards: Feature[] = [
  {
    title: 'Every account, together',
    category: 'Accounts · Balances',
    tag: 'One view',
    description: 'Checking, savings, credit cards and cash reconciled into a single, calm picture.',
    variant: 'accounts',
  },
  {
    title: 'Categories you can explain',
    category: 'Rules · Review',
    tag: 'Transparent',
    description: 'See the source and reason behind every assignment, then correct it in one click.',
    variant: 'categories',
  },
  {
    title: 'The shape of your spending',
    category: 'Insights · Cash flow',
    tag: 'Month by month',
    description:
      'Income, spending and what is left — without spreadsheet archaeology or surprise totals.',
    variant: 'cashflow',
  },
  {
    title: 'Budgets with breathing room',
    category: 'Plans · Guardrails',
    tag: 'Before you spend',
    description:
      'Set a ceiling per category and know what is safe to spend while the month is still moving.',
    variant: 'budgets',
  },
];

export const appScreens: Feature[] = [
  {
    title: 'Overview',
    category: 'Dashboard · Daily clarity',
    tag: 'At a glance',
    description:
      'Balances, recent activity and the month so far answer the first question without a detour.',
    variant: 'overview',
  },
  {
    title: 'Cash flow',
    category: 'Trends · Income and spending',
    tag: 'In context',
    description:
      'See how money arrives and leaves over time, with transfers and card payments kept out of the totals.',
    variant: 'cashflow',
  },
  {
    title: 'Review inbox',
    category: 'Categorization · One decision at a time',
    tag: 'Explainable',
    description:
      'Unclear transactions arrive in a short queue. Every correction teaches the next assignment.',
    variant: 'review',
  },
  {
    title: 'Goals',
    category: 'Savings · Net worth',
    tag: 'Forward-looking',
    description: 'Turn the number at the bottom of the page into a direction, a target and a date.',
    variant: 'goals',
  },
];

export const processSteps = [
  {
    number: '01',
    title: 'Connect',
    description:
      'Add accounts through a read-only aggregator or import a bank export. No bank passwords, no scraping.',
    icon: 'connect',
  },
  {
    number: '02',
    title: 'Understand',
    description:
      'Transactions land in a clean overview with balances, spending trends and cash flow already in context.',
    icon: 'understand',
  },
  {
    number: '03',
    title: 'Correct',
    description:
      'Every category shows its source and reason. Accept it, change it, or write a rule so the next one is right.',
    icon: 'correct',
  },
  {
    number: '04',
    title: 'Plan',
    description:
      'Set budgets, spot recurring charges and track goals while the everyday numbers stay explainable.',
    icon: 'plan',
  },
] as const;

export const navigation = [
  { href: '#about', label: 'Why' },
  { href: '#features', label: 'Features' },
  { href: '#gallery', label: 'Inside the app' },
  { href: '#process', label: 'How it works' },
] as const;
