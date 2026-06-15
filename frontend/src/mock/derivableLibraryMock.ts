/**
 * 派生库 mock(模板层,无时间无实例)—— 派生库界面用。
 * 贴真实 WBP2486 工艺(见 docs/production_scheduling/20_wbp2486_walkthrough.md)。
 * 这些都是引擎可 pull 派生的 DERIVABLE 操作 schema:CIP/SIP/配液/房间放行/装袋,以及可复用包。
 * 不连后端,页面直接 import(对齐 ProcessFlowBuilderPage 的 mock 用法)。
 */
import type { DlLibrary, DlOperation, DlPackage } from '../types/derivableLibrary';

const op = (o: DlOperation): DlOperation => o;

const operations: DlOperation[] = [
  // ── CIP 清洗 ──
  op({
    id: 'drv-cip-skid',
    code: 'DRV-CIP-01',
    name: 'CIP 站清洗(管线/skid)',
    category: 'cip',
    pullTrigger: '操作需求「skid/管线@clean」未满足时拉动:把目标设备从 dirty → clean。',
    demands: [
      { kind: 'equipment', target: 'CIP 站@available(主站优先 / 备站应急)' },
      { kind: 'utility', target: 'WFI(注射用水)', qty: '按需' },
      { kind: 'utility', target: 'CIP 清洗剂(碱/酸/中和)' },
      { kind: 'labor', target: '操作工 ×1' },
    ],
    effects: [{ kind: 'set-equipment-state', target: '设备.洁净=clean', shelfLife: 'CHT 72h' }],
    recursiveNote: 'CIP 自身需 CIP 站 + WFI + 清洗剂 + 人 —— 引擎会继续向下递归(成环检测保证「CIP 需 CIP」报配置错误)。',
    priorityNote: '主链 CIP 优先级 > 配液罐 CIP(D21/C16):抢同一主站时主链先排。',
  }),
  op({
    id: 'drv-cip-bufftank',
    code: 'DRV-CIP-02',
    name: '配液罐 CIP',
    category: 'cip',
    pullTrigger: '配液前需求「配液罐@clean」未满足时拉动;配液罐转储释放后变 dirty,下一轮配制前需重洗。',
    demands: [
      { kind: 'equipment', target: 'CIP 站@available' },
      { kind: 'utility', target: 'WFI', qty: '按需' },
      { kind: 'labor', target: '操作工 ×1' },
    ],
    effects: [{ kind: 'set-equipment-state', target: '配液罐.洁净=clean', shelfLife: 'CHT 72h' }],
    recursiveNote: '与 skid CIP 共用 CIP 站资源;Day5 主链多 skid同时需洁净 → CIP 站尖峰(报增援典型触发点)。',
    priorityNote: '低于主链 CIP;最后一招微调只在自身 DHT/CHT 窗内。',
  }),

  // ── SIP 灭菌 ──
  op({
    id: 'drv-sip',
    code: 'DRV-SIP-01',
    name: 'SIP 在线灭菌',
    category: 'sip',
    pullTrigger: '无菌工序需求「skid/罐@clean∧sterile」未满足时拉动:在 clean 基础上灭菌。',
    demands: [
      { kind: 'equipment', target: '目标设备.洁净=clean(SIP 前置)' },
      { kind: 'utility', target: '纯蒸汽(clean steam)' },
      { kind: 'labor', target: '操作工 ×1' },
    ],
    effects: [{ kind: 'set-equipment-state', target: '设备.无菌=sterile', shelfLife: 'SHT 48h' }],
    recursiveNote: 'SIP 需先 clean → 反向匹配 CIP 站清洗(drv-cip-skid)作为前置,递归派生。',
    priorityNote: '「层析 skid准备」包内 CIP→SIP 的第二步;两步顺序硬约束。',
  }),

  // ── 配液 ──
  op({
    id: 'drv-buffer-cex',
    code: 'DRV-BUF-CEX',
    name: 'CEX buffer 配液',
    category: 'buffer-prep',
    pullTrigger: 'CEX 阳离子层析需求「CEX buffer@已配制·效期内」未满足时拉动配制。',
    demands: [
      { kind: 'equipment', target: '配液罐@clean' },
      { kind: 'material', target: '盐/缓冲母液 + WFI', qty: '按配方' },
      { kind: 'labor', target: '配液工 ×1' },
    ],
    effects: [{ kind: 'produce-material', target: 'CEX buffer@已配制·效期内', shelfLife: '7d' }],
    recursiveNote: '配制后转储到储袋(见「配液罐转储释放」)腾出罐;buffer 效期 7d → 批次层落为 max-lag。',
    priorityNote: '可攒批:一次大批配制、分装服务多批,省 CIP 次数(攒批 campaign)。',
  }),
  op({
    id: 'drv-buffer-vin',
    code: 'DRV-BUF-VIN',
    name: 'VIN 酸液配液',
    category: 'buffer-prep',
    pullTrigger: 'VIN 病毒灭活需求「VIN 酸液@已配制·效期内」未满足时拉动配制。',
    demands: [
      { kind: 'equipment', target: '配液罐@clean' },
      { kind: 'material', target: '酸 + WFI', qty: '按配方' },
      { kind: 'labor', target: '配液工 ×1' },
    ],
    effects: [{ kind: 'produce-material', target: 'VIN 酸液@已配制·效期内', shelfLife: '3d' }],
    recursiveNote: '配制前需配液罐@clean → 反向匹配配液罐 CIP(drv-cip-bufftank)。',
  }),

  // ── 房间放行 ──
  op({
    id: 'drv-room-release',
    code: 'DRV-ROOM-01',
    name: '房间放行(清场 + 环境监测 + QA 放行)',
    category: 'room-release',
    pullTrigger: '需求「房间@released」未满足时拉动(房间 = 带放行状态机的设备实例)。',
    demands: [
      { kind: 'equipment', target: '目标房间@未放行' },
      { kind: 'labor', target: 'QA + 操作工' },
      { kind: 'utility', target: '环境监测(EM)采样' },
    ],
    effects: [{ kind: 'set-equipment-state', target: '房间.放行=released', shelfLife: 'CHT 洁净有效期' }],
    recursiveNote: '与 CIP 同机制的转移操作;补上目标回归对房间的 producer，避免回归不终止。',
  }),

  // ── 装袋 / 完整性测试(一次性反应器前期准备)──
  op({
    id: 'drv-bagging',
    code: 'DRV-BAG-01',
    name: '反应器装袋',
    category: 'bagging',
    pullTrigger: '一次性反应器需求「反应器·袋=installed」未满足时拉动(换袋即复位,无 CIP/SIP)。',
    demands: [
      { kind: 'material', target: '一次性培养袋(规格匹配)' },
      { kind: 'labor', target: '操作工 ×2' },
    ],
    effects: [{ kind: 'set-equipment-state', target: '反应器.袋=installed' }],
  }),
  op({
    id: 'drv-integrity',
    code: 'DRV-BAG-02',
    name: '完整性测试',
    category: 'bagging',
    pullTrigger: '装袋后需求「袋@完整性合格」未满足时拉动:压力衰减/气泡点测试。',
    demands: [
      { kind: 'equipment', target: '完整性测试仪' },
      { kind: 'labor', target: '操作工 ×1' },
    ],
    effects: [{ kind: 'set-equipment-state', target: '反应器.袋=完整性合格' }],
    recursiveNote: '前置:反应器.袋=installed(drv-bagging)。',
  }),
  op({
    id: 'drv-electrode',
    code: 'DRV-BAG-03',
    name: '电极安装与校准',
    category: 'bagging',
    pullTrigger: '培养前需求「pH/DO 电极@已校准」未满足时拉动。',
    demands: [
      { kind: 'material', target: 'pH/DO 电极 + 校准液' },
      { kind: 'labor', target: '操作工 ×1' },
    ],
    effects: [{ kind: 'set-equipment-state', target: '反应器.电极=已校准' }],
  }),

  // ── 转储释放(配液罐 → 储存态,腾出罐)──
  op({
    id: 'drv-transfer',
    code: 'DRV-XFER-01',
    name: '配液罐转储释放',
    category: 'transfer',
    pullTrigger: '配制完成后把溶液转移到储袋/储罐,腾出配液罐(配液罐只占「配制 + CIP」那几小时)。',
    demands: [
      { kind: 'equipment', target: '储袋 / 储罐(储存容器)' },
      { kind: 'labor', target: '操作工 ×1' },
    ],
    effects: [{ kind: 'produce-material', target: '溶液@储存态(在效期内占储存容器)' }],
    recursiveNote: '转储后配液罐变 dirty → 下一轮配制前需配液罐 CIP(drv-cip-bufftank)。',
    priorityNote: '真正「有时不够」的资源 = 储存容器 / CIP 站 / 某规格罐(待业务点定)。',
  }),
];

