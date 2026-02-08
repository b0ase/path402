import type { Metadata } from 'next';
import { Inter, JetBrains_Mono, Orbitron } from 'next/font/google';
import { Providers } from './providers';
import { IncomingCallProvider } from '@/components/IncomingCallProvider';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

const orbitron = Orbitron({
  subsets: ['latin'],
  variable: '--font-orbitron',
  display: 'swap',
});

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
      <body className={`min-h-screen antialiased bg-white dark:bg-black font-sans ${inter.variable} ${jetbrainsMono.variable} ${orbitron.variable}`} suppressHydrationWarning>
        <Providers>
          <IncomingCallProvider>
            {/* INDUSTRIAL: Draggable title bar */}
            <div className="titlebar h-10 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between fixed top-0 left-0 right-0 z-50 bg-white dark:bg-black px-4 md:px-8 select-none" style={{ WebkitAppRegion: 'drag' } as any}>
              <div className="w-20" /> {/* Spacer for macOS traffic lights */}
              <span className="text-[10px] text-zinc-400 dark:text-zinc-600 uppercase tracking-[0.2em] font-display font-bold">$402 Client</span>
              <div className="w-20" /> {/* Symmetry spacer */}
            </div>
            <div className="pt-10">
              {children}
            </div>
          </IncomingCallProvider>
        </Providers>
      </body>
    </html>
  );
}
