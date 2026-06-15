/**
 * WBP2486 排产结果 mock —— 贴真实工艺(临时,待替换为引擎产出)
 *
 * 数据来源:docs/production_scheduling/20_wbp2486_walkthrough.md +
 *   outputs/downstream_schedule_extract_20260511/(车间板提取:Day5 = 16 清洗事件、A–H 人力组)。
 * 真实结构:USP 模板7「WBP2486/B」~32 天(复苏 6h/3人 → Wave → 种子串 → 4000L 灌注 OP-00048 4h/3人 →
 *   接种 → 培养 ~10天不可中断 → 收获 3h/2人)→ DSP ~17 天(AC×4 / VIN / CEX / AEX / HA / 清洗 / UFDF / VF /
 *   后处理房间放行 / 终末配制 / Bulk Fill)。攒批例:2000L 碱液 → 4×500L 跨批(效期 7d)。
 *
 * 时间单位 = 相对原点(originDate)的小时。H(day, hour) 帮手。
 */
import type {
  PsBatch,
  PsCampaign,
  PsDependency,
  PsSchedule,
  PsScheduledOp,
  PsStage,
} from '../types/productionScheduling';

const H = (day: number, hour = 8): number => day * 24 + hour;

const BATCH_ID = 'B123';

const batches: PsBatch[] = [
  { id: BATCH_ID, code: 'WBP2486-B123', productName: 'WBP2486 单抗', day0Hour: H(0, 8) },
];

const stages: PsStage[] = [
  // USP
  { id: 'usp-recovery', batchId: BATCH_ID, name: 'USP·复苏', phase: 'USP' },
  { id: 'usp-expand', batchId: BATCH_ID, name: 'USP·扩增(Wave)', phase: 'USP' },
  { id: 'usp-seed', batchId: BATCH_ID, name: 'USP·种子串(SUB50→2000)', phase: 'USP' },
  { id: 'usp-main', batchId: BATCH_ID, name: 'USP·主培养(4000L ABEC)', phase: 'USP' },
  { id: 'usp-harvest', batchId: BATCH_ID, name: 'USP·收获', phase: 'USP' },
  // DSP
  { id: 'dsp-ac', batchId: BATCH_ID, name: 'DSP·捕获 AC', phase: 'DSP' },
  { id: 'dsp-vin', batchId: BATCH_ID, name: 'DSP·灭活 VIN', phase: 'DSP' },
  { id: 'dsp-cex', batchId: BATCH_ID, name: 'DSP·离子交换 CEX', phase: 'DSP' },
  { id: 'dsp-aex', batchId: BATCH_ID, name: 'DSP·离子交换 AEX', phase: 'DSP' },
  { id: 'dsp-ha', batchId: BATCH_ID, name: 'DSP·精纯 HA', phase: 'DSP' },
  { id: 'dsp-clean', batchId: BATCH_ID, name: 'DSP·中间池清洗(Day5 尖峰)', phase: 'DSP' },
  { id: 'dsp-uf', batchId: BATCH_ID, name: 'DSP·超滤 UFDF', phase: 'DSP' },
  { id: 'dsp-vf', batchId: BATCH_ID, name: 'DSP·病毒过滤 VF', phase: 'DSP' },
  { id: 'dsp-post', batchId: BATCH_ID, name: 'DSP·后处理(房间放行)', phase: 'DSP' },
  { id: 'dsp-final', batchId: BATCH_ID, name: 'DSP·终末配制 + 灌装', phase: 'DSP' },
];

type OpSeed = Omit<PsScheduledOp, 'batchId'>;

