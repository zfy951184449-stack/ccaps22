/**
 * WBP2486 工艺流模板 mock(模板层,无时间)—— 主工艺构建界面用。
 * 只含「主工艺链」(人编 PRIMARY);CIP/SIP/配液/房间放行 等辅助不在此,由引擎在批次层按需求派生。
 * 结构源自 docs/production_scheduling/20_wbp2486_walkthrough.md(真实工艺)。
 */
import type { PfOperation, PfStage, PfTemplate } from '../types/processFlowTemplate';

const op = (o: PfOperation): PfOperation => o;

const stages: PfStage[] = [
  {
    id: 'usp-recovery',
    name: 'USP·复苏',
    phase: 'USP',
    operations: [
      op({
        id: 'op-recovery', code: 'OP-00001', name: '细胞复苏', anchor: true, durationText: '6h', people: 3,
        demands: [
          { kind: 'material', target: '细胞库(WCB)@可用' },
          { kind: 'labor', target: '操作工 ×3' },
        ],
        effects: [{ kind: 'produce-material', target: '复苏细胞@活化', shelfLife: '—' }],
        temporal: { relation: 'after', windowText: 'Day0 锚点(TAT 定)', hard: true },
      }),
    ],
  },
  {
    id: 'usp-expand',
    name: 'USP·扩增(Wave)',
    phase: 'USP',
    operations: [
      op({
        id: 'op-wave', name: 'Wave 接种', anchor: false, durationText: '7h', people: 2,
        demands: [
          { kind: 'material', target: '复苏细胞@活化' },
          { kind: 'equipment', target: 'Wave 袋@installed' },
        ],
        effects: [{ kind: 'produce-material', target: 'Wave 培养液@扩增中' }],
        temporal: { refOpId: 'op-recovery', relation: 'after', windowText: '复苏后接续' },
      }),
    ],
  },
  {
    id: 'usp-seed',
    name: 'USP·种子串(SUB50→2000)',
    phase: 'USP',
    operations: [
      op({ id: 'op-sub50', name: 'SUB50 培养', anchor: false, durationText: '2d', demands: [{ kind: 'material', target: 'Wave 培养液@扩增中' }, { kind: 'equipment', target: 'SUB50@ready' }], effects: [{ kind: 'produce-material', target: 'SUB50 种子液' }], temporal: { relation: 'after', windowText: '递级扩增(生物学定)' } }),
      op({ id: 'op-sub250', name: 'SUB250 培养', anchor: false, durationText: '2d', demands: [{ kind: 'material', target: 'SUB50 种子液' }, { kind: 'equipment', target: 'SUB250@ready' }], effects: [{ kind: 'produce-material', target: 'SUB250 种子液' }], temporal: { refOpId: 'op-sub50', relation: 'after' } }),
      op({ id: 'op-sub1000', name: 'SUB1000 培养', anchor: false, durationText: '3d', demands: [{ kind: 'material', target: 'SUB250 种子液' }, { kind: 'equipment', target: 'SUB1000@ready' }], effects: [{ kind: 'produce-material', target: 'SUB1000 种子液' }], temporal: { refOpId: 'op-sub250', relation: 'after' } }),
      op({ id: 'op-sub2000', name: 'SUB2000 培养', anchor: false, durationText: '4d', demands: [{ kind: 'material', target: 'SUB1000 种子液' }, { kind: 'equipment', target: 'SUB2000@ready' }], effects: [{ kind: 'produce-material', target: 'SUB2000 种子液' }], temporal: { refOpId: 'op-sub1000', relation: 'after' } }),
    ],
  },
  {
    id: 'usp-main',
    name: 'USP·主培养(4000L ABEC)',
    phase: 'USP',
    operations: [
      op({
        id: 'op-fill', code: 'OP-00048', name: '4000L ABEC 培养基灌注', anchor: true, durationText: '4h', people: 3,
        demands: [
          { kind: 'material', target: '培养基@已配制·效期内', qty: '4000L' },
          { kind: 'equipment', target: '反应器·袋=installed' },
        ],
        effects: [{ kind: 'set-equipment-state', target: '反应器.介质=已灌注' }],
        temporal: { refOpId: 'op-sub2000', relation: 'after', windowText: '种子就绪后' },
      }),
      op({
        id: 'op-inoc', code: 'OP-00050', name: '4000L 接种', anchor: false, durationText: '4h', people: 2,
        demands: [{ kind: 'material', target: 'SUB2000 种子液' }, { kind: 'material', target: '培养基@已灌注' }],
        effects: [{ kind: 'produce-material', target: '4000L 培养液@培养中(驻留反应器)' }],
        temporal: { refOpId: 'op-fill', relation: 'zero-wait', windowText: '灌注后零等待', hard: true },
      }),
      op({
        id: 'op-culture', name: '4000L 发酵培养', anchor: true, interruptible: false, durationText: '10d',
        demands: [{ kind: 'material', target: '4000L 培养液@培养中' }],
        effects: [{ kind: 'produce-material', target: '收获前培养液@成熟' }],
        temporal: { refOpId: 'op-inoc', relation: 'after', windowText: '不可中断块(整块平移)', hard: true },
      }),
    ],
  },
  {
    id: 'usp-harvest',
    name: 'USP·收获',
    phase: 'USP',
    operations: [
      op({
        id: 'op-harvest', code: 'OP-00051', name: '收获(Harvest)', anchor: true, durationText: '3h', people: 2,
        demands: [{ kind: 'material', target: '收获前培养液@成熟' }],
        effects: [{ kind: 'produce-material', target: '收获液@待捕获', shelfLife: '短 hold' }],
        temporal: { refOpId: 'op-culture', relation: 'after', windowText: '培养结束' },
      }),
    ],
  },
  // ── DSP ──
  {
    id: 'dsp-ac',
    name: 'DSP·捕获 AC',
    phase: 'DSP',
    operations: [
      op({
        id: 'op-ac-prime', name: 'AC Prime + 管线准备', anchor: false, durationText: '12h',
        demands: [{ kind: 'material', target: '收获液@待捕获' }, { kind: 'equipment', target: 'AKTA·AC skid@clean∧sterile' }, { kind: 'material', target: 'AC buffer@已配制·效期内' }],
        effects: [{ kind: 'set-equipment-state', target: 'AC skid.状态=primed' }],
        temporal: { refOpId: 'op-harvest', relation: 'within', windowText: '收获后 ≤4h(接力)', hard: true },
      }),
      op({
        id: 'op-ac-cycle', name: 'AC 纯化循环', anchor: false, durationText: '2d',
        demands: [{ kind: 'equipment', target: 'AC skid.状态=primed' }],
        effects: [{ kind: 'produce-material', target: 'AC 洗脱池@捕获产物' }],
        temporal: { refOpId: 'op-ac-prime', relation: 'after', windowText: '计次重复 ×4' },
      }),
    ],
  },
  {
    id: 'dsp-vin',
    name: 'DSP·灭活 VIN',
    phase: 'DSP',
    operations: [
      op({ id: 'op-vin', name: 'VIN 灭活(酸化 + 孵育)', anchor: false, durationText: '18h', demands: [{ kind: 'material', target: 'AC 洗脱池@捕获产物' }, { kind: 'material', target: 'VIN 酸液@已配制·效期内' }], effects: [{ kind: 'produce-material', target: 'VIN 灭活池@中间产物' }], temporal: { refOpId: 'op-ac-cycle', relation: 'after' } }),
    ],
  },
  {
    id: 'dsp-cex',
    name: 'DSP·离子交换 CEX',
    phase: 'DSP',
    operations: [
      op({
        id: 'op-cex', name: 'CEX 阳离子层析', anchor: false, durationText: '12h',
        demands: [{ kind: 'material', target: 'VIN 灭活池@中间产物' }, { kind: 'equipment', target: 'CEX skid@clean∧sterile' }, { kind: 'material', target: 'CEX buffer@已配制·效期内' }],
        effects: [{ kind: 'produce-material', target: 'CEX 洗脱池' }],
        temporal: { refOpId: 'op-vin', relation: 'after', windowText: '样品 14 点前送 QC' },
      }),
    ],
  },
  {
    id: 'dsp-aex',
    name: 'DSP·离子交换 AEX',
    phase: 'DSP',
    operations: [
      op({ id: 'op-aex', name: 'AEX 阴离子层析(Cycle 1–2)', anchor: false, durationText: '14h', demands: [{ kind: 'material', target: 'CEX 洗脱池' }, { kind: 'equipment', target: 'AEX skid@clean∧sterile' }], effects: [{ kind: 'produce-material', target: 'AEX 流穿池' }], temporal: { refOpId: 'op-cex', relation: 'after' } }),
    ],
  },
  {
    id: 'dsp-ha',
    name: 'DSP·精纯 HA',
    phase: 'DSP',
    operations: [
      op({ id: 'op-ha', name: 'HA 羟基磷灰石层析', anchor: false, durationText: '17h', demands: [{ kind: 'material', target: 'AEX 流穿池' }, { kind: 'equipment', target: 'HA 柱@clean∧sterile·在寿命' }], effects: [{ kind: 'produce-material', target: 'HA 洗脱池@精纯' }], temporal: { refOpId: 'op-aex', relation: 'after' } }),
    ],
  },
  {
    id: 'dsp-uf',
    name: 'DSP·超滤 UFDF',
    phase: 'DSP',
    operations: [
      op({ id: 'op-uf1', name: 'UFDF1 浓缩换液', anchor: false, durationText: '24h', demands: [{ kind: 'material', target: 'HA 洗脱池@精纯' }, { kind: 'equipment', target: 'UFDF skid@ready' }], effects: [{ kind: 'produce-material', target: 'UFDF1 产物' }], temporal: { refOpId: 'op-ha', relation: 'after' } }),
      op({ id: 'op-uf2', name: 'UFDF2 浓缩换液', anchor: false, durationText: '24h', demands: [{ kind: 'material', target: 'UFDF1 产物' }], effects: [{ kind: 'produce-material', target: 'UFDF2 产物' }], temporal: { refOpId: 'op-uf1', relation: 'after' } }),
    ],
  },
  {
    id: 'dsp-vf',
    name: 'DSP·病毒过滤 VF',
    phase: 'DSP',
    operations: [
      op({ id: 'op-vf', name: 'VF 病毒过滤(含滤壳测试)', anchor: false, durationText: '24h', demands: [{ kind: 'material', target: 'UFDF2 产物' }], effects: [{ kind: 'produce-material', target: '病毒后产物@post-viral', shelfLife: '4h' }], temporal: { refOpId: 'op-uf2', relation: 'after', windowText: 'post-viral · Suite 互斥' } }),
    ],
  },
  {
    id: 'dsp-post',
    name: 'DSP·后处理',
    phase: 'DSP',
    operations: [
      op({ id: 'op-pack', name: '病毒后物料双层包装', anchor: false, durationText: '8h', demands: [{ kind: 'material', target: '病毒后产物@post-viral' }, { kind: 'equipment', target: '房间@released' }], effects: [{ kind: 'produce-material', target: '包装中间产物' }], temporal: { refOpId: 'op-vf', relation: 'within', windowText: 'VF 后 ≤4h', hard: true } }),
    ],
  },
  {
    id: 'dsp-final',
    name: 'DSP·终末配制 + 灌装',
    phase: 'DSP',
    operations: [
      op({ id: 'op-uf3', name: 'UFDF3 辅料配制 + pH 调整', anchor: false, durationText: '24h', demands: [{ kind: 'material', target: '包装中间产物' }, { kind: 'material', target: '辅料@已配制' }], effects: [{ kind: 'produce-material', target: '终配料液' }], temporal: { refOpId: 'op-pack', relation: 'after' } }),
      op({ id: 'op-bulkfill', name: 'Bulk Fill 最终分装入冷库', anchor: true, durationText: '12h', demands: [{ kind: 'material', target: '终配料液' }, { kind: 'equipment', target: '灌装线@无菌' }], effects: [{ kind: 'produce-material', target: '原液成品(冷库)' }], temporal: { refOpId: 'op-uf3', relation: 'after', windowText: '过夜入冷库' } }),
    ],
  },
];

