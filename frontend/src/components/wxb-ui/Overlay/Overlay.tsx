import React from 'react';
import { WxbSpinner } from '../Spinner/Spinner';
import './Overlay.css';

export interface WxbOverlayProps {
  loading: boolean;
  tip?: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * WxbOverlay
 *
 * Wrapping loading-overlay component — replaces Antd Spin's "wrap children" semantics.
 * When loading=true, a translucent mask with WxbSpinner is displayed on top of children.
 * Children remain in the DOM to preserve layout height during loading.
 */
export const WxbOverlay: React.FC<WxbOverlayProps> = ({ loading, tip, children, className = '' }) => (
  <div className={`wxb-overlay-container ${className}`}>
    {loading && (
      <div className="wxb-overlay-mask">
        <WxbSpinner tip={tip} />
      </div>
    )}
    {children}
  </div>
);
