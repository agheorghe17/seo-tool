import Link from 'next/link';

const PLANS = [
  {
    name: 'Free',
    price: '0 €',
    features: ['1–3 site-uri', '2.000 pagini / lună', 'Scor + recomandări', 'Export CSV / PDF'],
    cta: { href: '/login', label: 'Începe gratuit' },
  },
  {
    name: 'Pro',
    price: 'în curând',
    features: [
      'Site-uri nelimitate',
      'Cotă mărită de pagini',
      'Aplicare automată fix-uri WordPress',
      'Istoric crawl-uri extins',
      'Rapoarte cu branding',
    ],
    cta: { href: '/login', label: 'Anunță-mă' },
  },
];

export default function PricingPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Prețuri</h1>
      <p className="mt-2 text-neutral-500">
        MVP pentru uz personal. Planul Pro va apărea odată cu utilizarea comercială — deocamdată totul e gratuit.
      </p>
      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        {PLANS.map((p) => (
          <div key={p.name} className="rounded-xl border border-neutral-200 p-6 dark:border-neutral-800">
            <h2 className="text-lg font-semibold">{p.name}</h2>
            <p className="mt-1 text-2xl font-bold">{p.price}</p>
            <ul className="mt-4 space-y-2 text-sm text-neutral-600 dark:text-neutral-300">
              {p.features.map((f) => (
                <li key={f}>• {f}</li>
              ))}
            </ul>
            <Link
              href={p.cta.href}
              className="mt-6 inline-flex rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-neutral-900"
            >
              {p.cta.label}
            </Link>
          </div>
        ))}
      </div>
    </main>
  );
}