const opSeeds: OpSeed[] = [
  // ── USP 复苏 ──
  { id: 'op-recovery', code: 'OP-00001', name: '细胞复苏', kind: 'PRIMARY', category: 'usp-main', stageId: 'usp-recovery', startHour: H(0, 8), endHour: H(0, 14), isAnchor: true, requiredPeople: 3, note: 'USP-Day0 锚点(TAT 定)' },
  // ── USP 扩增 ──
  { id: 'op-wave', name: 'Wave 接种', kind: 'PRIMARY', category: 'usp-main', stageId: 'usp-expand', startHour: H(1, 8), endHour: H(1, 15), requiredPeople: 2 },
  // ── USP 种子串(长培养弹簧) ──
  { id: 'op-sub50', name: 'SUB50 培养', kind: 'PRIMARY', category: 'usp-main', stageId: 'usp-seed', startHour: H(1, 15), endHour: H(3, 8) },
  { id: 'op-sub250', name: 'SUB250 培养', kind: 'PRIMARY', category: 'usp-main', stageId: 'usp-seed', startHour: H(3, 8), endHour: H(5, 8) },
  { id: 'op-sub1000', name: 'SUB1000 培养', kind: 'PRIMARY', category: 'usp-main', stageId: 'usp-seed', startHour: H(5, 8), endHour: H(8, 8) },
  { id: 'op-sub2000', name: 'SUB2000 培养', kind: 'PRIMARY', category: 'usp-main', stageId: 'usp-seed', startHour: H(8, 8), endHour: H(12, 8) },
  // ── USP 主培养(派生配液 + CIP,主链灌注/接种/培养/取样)──
  { id: 'op-media-cip', name: '配液罐 CIP', kind: 'DERIVED', category: 'cip', stageId: 'usp-main', startHour: H(21, 2), endHour: H(21, 4), windowStartHour: H(20, 0), windowEndHour: H(21, 6), resource: { kind: 'cip-station', id: 'CIP-S1', label: 'CIP 主站 S1', line: 'M1' } },
  { id: 'op-media-prep', name: '4000L 培养基配液', kind: 'DERIVED', category: 'buffer-prep', stageId: 'usp-main', startHour: H(21, 4), endHour: H(21, 8), windowStartHour: H(20, 0), windowEndHour: H(21, 18), resource: { kind: 'prep-tank', id: 'BH1701', label: '配液罐 BH1701' }, note: '效期 ~24h(max-lag)' },
  { id: 'op-bag', name: '反应器装袋 + 完整性 + 电极', kind: 'DERIVED', category: 'usp-main', stageId: 'usp-main', startHour: H(21, 8), endHour: H(21, 11), note: 'ABEC SUS:换袋即复位,无 CIP/SIP' },
  { id: 'op-fill', code: 'OP-00048', name: '4000L ABEC 培养基灌注', kind: 'PRIMARY', category: 'usp-main', stageId: 'usp-main', startHour: H(22, 8), endHour: H(22, 12), requiredPeople: 3, note: '固定量 4000L' },
  { id: 'op-inoc', code: 'OP-00050', name: '4000L 接种', kind: 'PRIMARY', category: 'usp-main', stageId: 'usp-main', startHour: H(22, 13), endHour: H(22, 17), requiredPeople: 2 },
  { id: 'op-culture', name: '4000L 发酵培养', kind: 'PRIMARY', category: 'usp-main', stageId: 'usp-main', startHour: H(22, 17), endHour: H(32, 8), interruptible: false, isAnchor: true, note: '不可中断块(整块平移)' },
  { id: 'op-samp1', name: '每日取样', kind: 'DERIVED', category: 'sampling', stageId: 'usp-main', startHour: H(24, 8), endHour: H(24, 9), windowStartHour: H(24, 0), windowEndHour: H(24, 16), note: 'push 日历钩子 ±8h' },
  { id: 'op-samp2', name: '每日取样', kind: 'DERIVED', category: 'sampling', stageId: 'usp-main', startHour: H(26, 8), endHour: H(26, 9), windowStartHour: H(26, 0), windowEndHour: H(26, 16) },
  { id: 'op-samp3', name: '每日取样', kind: 'DERIVED', category: 'sampling', stageId: 'usp-main', startHour: H(28, 8), endHour: H(28, 9), windowStartHour: H(28, 0), windowEndHour: H(28, 16) },
  { id: 'op-samp4', name: '每日取样', kind: 'DERIVED', category: 'sampling', stageId: 'usp-main', startHour: H(30, 8), endHour: H(30, 9), windowStartHour: H(30, 0), windowEndHour: H(30, 16) },
  // ── USP 收获 ──
  { id: 'op-harvest', code: 'OP-00051', name: '收获(Harvest)', kind: 'PRIMARY', category: 'usp-main', stageId: 'usp-harvest', startHour: H(32, 8), endHour: H(32, 11), isAnchor: true, requiredPeople: 2, note: '收获→AC ≤4h 交接' },

  // ── DSP 捕获 AC(DSP-Day1 = USP-Day32)──
  { id: 'op-ac-cip', name: 'AC skid CIP', kind: 'DERIVED', category: 'cip', stageId: 'dsp-ac', startHour: H(32, 12), endHour: H(32, 15), windowStartHour: H(32, 11), windowEndHour: H(33, 0), resource: { kind: 'cip-station', id: 'CIP-S2', label: 'CIP 主站 S2', line: 'M3' } },
  { id: 'op-ac-prime', name: 'AC Prime + 层析管线准备', kind: 'PRIMARY', category: 'dsp-main', stageId: 'dsp-ac', startHour: H(32, 15), endHour: H(33, 3), resource: { kind: 'equipment', id: 'AKTA-1850', label: 'AKTA 1850' } },
  { id: 'op-ac-cycle', name: 'AC 纯化循环(Cycle 1–4)', kind: 'PRIMARY', category: 'dsp-main', stageId: 'dsp-ac', startHour: H(33, 3), endHour: H(34, 12), resource: { kind: 'equipment', id: 'AKTA-1850', label: 'AKTA 1850' }, note: '计次重复 ×4' },
  // ── DSP 灭活 VIN ──
  { id: 'op-vin-buf', name: 'VIN 酸液配液', kind: 'DERIVED', category: 'buffer-prep', stageId: 'dsp-vin', startHour: H(34, 8), endHour: H(34, 11), windowStartHour: H(33, 12), windowEndHour: H(34, 14), resource: { kind: 'prep-tank', id: 'PT1810', label: '配液罐 PT1810' }, note: '效期 24h' },
  { id: 'op-vin', name: 'VIN 灭活(酸化 + 孵育)', kind: 'PRIMARY', category: 'dsp-main', stageId: 'dsp-vin', startHour: H(34, 15), endHour: H(35, 9) },
  // ── DSP 离子交换 CEX ──
  { id: 'op-cex-buf', name: 'CEX buffer 配液', kind: 'DERIVED', category: 'buffer-prep', stageId: 'dsp-cex', startHour: H(35, 6), endHour: H(35, 9), windowStartHour: H(34, 18), windowEndHour: H(35, 12), resource: { kind: 'prep-tank', id: 'PT1811', label: '配液罐 PT1811' } },
  { id: 'op-cex-cip', name: 'CEX skid CIP', kind: 'DERIVED', category: 'cip', stageId: 'dsp-cex', startHour: H(35, 9), endHour: H(35, 12), resource: { kind: 'cip-station', id: 'CIP-S1', label: 'CIP 主站 S1', line: 'M1' } },
  { id: 'op-cex-sip', name: 'CEX skid SIP', kind: 'DERIVED', category: 'sip', stageId: 'dsp-cex', startHour: H(35, 12), endHour: H(35, 14) },
  { id: 'op-cex', name: 'CEX 阳离子层析', kind: 'PRIMARY', category: 'dsp-main', stageId: 'dsp-cex', startHour: H(35, 14), endHour: H(36, 2) },
  { id: 'op-cex-samp', name: 'CEX 取样(立检)', kind: 'DERIVED', category: 'sampling', stageId: 'dsp-cex', startHour: H(36, 2), endHour: H(36, 3), note: '14 点前送 QC' },
  // ── DSP 离子交换 AEX ──
  { id: 'op-aex-cip', name: 'AEX skid CIP', kind: 'DERIVED', category: 'cip', stageId: 'dsp-aex', startHour: H(36, 3), endHour: H(36, 6), resource: { kind: 'cip-station', id: 'CIP-S1', label: 'CIP 主站 S1', line: 'M1' } },
  { id: 'op-aex', name: 'AEX 阴离子层析(Cycle 1–2)', kind: 'PRIMARY', category: 'dsp-main', stageId: 'dsp-aex', startHour: H(36, 6), endHour: H(36, 20) },
  // ── DSP 精纯 HA ──
  { id: 'op-ha-cip', name: 'HA 柱 CIP', kind: 'DERIVED', category: 'cip', stageId: 'dsp-ha', startHour: H(36, 14), endHour: H(36, 17), resource: { kind: 'cip-station', id: 'CIP-S2', label: 'CIP 主站 S2', line: 'M3' } },
  { id: 'op-ha', name: 'HA 羟基磷灰石层析', kind: 'PRIMARY', category: 'dsp-main', stageId: 'dsp-ha', startHour: H(36, 23), endHour: H(37, 16) },
  // ── DSP 中间池清洗(Day5 尖峰:多 CIP/SIP 堆叠,1 处争用报增援)──
  { id: 'op-clean-cip1', name: '储罐 T1813 CIP', kind: 'DERIVED', category: 'cip', stageId: 'dsp-clean', startHour: H(36, 6), endHour: H(36, 9), resource: { kind: 'cip-station', id: 'CIP-S1', label: 'CIP 主站 S1', line: 'M1' } },
  { id: 'op-clean-cip2', name: '储罐 T1814 CIP', kind: 'DERIVED', category: 'cip', stageId: 'dsp-clean', startHour: H(36, 9), endHour: H(36, 12), resource: { kind: 'cip-station', id: 'CIP-S1', label: 'CIP 主站 S1', line: 'M1' } },
  { id: 'op-clean-cip3', name: '储罐 T1815 CIP', kind: 'DERIVED', category: 'cip', stageId: 'dsp-clean', startHour: H(36, 10), endHour: H(36, 13), windowStartHour: H(36, 6), windowEndHour: H(36, 14), resource: { kind: 'cip-station', id: 'CIP-S1', label: 'CIP 主站 S1', line: 'M1' }, conflict: 'OVERLAP', note: '主站 S1 撞用 → 报增援(可动备站)' },
  { id: 'op-clean-cip4', name: '管路集群 CIP', kind: 'DERIVED', category: 'cip', stageId: 'dsp-clean', startHour: H(36, 12), endHour: H(36, 15), resource: { kind: 'cip-station', id: 'CIP-S2', label: 'CIP 主站 S2', line: 'M3' } },
  { id: 'op-clean-cip5', name: '中间池 P1 CIP', kind: 'DERIVED', category: 'cip', stageId: 'dsp-clean', startHour: H(36, 15), endHour: H(36, 18), resource: { kind: 'cip-station', id: 'CIP-S2', label: 'CIP 主站 S2', line: 'M3' } },
  { id: 'op-clean-cip6', name: '中间池 P2 CIP', kind: 'DERIVED', category: 'cip', stageId: 'dsp-clean', startHour: H(36, 18), endHour: H(36, 21), resource: { kind: 'cip-station', id: 'CIP-S2', label: 'CIP 主站 S2', line: 'M3' } },
  { id: 'op-clean-sip1', name: '储罐 T1813 SIP', kind: 'DERIVED', category: 'sip', stageId: 'dsp-clean', startHour: H(36, 9), endHour: H(36, 12) },
  { id: 'op-clean-sip2', name: '储罐 T1814 SIP', kind: 'DERIVED', category: 'sip', stageId: 'dsp-clean', startHour: H(36, 13), endHour: H(36, 16) },
  { id: 'op-clean-sip3', name: '管路集群 SIP', kind: 'DERIVED', category: 'sip', stageId: 'dsp-clean', startHour: H(36, 16), endHour: H(36, 19) },
  // ── DSP 超滤 UFDF ──
  { id: 'op-uf1', name: 'UFDF1 浓缩换液', kind: 'PRIMARY', category: 'dsp-main', stageId: 'dsp-uf', startHour: H(37, 16), endHour: H(38, 16), resource: { kind: 'equipment', id: 'UFDF-1853', label: 'UFDF skid 1853' } },
  { id: 'op-uf2', name: 'UFDF2 浓缩换液', kind: 'PRIMARY', category: 'dsp-main', stageId: 'dsp-uf', startHour: H(38, 16), endHour: H(39, 16), resource: { kind: 'equipment', id: 'UFDF-1853', label: 'UFDF skid 1853' } },
  // ── DSP 病毒过滤 VF ──
  { id: 'op-vf', name: 'VF 病毒过滤(含滤壳测试)', kind: 'PRIMARY', category: 'dsp-main', stageId: 'dsp-vf', startHour: H(39, 16), endHour: H(40, 16), note: 'post-viral 区 · Suite 互斥' },
  // ── DSP 后处理(房间放行)──
  { id: 'op-room-release', name: '房间放行(清场/环境监测/QA)', kind: 'DERIVED', category: 'room-release', stageId: 'dsp-post', startHour: H(40, 8), endHour: H(40, 16), windowStartHour: H(39, 16), windowEndHour: H(41, 0), resource: { kind: 'room', id: 'Room-1218', label: '房间 1218' }, note: 'CHT 24h' },
  { id: 'op-pack', name: '病毒后物料双层包装', kind: 'PRIMARY', category: 'dsp-main', stageId: 'dsp-post', startHour: H(40, 16), endHour: H(41, 0), resource: { kind: 'room', id: 'Room-1218', label: '房间 1218' } },
  // ── DSP 终末配制 + 灌装 ──
  { id: 'op-uf3-buf', name: 'UFDF3 辅料配液', kind: 'DERIVED', category: 'buffer-prep', stageId: 'dsp-final', startHour: H(41, 4), endHour: H(41, 7), windowStartHour: H(40, 16), windowEndHour: H(41, 8) },
  { id: 'op-uf3', name: 'UFDF3 辅料配制 + pH 调整', kind: 'PRIMARY', category: 'dsp-main', stageId: 'dsp-final', startHour: H(41, 8), endHour: H(42, 8) },
  { id: 'op-fill-check', name: '蠕动泵校验 + 无菌过滤', kind: 'PRIMARY', category: 'dsp-main', stageId: 'dsp-final', startHour: H(42, 8), endHour: H(42, 14) },
  { id: 'op-bulkfill', name: 'Bulk Fill 最终分装入冷库', kind: 'PRIMARY', category: 'dsp-main', stageId: 'dsp-final', startHour: H(42, 14), endHour: H(43, 2), note: '产出最终产品' },
];