const packages: DlPackage[] = [
  {
    id: 'pkg-reactor-prep',
    code: 'PKG-RX-PREP',
    name: '反应器前期准备',
    description: '一次性反应器投产前的标准组合:装袋 → 完整性测试 → 电极安装校准。展开即三道普通派生操作串。',
    opIds: ['drv-bagging', 'drv-integrity', 'drv-electrode'],
  },
  {
    id: 'pkg-chrom-skid-prep',
    code: 'PKG-CHROM-PREP',
    name: '层析 skid准备',
    description: '层析 skid(AC/CEX/AEX)上样前的标准组合:CIP 清洗 → SIP 灭菌,产出 clean∧sterile。展开即两道派生操作串,顺序硬约束。',
    opIds: ['drv-cip-skid', 'drv-sip'],
  },
  {
    id: 'pkg-buffer-cycle',
    code: 'PKG-BUF-CYCLE',
    name: '配液罐周转',
    description: '配液罐一轮完整周转:配液罐 CIP → 配液 → 转储释放(腾罐)。可被任一 buffer 配液复用。',
    opIds: ['drv-cip-bufftank', 'drv-buffer-cex', 'drv-transfer'],
  },
];

export function buildDerivableLibraryMock(): DlLibrary {
  return {
    id: 'lib-wbp2486-derivable',
    name: 'WBP2486 派生库 · 辅助操作模板',
    derivedNote:
      '本库只是「动作 schema」(DERIVABLE)——引擎在批次层按各主链操作的 demands(目标态)用 effects 索引反向 effect-matching,自动 pull 派生 CIP/SIP/配液/房间放行/装袋,并递归补前置。这里不手编、不落时间、不落实例。',
    operations,
    packages,
  };
}
