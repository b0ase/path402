'use client';

import { PageTransition } from './PageTransition';
import { ReactNode } from 'react';

interface PageContainerProps {
    children: ReactNode;
    className?: string; // Allow custom classes but enforce base styles
}

/**
 * Standard Page Container for $402 Client.
 * 
 * Enforces:
 * - Proper Theme Colors (White/Black)
 * - Industrial Transition (PageTransition)
 * - Standard Font (Mono) and Selection Colors
 * - Min Height (Screen)
 */
export function PageContainer({ children, className = '' }: PageContainerProps) {
    return (
        <PageTransition
            className={`min-h-screen bg-white dark:bg-black text-black dark:text-white font-mono selection:bg-purple-500 selection:text-white ${className}`}
        >
            {children}
        </PageTransition>
    );
}
