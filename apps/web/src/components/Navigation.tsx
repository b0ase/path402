'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { WalletButton } from '@/components/WalletButton';
import { ThemeToggle } from '@/components/ThemeToggle';

const navItems = [
  { href: '/', label: '$402' },
  { href: '/portfolio/', label: 'PORTFOLIO' },
  { href: '/market/', label: 'MARKET' },
  { href: '/exchange/', label: 'EXCHANGE' },
  { href: '/library/', label: 'LIBRARY' },
  { href: '/mint/', label: 'MINT' },
  { href: '/upload/', label: 'ISSUE' },
  { href: '/wallet/', label: 'WALLET' },
  { href: '/chat/', label: 'CHAT' },
  { href: '/settings/', label: 'SETTINGS' }
];

export function Navigation() {
  const pathname = usePathname();

  return (
    <nav className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-black sticky top-10 z-40 no-drag">
      <div className="w-full px-4 md:px-8">
        <div className="flex items-center h-12 border-x border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center h-full gap-0 overflow-x-auto">
            {navItems.map((item, i, arr) => {
              const isActive = pathname === item.href ||
                (item.href !== '/' && pathname.startsWith(item.href));

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-6 h-full flex items-center text-[10px] uppercase tracking-[0.2em] font-mono font-bold transition-colors whitespace-nowrap ${isActive
                    ? 'bg-black dark:bg-white text-white dark:text-black'
                    : 'bg-zinc-50 dark:bg-zinc-900/10 text-zinc-500 hover:text-black dark:hover:text-white'
                    } border-r border-zinc-200 dark:border-zinc-800`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
          <div className="ml-auto flex items-center h-full flex-shrink-0">
            <WalletButton />
            <ThemeToggle />
          </div>
        </div>
      </div>
    </nav>
  );
}