// ── 攒批 campaign:2000L 碱液 → 4×500L 跨批(效期 7d)──
const CAMPAIGN_STAGE = 'cmp-alkali';
const campaignOps: OpSeed[] = [
  { id: 'op-cmp-cip', name: '配液罐 CIP(碱)', kind: 'DERIVED', category: 'cip', stageId: CAMPAIGN_STAGE, startHour: H(19, 2), endHour: H(19, 4), resource: { kind: 'cip-station', id: 'CIP-S1', label: 'CIP 主站 S1', line: 'M1' } },
  { id: 'op-cmp-prep', name: '2000L 碱液配制(服务 B123–126)', kind: 'DERIVED', category: 'campaign', stageId: CAMPAIGN_STAGE, startHour: H(19, 4), endHour: H(19, 8), resource: { kind: 'prep-tank', id: 'BH1705', label: '配液罐 BH1705' }, note: '效期 7d · 1 次配省 4 次 CIP' },
  { id: 'op-draw-b123', name: 'B123 领用 500L', kind: 'DERIVED', category: 'campaign', stageId: CAMPAIGN_STAGE, startHour: H(20, 8), endHour: H(20, 9) },
  { id: 'op-draw-b124', name: 'B124 领用 500L', kind: 'DERIVED', category: 'campaign', stageId: CAMPAIGN_STAGE, startHour: H(22, 8), endHour: H(22, 9) },
  { id: 'op-draw-b125', name: 'B125 领用 500L', kind: 'DERIVED', category: 'campaign', stageId: CAMPAIGN_STAGE, startHour: H(24, 8), endHour: H(24, 9) },
  { id: 'op-draw-b126', name: 'B126 领用 500L(效期裕度紧)', kind: 'DERIVED', category: 'campaign', stageId: CAMPAIGN_STAGE, startHour: H(26, 8), endHour: H(26, 9), windowStartHour: H(25, 0), windowEndHour: H(26, 8) },
];

