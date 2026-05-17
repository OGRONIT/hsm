'use client';
import { useState } from 'react';

interface Service {
  name:        string;
  icon:        string;
  plan:        string;
  price:       string;
  cycle:       string;
  status:      'active' | 'trial' | 'expired' | 'free';
  renewDate:   string;
  paymentMethod: string;
  dashboardUrl: string;
  billingUrl:  string;
  category:    string;
  notes?:      string;
}

const SERVICES: Service[] = [
  {
    name: 'Anthropic (Claude API)', icon: '🤖', plan: 'Pay-as-you-go',
    price: 'Variable', cycle: 'Monthly', status: 'active',
    renewDate: '1st of month', paymentMethod: 'Card on file',
    dashboardUrl: 'https://console.anthropic.com', billingUrl: 'https://console.anthropic.com/settings/billing',
    category: 'AI', notes: '~$5-15/mo based on usage',
  },
  {
    name: 'OpenAI (GPT-4o Mini)', icon: '🧠', plan: 'Pay-as-you-go',
    price: 'Variable', cycle: 'Monthly', status: 'active',
    renewDate: '1st of month', paymentMethod: 'Card on file',
    dashboardUrl: 'https://platform.openai.com', billingUrl: 'https://platform.openai.com/account/billing',
    category: 'AI', notes: '~$2-5/mo based on usage',
  },
  {
    name: 'Railway (Hosting)', icon: '🚂', plan: 'Hobby',
    price: '$20/mo', cycle: 'Monthly', status: 'active',
    renewDate: '15th', paymentMethod: 'Card on file',
    dashboardUrl: 'https://railway.app', billingUrl: 'https://railway.app/account/billing',
    category: 'Infrastructure',
  },
  {
    name: 'Vercel (Frontend)', icon: '▲', plan: 'Hobby (Free)',
    price: '$0/mo', cycle: '—', status: 'free',
    renewDate: '—', paymentMethod: '—',
    dashboardUrl: 'https://vercel.com', billingUrl: 'https://vercel.com/account/billing',
    category: 'Infrastructure',
  },
  {
    name: 'Supabase', icon: '🗄', plan: 'Pro',
    price: '$25/mo', cycle: 'Monthly', status: 'active',
    renewDate: '1st of month', paymentMethod: 'Card on file',
    dashboardUrl: 'https://supabase.com/dashboard', billingUrl: 'https://supabase.com/dashboard/account/billing',
    category: 'Infrastructure',
  },
  {
    name: 'Upstash Redis', icon: '⚡', plan: 'Pay-as-you-go',
    price: '~$10/mo', cycle: 'Monthly', status: 'active',
    renewDate: '1st of month', paymentMethod: 'Card on file',
    dashboardUrl: 'https://console.upstash.com', billingUrl: 'https://console.upstash.com/account/billing',
    category: 'Infrastructure',
  },
  {
    name: 'Bright Data (Proxies)', icon: '🌐', plan: 'Pay-as-you-go',
    price: '~$50/mo', cycle: 'Monthly', status: 'active',
    renewDate: '1st of month', paymentMethod: 'Card on file',
    dashboardUrl: 'https://brightdata.com/cp', billingUrl: 'https://brightdata.com/cp/billing',
    category: 'Scraping',
  },
  {
    name: 'Apify', icon: '🕷', plan: 'Starter',
    price: '$49/mo', cycle: 'Monthly', status: 'active',
    renewDate: '20th', paymentMethod: 'Card on file',
    dashboardUrl: 'https://console.apify.com', billingUrl: 'https://console.apify.com/billing',
    category: 'Scraping',
  },
  {
    name: 'AiSensy / WATI (WhatsApp)', icon: '📱', plan: 'Growth',
    price: '$29/mo', cycle: 'Monthly', status: 'active',
    renewDate: '10th', paymentMethod: 'Card on file',
    dashboardUrl: 'https://app.aisensy.com', billingUrl: 'https://app.aisensy.com/billing',
    category: 'Messaging', notes: 'Or WATI: https://app.wati.io',
  },
  {
    name: 'Resend (Email)', icon: '📧', plan: 'Free',
    price: '$0/mo', cycle: '—', status: 'free',
    renewDate: '—', paymentMethod: '—',
    dashboardUrl: 'https://resend.com', billingUrl: 'https://resend.com/settings/billing',
    category: 'Messaging', notes: '3,000 emails/mo free',
  },
  {
    name: 'Calendly', icon: '📅', plan: 'Standard',
    price: '$10/mo', cycle: 'Monthly', status: 'active',
    renewDate: '5th', paymentMethod: 'Card on file',
    dashboardUrl: 'https://calendly.com/app/account', billingUrl: 'https://calendly.com/app/account/billing',
    category: 'Meetings',
  },
  {
    name: 'Google Maps API', icon: '📍', plan: 'Pay-as-you-go',
    price: '~$5/mo', cycle: 'Monthly', status: 'active',
    renewDate: '1st of month', paymentMethod: 'Card on file',
    dashboardUrl: 'https://console.cloud.google.com', billingUrl: 'https://console.cloud.google.com/billing',
    category: 'Scraping', notes: '$200 free credit/mo',
  },
];

