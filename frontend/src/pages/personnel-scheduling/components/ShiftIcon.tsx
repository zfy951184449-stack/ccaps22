import React from 'react';
import { ShiftKind } from '../types';

interface Props { kind: ShiftKind; size?: number; }

/** 班次类型图标(stroke 继承药丸文字色):白班☀ 长白🌅 夜班☾ 休息☕ 请假☂。
 *  颜色 + 图标 + 文字三重编码,使班次类型一眼可辨、且不只靠颜色(色盲友好)。 */
const ShiftIcon: React.FC<Props> = ({ kind, size = 12 }) => {
    const common = {
        width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
        stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
        'aria-hidden': true, style: { flexShrink: 0 }
    };
    switch (kind) {
        case 'day':
            return (
                <svg {...common}>
                    <circle cx="12" cy="12" r="4.5" />
                    <line x1="12" y1="1.5" x2="12" y2="4" /><line x1="12" y1="20" x2="12" y2="22.5" />
                    <line x1="1.5" y1="12" x2="4" y2="12" /><line x1="20" y1="12" x2="22.5" y2="12" />
                    <line x1="4.2" y1="4.2" x2="6" y2="6" /><line x1="18" y1="18" x2="19.8" y2="19.8" />
                    <line x1="18" y1="6" x2="19.8" y2="4.2" /><line x1="4.2" y1="19.8" x2="6" y2="18" />
                </svg>
            );
        case 'long':
            return (
                <svg {...common}>
                    <path d="M17 18a5 5 0 0 0-10 0" />
                    <line x1="12" y1="2" x2="12" y2="9" />
                    <line x1="4.22" y1="10.22" x2="5.64" y2="11.64" />
                    <line x1="1" y1="18" x2="3" y2="18" /><line x1="21" y1="18" x2="23" y2="18" />
                    <line x1="18.36" y1="11.64" x2="19.78" y2="10.22" />
                    <line x1="23" y1="22" x2="1" y2="22" />
                    <polyline points="8 6 12 2 16 6" />
                </svg>
            );
        case 'night':
            return (
                <svg {...common}>
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
            );
        case 'leave':
            return (
                <svg {...common}>
                    <path d="M23 12a11.05 11.05 0 0 0-22 0z" />
                    <path d="M12 12v7a3 3 0 0 1-6 0" />
                </svg>
            );
        case 'rest':
        default:
            return (
                <svg {...common}>
                    <path d="M18 8h1a4 4 0 0 1 0 8h-1" />
                    <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" />
                    <line x1="6" y1="2" x2="6" y2="4.5" /><line x1="10" y1="2" x2="10" y2="4.5" /><line x1="14" y1="2" x2="14" y2="4.5" />
                </svg>
            );
    }
};

export default ShiftIcon;
