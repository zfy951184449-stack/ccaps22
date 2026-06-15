/**
 * 占用语义示意(C11):同一批溶液,占两类资源的「时间形状」截然不同 ——
 *   配液罐 = 只占「配制 + CIP」那几小时,转储到储存容器后立刻释放(短占);
 *   储存容器 = 从转储进来到效期末 / 用完,整段占用(效期内占)。
 * 这是「为什么配液罐通常不是瓶颈、真占用在储存容器」的可视化解释。
 * 纯展示 SVG,颜色只用 --wx 变量;无数据依赖。
 */
import React from 'react';

const W = 760;
const ROW_H = 30;
const LABEL_W = 132;
const TRACK_X = LABEL_W + 8;
const TRACK_W = W - TRACK_X - 16;

/** 时间刻度(相对小时,仅示意比例):0 配制 → 转储 → 效期末 */
const T_PREP_END = 0.12; // 配制 + CIP 占到这
const T_SHELF_END = 0.86; // 储存容器占到效期末

export const PsOccupancyDiagram: React.FC = () => {
  const x = (t: number) => TRACK_X + t * TRACK_W;
  const transferX = x(T_PREP_END);

  return (
    <div className="psrm-occ">
      <div className="psrm-occ-title">占用语义:同一批溶液,两类资源的「时间形状」不同(C11)</div>
      <svg viewBox={`0 0 ${W} ${ROW_H * 2 + 56}`} width="100%" height={ROW_H * 2 + 56} role="img" aria-label="配液罐短占 vs 储存容器效期内占">
        {/* 时间轴底线 */}
        <line x1={TRACK_X} y1={28} x2={TRACK_X + TRACK_W} y2={28} stroke="var(--wx-blue-100)" strokeWidth="1" />
        {/* 关键时刻竖虚线 */}
        <line x1={TRACK_X} y1={20} x2={TRACK_X} y2={ROW_H * 2 + 34} stroke="var(--wx-blue-300)" strokeWidth="1" strokeDasharray="3 3" />
        <line x1={transferX} y1={20} x2={transferX} y2={ROW_H * 2 + 34} stroke="var(--wx-amber-500)" strokeWidth="1" strokeDasharray="3 3" />
        <line x1={x(T_SHELF_END)} y1={20} x2={x(T_SHELF_END)} y2={ROW_H * 2 + 34} stroke="var(--wx-red-500)" strokeWidth="1" strokeDasharray="3 3" />
        {/* 时刻标注 */}
        <text x={TRACK_X} y={16} fontSize="10.5" textAnchor="middle" fill="var(--wx-text-secondary, var(--wx-blue-700))">配制开始</text>
        <text x={transferX} y={16} fontSize="10.5" textAnchor="middle" fill="var(--wx-amber-700)">转储/释放</text>
        <text x={x(T_SHELF_END)} y={16} fontSize="10.5" textAnchor="middle" fill="var(--wx-amber-700)">效期末</text>

        {/* 行 1:配液罐 = 短占 */}
        <text x={LABEL_W} y={28 + ROW_H * 0 + 20} fontSize="12" fontWeight="600" textAnchor="end" fill="var(--wx-blue-700)">配液罐</text>
        <rect x={TRACK_X} y={28 + ROW_H * 0 + 6} width={transferX - TRACK_X} height={ROW_H - 12} rx={4} fill="var(--wx-blue-300)" stroke="var(--wx-primary, var(--wx-blue-600))" />
        <text x={(TRACK_X + transferX) / 2} y={28 + ROW_H * 0 + 20} fontSize="10" textAnchor="middle" fill="var(--wx-blue-700)">配制 + CIP</text>
        {/* 释放后空轨 */}
        <text x={transferX + 10} y={28 + ROW_H * 0 + 20} fontSize="10.5" fill="var(--wx-text-secondary, var(--wx-blue-700))">↑ 转储后立刻释放(短占 → 通常非瓶颈)</text>

        {/* 行 2:储存容器 = 效期内占 */}
        <text x={LABEL_W} y={28 + ROW_H * 1 + 20} fontSize="12" fontWeight="600" textAnchor="end" fill="var(--wx-blue-700)">储存容器</text>
        <rect x={transferX} y={28 + ROW_H * 1 + 6} width={x(T_SHELF_END) - transferX} height={ROW_H - 12} rx={4} fill="var(--wx-green-100)" stroke="var(--wx-green-500)" />
        <text x={(transferX + x(T_SHELF_END)) / 2} y={28 + ROW_H * 1 + 20} fontSize="10" textAnchor="middle" fill="var(--wx-green-700)">效期内整段占(真正的占用 / 瓶颈)</text>
      </svg>
    </div>
  );
};

export default PsOccupancyDiagram;
