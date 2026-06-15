/**
 * 排产资源主数据 mock(贴真实 WBP2486 设施)—— 排产资源主数据界面用。
 *
 * 真实资源源自 docs/production_scheduling/00_design_brief.md §4.3(已导入 DB resources/resource_nodes):
 *   USP: Room-1510、反应器 ABEC1 / BR-101、种子反应器 20L–2000L
 *   DSP: 储罐 T1810(3000L)/T1812(15000L)/T1813–T1815、AKTA skid 1850/1851 + 柱、UFDF skid 1853、转料单元 U1850–U1853、配液罐 BH17xx(POU A/B)
 * CIP 拓扑(设备/罐→管线→{主站,备站})与效期常数源自 20_wbp2486_walkthrough.md / 10_spec §3.3、§5 / D20。
 *
 * 注:这是 v1 第一刀的展示 mock,非权威 DB 导出。CIP 站/管线/主备站映射为合理示意(M1 主站 CIP-S1、M3 主站 CIP-S2)。
 */
import type { PsResourceMaster } from '../types/psResource';

export function buildPsResourceMaster(): PsResourceMaster {
  return {
    facility: 'WBP2486 原液车间(USP+DSP)',

    // ── CIP 站(独立、跨部门、容量 1)──
    cipStations: [
      { id: 'cip-s1', code: 'CIP-S1', name: 'CIP 清洗站 1', department: '上游/下游共用', capacity: 1, note: '管线 M1 主站;容量 1,同刻只洗一条管线' },
      { id: 'cip-s2', code: 'CIP-S2', name: 'CIP 清洗站 2', department: '下游', capacity: 1, note: '管线 M3 主站' },
      { id: 'cip-s3', code: 'CIP-S3', name: 'CIP 清洗站 3(应急)', department: '跨部门', capacity: 1, emergencyOnly: true, note: '仅作备站:引擎默认不排,主站满时人工启用' },
    ],

    // ── 管线(挂主备站)──
    pipelines: [
      { id: 'm1', code: 'M1', name: '管线 M1(USP 主链)', primaryStationId: 'cip-s1', backupStationId: 'cip-s3' },
      { id: 'm2', code: 'M2', name: '管线 M2(配液/buffer)', primaryStationId: 'cip-s1', backupStationId: 'cip-s3' },
      { id: 'm3', code: 'M3', name: '管线 M3(DSP 层析)', primaryStationId: 'cip-s2', backupStationId: 'cip-s3' },
    ],

    // ── 挂在管线上的设备 / 罐(CIP 拓扑叶子)──
    cipEquipment: [
      { id: 'eq-abec1', code: 'ABEC1', name: '4000L ABEC 反应器(单次性 SUS)', type: 'reactor', pipelineId: 'm1', note: '主培养驻留;CIP 走 M1→主站 CIP-S1' },
      { id: 'eq-pt1810', code: 'PT1810', name: '配液 / 转料罐 PT1810', type: 'tank', pipelineId: 'm2' },
      { id: 'eq-t1813', code: 'T1813', name: '储罐 T1813', type: 'tank', pipelineId: 'm2' },
      { id: 'eq-t1814', code: 'T1814', name: '储罐 T1814', type: 'tank', pipelineId: 'm2' },
      { id: 'eq-t1815', code: 'T1815', name: '储罐 T1815', type: 'tank', pipelineId: 'm2' },
      { id: 'eq-akta1850', code: 'AKTA-1850', name: 'AKTA 层析 skid 1850(AC/CEX)', type: 'akta-skid', pipelineId: 'm3', note: '与 1851 共用 M3→主站 CIP-S2:层析换步抢同一站时间轴' },
      { id: 'eq-akta1851', code: 'AKTA-1851', name: 'AKTA 层析 skid 1851(AEX/HA)', type: 'akta-skid', pipelineId: 'm3' },
      { id: 'eq-ufdf1853', code: 'UFDF-1853', name: 'UFDF skid 1853(30m²)', type: 'ufdf-skid', pipelineId: 'm3' },
    ],

    // ── 配液罐(配制期短占 + 转储释放)──
    prepTanks: [
      { id: 'pt-bh1701', code: 'BH1701', name: '配液罐 BH1701', volume: '2000L', pou: 'POU A', occupancyNote: '只占「配制 + CIP」那几小时,转储到储存容器后释放' },
      { id: 'pt-bh1702', code: 'BH1702', name: '配液罐 BH1702', volume: '2000L', pou: 'POU A', occupancyNote: '同上;数量充足 → 通常非瓶颈' },
      { id: 'pt-bh1703', code: 'BH1703', name: '配液罐 BH1703', volume: '1000L', pou: 'POU B', occupancyNote: '小批 buffer / 试剂配制' },
      { id: 'pt-pt1810', code: 'PT1810', name: '配液 / 转料罐 PT1810', volume: '3000L', pou: 'POU B', occupancyNote: '兼转料;配制期短占,转储释放' },
    ],

    // ── 储存容器(储袋/储罐,溶液在效期内占的就是它)──
    storageVessels: [
      { id: 'sv-t1810', code: 'T1810', name: '储罐 T1810', kind: 'tank', volume: '3000L', holds: 'buffer / 中间池储存态' },
      { id: 'sv-t1812', code: 'T1812', name: '储罐 T1812', kind: 'tank', volume: '15000L', holds: '大体积 buffer / 终配料液' },
      { id: 'sv-sb2000', code: 'SB-2000', name: '储袋 SB-2000(2000L)', kind: 'bag', volume: '2000L', holds: '配好的培养基(效期内占)', note: '一次性储袋,效期窗内占用' },
      { id: 'sv-sb1000', code: 'SB-1000', name: '储袋 SB-1000(1000L)', kind: 'bag', volume: '1000L', holds: 'AC/CEX buffer 储存态' },
    ],

    // ── suite(房间分组)──
    suites: [
      { id: 'suite-usp', name: 'USP 套间', role: 'pre-viral', note: '主培养 + 收获,病毒前' },
      { id: 'suite-dsp-pre', name: 'DSP 病毒前套间', role: 'pre-viral', note: 'AC / VIN / CEX / AEX' },
      { id: 'suite-dsp-post', name: 'DSP 病毒后套间', role: 'post-viral', note: 'VF 后:双层包装 + 终配灌装;与 pre-viral 同 suite 互斥' },
    ],

    // ── 房间(放行状态机 + suite 归属)──
    rooms: [
      { id: 'room-1510', code: 'Room-1510', name: 'USP 主培养间', suiteId: 'suite-usp', suiteRole: 'pre-viral', releaseState: 'released', chtHours: 72, note: '已放行;CHT 72h' },
      { id: 'room-1520', code: 'Room-1520', name: 'DSP 捕获/纯化间', suiteId: 'suite-dsp-pre', suiteRole: 'pre-viral', releaseState: 'released', chtHours: 48 },
      { id: 'room-1530', code: 'Room-1530', name: 'DSP 病毒后处理间', suiteId: 'suite-dsp-post', suiteRole: 'post-viral', releaseState: 'unreleased', chtHours: 24, note: '需「房间放行」操作产出 released 态后方可用;post-viral 与 pre-viral 同 suite 互斥' },
      { id: 'room-1540', code: 'Room-1540', name: '灌装间', suiteId: 'suite-dsp-post', suiteRole: 'post-viral', releaseState: 'unreleased', chtHours: 24 },
    ],

    // ── 物料效期常数(配方常数 → 批次层 max-lag)──
    shelfLives: [
      { id: 'sl-media', material: '培养基(Media WBP2486)', category: 'media', shelfLifeHours: 24, basis: '配制后起算', note: '灌注须落在 [Day0−24h, Day0] 窗内' },
      { id: 'sl-ac-buffer', material: 'AC buffer', category: 'buffer', shelfLifeHours: 48, basis: '配制后起算' },
      { id: 'sl-cex-buffer', material: 'CEX buffer', category: 'buffer', shelfLifeHours: 72, basis: '配制后起算' },
      { id: 'sl-aex-buffer', material: 'AEX buffer', category: 'buffer', shelfLifeHours: 72, basis: '配制后起算' },
      { id: 'sl-ha-buffer', material: 'HA buffer', category: 'buffer', shelfLifeHours: 48, basis: '配制后起算' },
      { id: 'sl-vin-acid', material: 'VIN 酸液', category: 'reagent', shelfLifeHours: 24, basis: '配制后起算' },
      { id: 'sl-base', material: '碱液(清洗剂 NaOH)', category: 'cleaning-agent', shelfLifeHours: 168, basis: '配制后起算', note: '7d;长效 → 适合攒批(一次配制分装服务多批)' },
      { id: 'sl-harvest', material: '收获液', category: 'intermediate', shelfLifeHours: 4, basis: '产出后起算', note: '短 hold,收获后 ≤4h 接力到 AC' },
      { id: 'sl-postviral', material: '病毒后产物', category: 'intermediate', shelfLifeHours: 4, basis: '产出后起算', note: 'VF 后 ≤4h 进双层包装' },
    ],
  };
}
