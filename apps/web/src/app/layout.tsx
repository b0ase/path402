import type { Metadata } from 'next';
import { Providers } from './providers';
import { ThemeToggle } from '@/components/ThemeToggle';
import './globals.css';

export const metadata: Metadata = {
  title: '$402 Client',
  description: 'Access tokens for the open web'
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen antialiased font-mono">
        <Providers>
          {/* INDUSTRIAL: Draggable title bar */}
          <div className="titlebar h-10 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between fixed top-0 left-0 right-0 z-50 bg-white dark:bg-black px-4 md:px-8">
            <div className="w-20" /> {/* Spacer for macOS traffic lights */}
            <span className="text-[10px] text-gray-400 dark:text-gray-600 uppercase tracking-[0.2em] font-mono font-bold">$402 Client</span>
            <ThemeToggle />
          </div>
          <div className="pt-10">
            {children}
          </div>
        </Providers>
      </body>
    </html>
  );
}
