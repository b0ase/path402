'use client';

import { motion } from 'framer-motion';
import { ReactNode } from 'react';

interface PageHeaderProps {
    title: string;
    superTitle: ReactNode;
    extension?: string;
    description: ReactNode;
    icon?: string;
}

export function PageHeader({ title, superTitle, extension = '.SYS', description, icon }: PageHeaderProps) {
    return (
        <header className="mb-16 border-b border-zinc-200 dark:border-zinc-900 pb-8 flex items-end justify-between overflow-hidden">
            <div>
                <motion.div
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.5, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
                    className="flex items-center gap-3 mb-4 text-zinc-500 text-xs tracking-widest uppercase"
                >
                    {superTitle}
                </motion.div>

                <motion.h1
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
                    className="text-4xl md:text-6xl font-black tracking-tighter mb-2"
                >
                    {title}<span className="text-zinc-300 dark:text-zinc-800">{extension}</span>
                </motion.h1>

                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.5, delay: 0.3 }}
                    className="text-zinc-500 max-w-lg"
                >
                    {description}
                </motion.div>
            </div>

            {icon && (
                <motion.div
                    initial={{ opacity: 0, scale: 0.8, rotate: -10 }}
                    animate={{ opacity: 0.1, scale: 1, rotate: 0 }} // Final opacity is low as intended
                    transition={{ duration: 0.7, delay: 0.2, ease: "backOut" }}
                    className="hidden md:block text-6xl text-zinc-900 dark:text-white"
                >
                    {icon}
                </motion.div>
            )}
        </header>
    );
}

// Re-export PageContainer to keep imports clean for consumers
export { PageContainer } from './PageContainer';