const STATUS_COLORS: Record<string, string> = {
  active: 'badge-green', trial: 'badge-amber', expired: 'badge-red', free: 'badge-blue',
};

const CATEGORIES = ['All', 'AI', 'Infrastructure', 'Scraping', 'Messaging', 'Meetings'];

export default function PaymentsPage() {
  const [cat,    setCat]    = useState('All');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [localServices, setLocalServices] = useState<Service[]>(SERVICES);

  const filtered = localServices.filter(s =>
    (cat === 'All' || s.category === cat) &&
    s.name.toLowerCase().includes(search.toLowerCase())
  );

  const totalMonthly = localServices
    .filter(s => s.status !== 'free')
    .reduce((sum, s) => {
      const num = parseFloat(s.price.replace(/[^0-9.]/g, ''));
      return sum + (isNaN(num) ? 0 : num);
    }, 0);

  const activeCount = localServices.filter(s => s.status === 'active').length;
  const renewingSoon = localServices.filter(s => {
    // Simple check — in real app you'd compare actual dates
    return s.status === 'active' && ['1st', '5th', '10th'].some(d => s.renewDate.includes(d));
  }).length;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Payments & Billing</h1>
          <p className="page-sub">All HSM service subscriptions and billing links</p>
        </div>
      </div>

      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        {[
          { label: 'Total / Month',   value: `~$${totalMonthly.toFixed(0)}`,     color: '#E8E6F0', sub: `≈ ₹${(totalMonthly * 84).toFixed(0)}/mo` },
          { label: 'Active Services', value: activeCount,                         color: '#4ADE80', sub: `${localServices.filter(s=>s.status==='free').length} free tier` },
          { label: 'Free Services',   value: localServices.filter(s=>s.status==='free').length, color: '#60A5FA', sub: 'No cost' },
          { label: 'Total Services',  value: localServices.length,                color: '#C084FC', sub: 'All integrated' },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="stat-value" style={{ color: s.color, fontSize: 28 }}>{s.value}</div>
            <div className="stat-label">{s.label}</div>
            <div style={{ fontSize: 11, color: '#6B6888', marginTop: 4, fontFamily: 'JetBrains Mono' }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Category + Search filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        {CATEGORIES.map(c => (
          <button key={c} className={`btn btn-sm ${cat === c ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setCat(c)}>{c}</button>
        ))}
        <input
          className="hsm-input" placeholder="Search service..."
          value={search} onChange={e => setSearch(e.target.value)}
          style={{ marginLeft: 'auto', width: 200 }}
        />
      </div>

      {/* Services table */}
      <div className="card" style={{ padding: 0 }}>
        <table className="hsm-table">
          <thead>
            <tr>
              <th>Service</th>
              <th>Category</th>
              <th>Plan</th>
              <th>Price</th>
              <th>Renews</th>
              <th>Status</th>
              <th>Payment</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => (
              <tr key={s.name}>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 18 }}>{s.icon}</span>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: '#E8E6F0' }}>{s.name}</div>
                      {s.notes && <div style={{ fontSize: 11, color: '#6B6888' }}>{s.notes}</div>}
                    </div>
                  </div>
                </td>
                <td><span className="badge badge-gray" style={{ fontSize: 10 }}>{s.category}</span></td>
                <td style={{ fontSize: 12, color: '#9CA3AF' }}>{s.plan}</td>
                <td className="mono" style={{ fontWeight: 600, color: s.status === 'free' ? '#4ADE80' : '#E8E6F0' }}>{s.price}</td>
                <td style={{ fontSize: 12, color: '#9CA3AF' }}>{s.renewDate}</td>
                <td><span className={`badge ${STATUS_COLORS[s.status]}`}>{s.status}</span></td>
                <td style={{ fontSize: 11, color: '#6B6888' }}>{s.paymentMethod}</td>
                <td>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <a href={s.dashboardUrl} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm">↗ Dashboard</a>
                    <a href={s.billingUrl}   target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm">💳 Billing</a>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Monthly breakdown chart */}
      <div className="card" style={{ marginTop: 20 }}>
        <p className="section-title">Monthly Spend by Category</p>
        {['AI', 'Infrastructure', 'Scraping', 'Messaging', 'Meetings'].map(category => {
          const categoryServices = localServices.filter(s => s.category === category && s.status !== 'free');
          const categoryTotal = categoryServices.reduce((sum, s) => {
            const num = parseFloat(s.price.replace(/[^0-9.]/g, ''));
            return sum + (isNaN(num) ? 0 : num);
          }, 0);
          const pct = totalMonthly > 0 ? (categoryTotal / totalMonthly) * 100 : 0;
          const colors: Record<string, string> = { AI: '#FF6B35', Infrastructure: '#60A5FA', Scraping: '#C084FC', Messaging: '#4ADE80', Meetings: '#FCD34D' };
          const color = colors[category] ?? '#6B6888';

          return (
            <div key={category} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <div style={{ width: 110, fontSize: 12, color: '#9CA3AF' }}>{category}</div>
              <div style={{ flex: 1, height: 8, background: '#1E1E2E', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ height: '100%', background: color, borderRadius: 4, width: `${pct}%`, transition: 'width 0.5s' }} />
              </div>
              <div style={{ width: 80, textAlign: 'right', fontSize: 12, fontFamily: 'JetBrains Mono', color: '#E8E6F0' }}>~${categoryTotal}/mo</div>
              <div style={{ width: 40, textAlign: 'right', fontSize: 11, color: '#6B6888', fontFamily: 'JetBrains Mono' }}>{pct.toFixed(0)}%</div>
            </div>
          );
        })}
      </div>

      {/* Payment tips */}
      <div className="card" style={{ marginTop: 16, background: '#0D1A2A', borderColor: '#1E3A5F' }}>
        <p className="section-title" style={{ color: '#60A5FA' }}>💡 Billing Tips</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {[
            { tip: 'Set billing alerts', detail: 'Set $50 and $100 alerts in Anthropic + OpenAI to catch runaway API usage early.' },
            { tip: 'Use one card for all', detail: 'Link a single business card to all services — easier to track and cancel if needed.' },
            { tip: 'Variable cost control', detail: 'Anthropic + OpenAI + Bright Data are variable. Set monthly budget caps in each dashboard.' },
            { tip: 'Free tier limits', detail: 'Vercel (100GB bandwidth) + Resend (3k emails) + Google Maps ($200 credit) cover your needs for free.' },
          ].map(t => (
            <div key={t.tip} style={{ display: 'flex', gap: 10 }}>
              <span style={{ color: '#60A5FA', fontSize: 16, flexShrink: 0 }}>→</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#E8E6F0', marginBottom: 2 }}>{t.tip}</div>
                <div style={{ fontSize: 12, color: '#6B6888' }}>{t.detail}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