const campaigns: PsCampaign[] = [
  {
    id: CAMPAIGN_STAGE,
    materialCode: 'PT-009-ALKALI',
    materialName: '清洗用碱液(NaOH)',
    totalQty: 2000,
    unit: 'L',
    shelfLifeHours: 7 * 24,
    scope: 'cross-batch',
    prepOpId: 'op-cmp-prep',
    cipSaved: 3,
    draws: [
      { batchId: 'B123', qty: 500, consumeOpId: 'op-draw-b123', dueHour: H(20, 8) },
      { batchId: 'B124', qty: 500, consumeOpId: 'op-draw-b124', dueHour: H(22, 8) },
      { batchId: 'B125', qty: 500, consumeOpId: 'op-draw-b125', dueHour: H(24, 8) },
      { batchId: 'B126', qty: 500, consumeOpId: 'op-draw-b126', dueHour: H(26, 8) },
    ],
  },
];

// 攒批 stage(顶层,跨批),挂在虚拟批次容器下便于分组渲染
const campaignStage: PsStage = { id: CAMPAIGN_STAGE, batchId: '__campaign__', name: '攒批 · 2000L 碱液(跨 B123–126)', phase: 'DSP' };

const operations: PsScheduledOp[] = [...opSeeds, ...campaignOps].map((o) => ({
  ...o,
  batchId: o.stageId === CAMPAIGN_STAGE ? '__campaign__' : BATCH_ID,
}));

