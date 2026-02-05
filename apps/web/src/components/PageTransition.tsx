'use client';

import { motion, Variants } from 'framer-motion';
import { ReactNode } from 'react';

// Subtle standard page fade
const pageVariants: Variants = {
    initial: { opacity: 0 },
    animate: {
        opacity: 1,
        transition: { duration: 0.3 }
    },
    exit: { opacity: 0 }
};

interface PageTransitionProps {
    children: ReactNode;
    className?: string;
}

export function PageTransition({ children, className = '' }: PageTransitionProps) {
    return (
        <motion.div
            initial="initial"
            animate="animate"
            exit="exit"
            variants={pageVariants}
            className={className}
        >
            {children}
        </motion.div>
    );
}
