/**
 * 派生库 & 包管理界面(模板层 · 无时间无实例)。
 * 权威设计:docs/production_scheduling/10_process_flow_model_spec.md(D2、§3.7 包、§4 派生引擎)。
 *
 * 派生库 = 引擎可 pull 派生的辅助操作模板(CIP/SIP/配液/房间放行/装袋…),**不在主链人编**。
 * 每条 = 需求 + 产出(它满足哪个目标态)+ 递归前置。包 = 可命名复用的操作组,展开即普通操作串。
 * 左:派生操作库(按类别分组)+ 可复用包;右:点选查看详情。数据为 WBP2486 mock,不连后端。
 */
import React, { useMemo, useState } from 'react';
import {
  WxbPageHeader,
  WxbPageSection,
  WxbPageShell,
} from '../components/wxb-ui';
import { buildDerivableLibraryMock } from '../mock/derivableLibraryMock';
import {
  DL_CATEGORY_COLOR_VAR,
  DL_CATEGORY_LABEL,
} from '../types/derivableLibrary';
import type {
  DlCategory,
  DlLibrary,
  DlOperation,
  DlPackage,
} from '../types/derivableLibrary';
import './DerivableLibraryPage.css';

const CATEGORY_ORDER: DlCategory[] = [
  'cip',
  'sip',
  'buffer-prep',
  'room-release',
  'bagging',
  'transfer',
];

type Selection =
  | { kind: 'op'; id: string }
  | { kind: 'pkg'; id: string }
  | null;

/** 缺口图标(inline SVG,禁 emoji):一个齿轮表示「引擎派生」 */
const GearIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M12 8.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7z"
      stroke="var(--wx-blue-600)"
      strokeWidth="1.6"
    />
    <path
      d="M12 2.5l1.3 2.2 2.5-.6.4 2.5 2.3 1-.8 2.4 1.8 1.8-1.8 1.8.8 2.4-2.3 1-.4 2.5-2.5-.6L12 21.5l-1.3-2.2-2.5.6-.4-2.5-2.3-1 .8-2.4-1.8-1.8 1.8-1.8-.8-2.4 2.3-1 .4-2.5 2.5.6L12 2.5z"
      stroke="var(--wx-blue-600)"
      strokeWidth="1.2"
      strokeLinejoin="round"
      opacity="0.55"
    />
  </svg>
);

const findOp = (lib: DlLibrary, id: string): DlOperation | undefined =>
  lib.operations.find((o) => o.id === id);

const OperationCard: React.FC<{
  op: DlOperation;
  selected: boolean;
  onSelect: () => void;
}> = ({ op, selected, onSelect }) => (
  <button
    type="button"
    className={`dl-card${selected ? ' selected' : ''}`}
    onClick={onSelect}
  >
    <div className="dl-card-title">
      <span
        className="dl-cat-tag"
        style={{ background: DL_CATEGORY_COLOR_VAR[op.category] }}
      >
        {DL_CATEGORY_LABEL[op.category]}
      </span>
      {op.code && <span className="dl-code">{op.code}</span>}
      <span className="dl-card-name">{op.name}</span>
    </div>
    <div className="dl-effect-line">
      产出目标态 ·{' '}
      {op.effects.map((e) => e.target).join(' / ') || '—'}
    </div>
    <div className="dl-io">
      {op.demands.slice(0, 3).map((d, i) => (
        <span className="dl-chip demand" key={i} title={d.kind}>
          需 {d.target}
          {d.qty ? ` ·${d.qty}` : ''}
        </span>
      ))}
      {op.demands.length > 3 && (
        <span className="dl-chip more">+{op.demands.length - 3}</span>
      )}
    </div>
  </button>
);

