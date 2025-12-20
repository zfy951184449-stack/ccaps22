import React from 'react';
import { Button, Tooltip, ButtonProps } from 'antd';

export interface DSButtonProps extends Omit<ButtonProps, 'variant'> {
    tooltip?: string;
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
}

/**
 * DSButton (Design System Button)
 * 
 * A standardized button component for the application, following Apple Human Interface Guidelines.
 * Features:
 * - Unified sizing and padding
 * - Preset variants for common actions
 * - Built-in tooltip support
 * - "Tiny" size optimization for high-density interfaces
 */
export const DSButton: React.FC<DSButtonProps> = ({
    tooltip,
    variant = 'secondary',
    style,
    children,
    ...props
}) => {
    // Preset styles based on variant
    let variantStyle: React.CSSProperties = {};

    switch (variant) {
        case 'primary':
            variantStyle = {
                // Primary is usually handled by type="primary", but we can customize here
                fontWeight: 500,
            };
            break;
        case 'secondary':
            variantStyle = {
                color: '#64748B', // Slate 500
            };
            break;
        case 'ghost':
            variantStyle = {
                color: '#64748B',
                background: 'transparent',
                border: 'none',
            };
            break;
        case 'danger':
            variantStyle = {
                color: '#EF4444', // Red 500
            };
            break;
    }

    // Common styling for "Tiny" buttons used in Sidebar/密集 UI
    const baseStyle: React.CSSProperties = {
        borderRadius: 6,
        padding: 0,
        height: 24,
        width: 24, // Square by default for icons
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 0.2s',
        ...variantStyle,
        ...style,
    };

    // Auto-adjust width if there is text children
    if (children) {
        baseStyle.width = 'auto';
        baseStyle.paddingLeft = 8;
        baseStyle.paddingRight = 8;
    }

    const button = (
        <Button
            type={variant === 'primary' ? 'primary' : 'text'}
            size="small"
            style={baseStyle}
            danger={variant === 'danger'}
            {...props}
        >
            {children}
        </Button>
    );

    if (tooltip) {
        return <Tooltip title={tooltip} mouseEnterDelay={0.5}>{button}</Tooltip>;
    }

    return button;
};
