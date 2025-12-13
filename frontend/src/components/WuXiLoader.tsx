import React from 'react';

export interface WuXiLoaderProps {
  compact?: boolean;
}

const WuXiLoader: React.FC<WuXiLoaderProps> = ({ compact }) => (
  <div className="wuxi-loader" style={compact ? { padding: '8px 6px' } : undefined}>
    <div className="wuxi-loader__logo">
      <div className="wuxi-loader__text">
        <div className="wuxi-loader__line1">WuXi Biologics</div>
        {!compact && <div className="wuxi-loader__line2">Global Solution Provider</div>}
      </div>
      <div className="wuxi-loader__bars">
        <span className="wuxi-loader__bar bar-blue" />
        <span className="wuxi-loader__bar bar-cyan" />
        <span className="wuxi-loader__bar bar-green" />
        <span className="wuxi-loader__bar bar-yellow" />
      </div>
    </div>
  </div>
);

export default WuXiLoader;