const DerivableLibraryPage: React.FC = () => {
  const lib = useMemo(() => buildDerivableLibraryMock(), []);
  const [selection, setSelection] = useState<Selection>({ kind: 'op', id: 'drv-cip-skid' });

  const byCategory = useMemo(() => {
    const m = new Map<DlCategory, DlOperation[]>();
    for (const c of CATEGORY_ORDER) m.set(c, []);
    for (const o of lib.operations) m.get(o.category)?.push(o);
    return m;
  }, [lib]);

  const selectedOp =
    selection?.kind === 'op' ? findOp(lib, selection.id) : undefined;
  const selectedPkg: DlPackage | undefined =
    selection?.kind === 'pkg'
      ? lib.packages.find((p) => p.id === selection.id)
      : undefined;

  return (
    <WxbPageShell size="full" gap="lg" className="dl-page">
      <WxbPageHeader
        eyebrow="排产 · 派生库 & 包管理(模板层 · 无时间无实例)"
        title={`派生库 — ${lib.name}`}
        description="引擎可 pull 派生的辅助操作模板:CIP/SIP/配液/房间放行/装袋。每条 = 需求 + 产出(满足哪个目标态)+ 递归前置;引擎按需求目标态用 effect-matching 反向匹配派生。"
        meta={
          <span className="dl-meta">
            {lib.operations.length} 条派生操作 · {lib.packages.length} 个可复用包 ·
            动作 schema(不展开 / 不落实例)
          </span>
        }
      />

      <div className="dl-banner">
        <strong>这些不在主链人编。</strong>
        {lib.derivedNote}
      </div>

      <WxbPageSection variant="framed" density="compact">
        <div className="dl-legend" role="list" aria-label="派生类别图例">
          {CATEGORY_ORDER.map((c) => (
            <span className="dl-legend-item" role="listitem" key={c}>
              <span
                className="dl-legend-swatch"
                style={{ background: DL_CATEGORY_COLOR_VAR[c] }}
              />
              {DL_CATEGORY_LABEL[c]}（{byCategory.get(c)?.length ?? 0}）
            </span>
          ))}
        </div>
      </WxbPageSection>

      <div className="dl-split">
        {/* 左:派生操作库 + 可复用包 */}
        <WxbPageSection variant="framed" density="compact" className="dl-list-col">
          <div className="dl-two">
            {/* 派生操作库 */}
            <div>
              <div className="dl-view-label">
                派生操作库 · 按类别(点选查看详情)
              </div>
              {CATEGORY_ORDER.map((c) => {
                const ops = byCategory.get(c) ?? [];
                if (!ops.length) return null;
                return (
                  <div className="dl-group" key={c}>
                    <div className="dl-group-head">
                      <span
                        className="dl-cat-dot"
                        style={{ background: DL_CATEGORY_COLOR_VAR[c] }}
                      />
                      {DL_CATEGORY_LABEL[c]}
                      <span className="dl-count">· {ops.length} 条</span>
                    </div>
                    {ops.map((op) => (
                      <OperationCard
                        key={op.id}
                        op={op}
                        selected={
                          selection?.kind === 'op' && selection.id === op.id
                        }
                        onSelect={() =>
                          setSelection({ kind: 'op', id: op.id })
                        }
                      />
                    ))}
                  </div>
                );
              })}
            </div>

            {/* 可复用包 */}
            <div>
              <div className="dl-view-label">
                可复用包 · 展开即操作串(点选查看)
              </div>
              {lib.packages.map((pkg) => (
                <button
                  type="button"
                  key={pkg.id}
                  className={`dl-card${
                    selection?.kind === 'pkg' && selection.id === pkg.id
                      ? ' selected'
                      : ''
                  }`}
                  onClick={() => setSelection({ kind: 'pkg', id: pkg.id })}
                >
                  <div className="dl-card-title">
                    {pkg.code && <span className="dl-code">{pkg.code}</span>}
                    <span className="dl-card-name">{pkg.name}</span>
                    <span className="dl-count">· {pkg.opIds.length} 步</span>
                  </div>
                  <div className="dl-seq">
                    {pkg.opIds.map((opId, i) => {
                      const o = findOp(lib, opId);
                      return (
                        <React.Fragment key={opId}>
                          {i > 0 && <span className="dl-seq-arrow">→</span>}
                          <span className="dl-seq-step">
                            {o?.name ?? opId}
                          </span>
                        </React.Fragment>
                      );
                    })}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </WxbPageSection>

        {/* 右:检视 / 详情 */}
        <WxbPageSection variant="framed" density="compact" className="dl-inspector">
          <div className="dl-view-label">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <GearIcon />
              检视 / 详情
            </span>
          </div>

          {selectedOp && (
            <div>
              <div className="dl-detail-title">
                <span
                  className="dl-cat-tag"
                  style={{ background: DL_CATEGORY_COLOR_VAR[selectedOp.category] }}
                >
                  {DL_CATEGORY_LABEL[selectedOp.category]}
                </span>
                {selectedOp.code && (
                  <span className="dl-code">{selectedOp.code}</span>
                )}
                {selectedOp.name}
              </div>

              <div className="dl-trigger">
                <strong>拉动条件:</strong>
                {selectedOp.pullTrigger}
              </div>

              <dl className="dl-dl">
                <dt>产出 effects</dt>
                <dd>
                  <ul className="dl-detail-list">
                    {selectedOp.effects.map((e, i) => (
                      <li key={i}>
                        <span className="dl-chip effect">{e.kind}</span>{' '}
                        {e.target}
                        {e.shelfLife ? ` · 效期 ${e.shelfLife}` : ''}
                      </li>
                    ))}
                  </ul>
                </dd>
                <dt>需求 demands</dt>
                <dd>
                  <ul className="dl-detail-list">
                    {selectedOp.demands.map((d, i) => (
                      <li key={i}>
                        <span className="dl-chip demand">{d.kind}</span>{' '}
                        {d.target}
                        {d.qty ? ` · ${d.qty}` : ''}
                      </li>
                    ))}
                  </ul>
                </dd>
              </dl>

              {selectedOp.recursiveNote && (
                <p className="dl-recursive-hint">
                  <strong>递归前置:</strong>
                  {selectedOp.recursiveNote}
                </p>
              )}
              {selectedOp.priorityNote && (
                <p className="dl-priority-hint">
                  <strong>优先级:</strong>
                  {selectedOp.priorityNote}
                </p>
              )}
            </div>
          )}

          {selectedPkg && (
            <div>
              <div className="dl-detail-title">
                {selectedPkg.code && (
                  <span className="dl-code">{selectedPkg.code}</span>
                )}
                {selectedPkg.name}
                <span className="dl-count">· {selectedPkg.opIds.length} 步</span>
              </div>
              <div className="dl-trigger">{selectedPkg.description}</div>
              <div className="dl-view-label">展开操作串</div>
              {selectedPkg.opIds.map((opId, i) => {
                const o = findOp(lib, opId);
                return (
                  <div className="dl-pkg-step" key={opId}>
                    <span className="dl-pkg-step-idx">{i + 1}</span>
                    <span className="dl-pkg-step-body">
                      <span className="dl-pkg-step-name">
                        {o?.name ?? opId}
                        {o && (
                          <span
                            className="dl-cat-tag"
                            style={{
                              marginLeft: 8,
                              background: DL_CATEGORY_COLOR_VAR[o.category],
                            }}
                          >
                            {DL_CATEGORY_LABEL[o.category]}
                          </span>
                        )}
                      </span>
                      {o && (
                        <span className="dl-pkg-step-effect">
                          产出 · {o.effects.map((e) => e.target).join(' / ')}
                        </span>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {!selectedOp && !selectedPkg && (
            <div className="dl-empty">
              点选左侧一条派生操作或一个包查看详情。
            </div>
          )}
        </WxbPageSection>
      </div>
    </WxbPageShell>
  );
};

export default DerivableLibraryPage;
