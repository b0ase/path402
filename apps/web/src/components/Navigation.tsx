'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navItems = [
  { href: '/', label: 'DASHBOARD' },
  { href: '/portfolio/', label: 'PORTFOLIO' },
  { href: '/market/', label: 'MARKET' },
  { href: '/exchange/', label: 'EXCHANGE' },
  { href: '/upload/', label: 'UPLOAD' },
  { href: '/live/', label: 'LIVE' }
];

export function Navigation() {
  const pathname = usePathname();

  return (
    <nav className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-black sticky top-10 z-40 no-drag">
      <div className="w-full px-4 md:px-8">
        <div className="flex items-center h-12 gap-0 overflow-x-auto border-x border-gray-200 dark:border-gray-800">
          {navItems.map((item, i, arr) => {
            const isActive = pathname === item.href ||
              (item.href !== '/' && pathname.startsWith(item.href));

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`px-6 h-full flex items-center text-[10px] uppercase tracking-[0.2em] font-mono font-bold transition-colors whitespace-nowrap ${isActive
                    ? 'bg-black dark:bg-white text-white dark:text-black'
                    : 'bg-gray-50 dark:bg-zinc-900/10 text-gray-500 hover:text-black dark:hover:text-white'
                  } ${i < arr.length - 1 ? 'border-r border-gray-200 dark:border-gray-800' : ''}`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
