'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import './globals.css';

const NAV = [
  { href: '/',              icon: '◈', label: 'Overview'       },
  { href: '/conversations', icon: '◉', label: 'Conversations'  },
  { href: '/meetings',      icon: '◷', label: 'Meetings'       },
  { href: '/leads',         icon: '◎', label: 'Lead Funnel'    },
  { href: '/photos',        icon: '◫', label: 'Photos'         },
  { href: '/analytics',     icon: '◇', label: 'Analytics'      },
  { href: '/sources',       icon: '◆', label: 'Sources'        },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return (
    <html lang="en">
      <head>
        <title>Hariii Design — Sales Portal</title>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
      </head>
      <body>
        <div className="portal-layout">
          <aside className="portal-sidebar">
            <div className="nav-logo">
              <div className="nav-logo-brand">Hariii Design</div>
              <div className="nav-logo-sub">Sales Portal</div>
            </div>
            <nav className="nav-links">
              {NAV.map(item => {
                const active = path === item.href || (item.href !== '/' && path.startsWith(item.href));
                return (
                  <Link key={item.href} href={item.href} className={`nav-link${active ? ' active' : ''}`}>
                    <span className="nav-link-icon">{item.icon}</span>
                    {item.label}
                  </Link>
                );
              })}
            </nav>
            <div className="nav-footer">
              <div className="nav-footer-text">smit@hariii.design</div>
              <div className="nav-footer-text" style={{ marginTop: 2 }}>www.hariii.design</div>
            </div>
          </aside>
          <main className="portal-main">{children}</main>
        </div>
      </body>
    </html>
  );
}
