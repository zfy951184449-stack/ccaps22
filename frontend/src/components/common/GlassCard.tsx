import React from 'react';
import { motion, HTMLMotionProps } from 'framer-motion';
import { fluentDesignTokens } from '../../styles/fluentDesignTokens';

interface GlassCardProps extends HTMLMotionProps<"div"> {
    children: React.ReactNode;
    className?: string;
    noPadding?: boolean;
}

/**
 * GlassCard Component
 * 
 * Implements Apple HIG-style glassmorphism:
 * - Backdrop blur
 * - Semi-transparent white background
 * - Subtle border
 * - Rounded corners (squircle-like)
 * - Shadow for depth
 */
const GlassCard: React.FC<GlassCardProps> = ({
    children,
    className = '',
    noPadding = false,
    style,
    ...props
}) => {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.25, 0.1, 0.25, 1.0] }} // Authentic iOS spring-like bezier
            className={`glass-card ${className}`}
            style={{
                background: 'rgba(255, 255, 255, 0.7)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                borderRadius: '24px', // rounded-3xl
                border: '1px solid rgba(255, 255, 255, 0.4)',
                boxShadow: '0 4px 24px -1px rgba(0, 0, 0, 0.05)',
                padding: noPadding ? 0 : '24px',
                overflow: 'hidden',
                ...style
            }}
            {...props}
        >
            {children}
        </motion.div>
    );
};

export default GlassCard;
