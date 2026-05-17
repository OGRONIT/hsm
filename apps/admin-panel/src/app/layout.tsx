'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import './globals.css';

const NAV = [
  { href: '/',          icon: '⬡',  label: 'Dashboard'   },
  { href: '/leads',     icon: '◈',  label: 'Leads'       },
  { href: '/scrapers',  icon: '⬡',  label: 'Scrapers'    },
  { href: '/bot',       icon: '◉',  label: 'Bot'         },
  { href: '/queue',     icon: '▣',  label: 'Queue'       },
  { href: '/keys',      icon: '⌗',  label: 'API Keys'    },
  { href: '/payments',  icon: '◈',  label: 'Payments'    },
  { href: '/costs',     icon: '▦',  label: 'Costs'       },
  { href: '/proxies',   icon: '⬡',  label: 'Proxies'     },
  { href: '/logs',      icon: '▤',  label: 'Logs'        },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return (
    <html lang="en">
      <head>
        <title>HSM Admin — Hariii Sales Machine</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body style={{ margin: 0, fontFamily: "'Space Grotesk', sans-serif", background: '#0A0A0F', color: '#E8E6F0', display: 'flex', minHeight: '100vh' }}>
        {/* Sidebar */}
        <aside style={{
          width: 220, background: '#0F0F1A', borderRight: '1px solid #1E1E2E',
          display: 'flex', flexDirection: 'column', position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 50,
        }}>
          {/* Logo */}
          <div style={{ padding: '24px 20px 20px', borderBottom: '1px solid #1E1E2E' }}>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#6B6888', letterSpacing: 3, textTransform: 'uppercase', marginBottom: 4 }}>Hariii Design</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#E8E6F0', letterSpacing: -0.5 }}>HSM Admin</div>
            <div style={{ fontSize: 11, color: '#FF6B35', fontFamily: "'JetBrains Mono', monospace", marginTop: 2 }}>● LIVE</div>
          </div>

          {/* Nav */}
          <nav style={{ flex: 1, padding: '12px 0', overflowY: 'auto' }}>
            {NAV.map(item => {
              const active = path === item.href || (item.href !== '/' && path.startsWith(item.href));
              return (
                <Link key={item.href} href={item.href} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 20px', textDecoration: 'none',
                  color: active ? '#E8E6F0' : '#6B6888',
                  background: active ? '#1A1A2E' : 'transparent',
                  borderLeft: active ? '2px solid #FF6B35' : '2px solid transparent',
                  fontSize: 14, fontWeight: active ? 600 : 400,
                  transition: 'all 0.15s',
                }}>
                  <span style={{ fontSize: 16, opacity: active ? 1 : 0.5 }}>{item.icon}</span>
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Footer */}
          <div style={{ padding: '16px 20px', borderTop: '1px solid #1E1E2E' }}>
            <div style={{ fontSize: 11, color: '#3D3B52', fontFamily: "'JetBrains Mono', monospace" }}>smit@hariii.design</div>
            <div style={{ fontSize: 11, color: '#3D3B52', fontFamily: "'JetBrains Mono', monospace" }}>v1.0.0 · HSM</div>
          </div>
        </aside>

        {/* Main content */}
        <main style={{ marginLeft: 220, flex: 1, minHeight: '100vh', background: '#0A0A0F' }}>
          {children}
        </main>
      </body>
    </html>
  );
}