// ── 时序关系:主链 FS(逐段)+ 收获→AC 接力 + 效期 max-lag ──
const mainChain = [
  'op-recovery', 'op-wave', 'op-sub50', 'op-sub250', 'op-sub1000', 'op-sub2000',
  'op-fill', 'op-inoc', 'op-culture', 'op-harvest',
  'op-ac-prime', 'op-ac-cycle', 'op-vin', 'op-cex', 'op-aex', 'op-ha',
  'op-uf1', 'op-uf2', 'op-vf', 'op-pack', 'op-uf3', 'op-fill-check', 'op-bulkfill',
];

const dependencies: PsDependency[] = [];
for (let i = 0; i < mainChain.length - 1; i += 1) {
  const from = mainChain[i];
  const to = mainChain[i + 1];
  dependencies.push({
    id: `dep-${from}-${to}`,
    fromOpId: from,
    toOpId: to,
    type: 'FS',
    relation: from === 'op-harvest' ? 'handoff' : 'main-chain',
    lagHours: from === 'op-harvest' ? 4 : 0,
    hard: true,
  });
}
// 效期 max-lag 示例(配液 → 消费,超期=不可行)
dependencies.push(
  { id: 'dep-expiry-media', fromOpId: 'op-media-prep', toOpId: 'op-fill', type: 'FS', relation: 'expiry-maxlag', lagHours: 0, hard: true },
  { id: 'dep-expiry-cex', fromOpId: 'op-cex-buf', toOpId: 'op-cex', type: 'FS', relation: 'expiry-maxlag', lagHours: 0, hard: false },
);

export function buildWbp2486MockSchedule(): PsSchedule {
  return {
    id: 'mock-wbp2486',
    name: 'WBP2486 排产结果(mock · 贴真实工艺)',
    originDate: '2026-09-17',
    batches,
    stages: [...stages, campaignStage],
    operations,
    dependencies,
    campaigns,
    cipPeak: { dayIndex: 36, count: 16, label: 'DSP Day5:16 清洗事件(8 CIP + 8 CIP/SIP)' },
  };
}
