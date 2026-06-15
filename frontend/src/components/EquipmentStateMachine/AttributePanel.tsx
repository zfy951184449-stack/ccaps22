/**
 * 单条属性面板:属性名 + 类型标签(离散/计数/日历)+ ready 公式 + 计数元信息 + 小状态机图。
 */
import React from 'react';
import { WxbTag } from '../wxb-ui';
import {
  ESM_ATTR_TYPE_COLOR,
  ESM_ATTR_TYPE_LABEL,
} from '../../types/equipmentStateMachine';
import type { EsmAttribute, EsmTransition } from '../../types/equipmentStateMachine';
import { StateMachineDiagram } from './StateMachineDiagram';

interface Props {
  attribute: EsmAttribute;
  selectedEdgeId?: string | null;
  onEdgeClick?: (t: EsmTransition) => void;
}

export const AttributePanel: React.FC<Props> = ({ attribute, selectedEdgeId, onEdgeClick }) => {
  const counter = attribute.counter;
  return (
    <div className="esm-attr">
      <div className="esm-attr-head">
        <span className="esm-attr-name">{attribute.name}</span>
        <WxbTag color={ESM_ATTR_TYPE_COLOR[attribute.attrType]}>
          {ESM_ATTR_TYPE_LABEL[attribute.attrType]}
        </WxbTag>
        {attribute.readyText && <span className="esm-attr-ready">{attribute.readyText}</span>}
      </div>

      {counter && (
        <div className="esm-counter">
          <span className="esm-counter-bar" aria-hidden>
            <span
              className="esm-counter-fill"
              style={{ width: `${Math.min(100, Math.round(((counter.current ?? 0) / counter.limit) * 100))}%` }}
            />
          </span>
          <span className="esm-counter-text">
            {counter.current ?? 0} / {counter.limit} {counter.unit}
            {counter.calendarExpiryText ? ` · ${counter.calendarExpiryText}` : ''}
            {counter.productBound ? ' · 产品绑定' : ''}
          </span>
        </div>
      )}

      <StateMachineDiagram
        attribute={attribute}
        selectedEdgeId={selectedEdgeId}
        onEdgeClick={onEdgeClick}
      />

      {attribute.note && <p className="esm-attr-note">{attribute.note}</p>}
    </div>
  );
};

export default AttributePanel;