export function buildWbp2486Template(): PfTemplate {
  return {
    id: 'tpl-wbp2486',
    code: 'WBP2486/B',
    name: 'WBP2486 单抗 · 主工艺流(USP→DSP)',
    stages,
    hooks: [
      { id: 'hook-sampling', type: 'push-calendar', label: '每日取样', boundTo: 'op-culture', note: '绑「接种→收获」弹簧,每日一次 ±8h,次数随培养天数自适配' },
      { id: 'hook-feed', type: 'push-calendar', label: '每日/隔日补料', boundTo: 'op-culture', note: '同机制,周期可配' },
      { id: 'hook-ac-cycle', type: 'push-count', label: 'AC Cycle ×4', boundTo: 'op-ac-cycle', note: '计次重复,改 N 即改循环数' },
      { id: 'hook-handoff', type: 'link', label: '收获→AC 接力', boundTo: 'op-harvest', note: '收获液被 AC 消费 = demand/effect + 时序(≤4h)' },
    ],
    derivedNote:
      '本模板只含主工艺链。CIP/SIP/配液/房间放行 等辅助操作不在此编 —— 引擎会在批次层,按各操作 demands(如「CEX skid@clean∧sterile」「buffer@已配制」「房间@released」)用目标回归自动派生。',
  };
}
