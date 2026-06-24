/**
 * 工厂数字沙盘 mock(贴 WBP2486 设施)。自成一套独立数据,非真实 DB 导出。
 * 3 产线 / 14 房间(含 4 个多产线共用)/ 53 台设备覆盖全 12 类 / 3 CIP 站 + 路由关系。
 */
import { PS_LINE_COLOR_TOKENS } from '../types/psSandtable';
import type {
  PsEquipment,
  PsEquipmentRelation,
  PsFactoryModel,
  PsProductionLine,
  PsRoom,
  PsRoomFunction,
  PsRoomLineLink,
  PsStirDirection,
} from '../types/psSandtable';

let seq = 0;
const uid = (p: string) => `${p}-${(seq += 1)}`;

interface EqSeed {
  code: string;
  name: string;
  type: PsEquipment['equipmentType'];
  roomId: string;
  stir?: PsStirDirection;
  volumeL?: number;
  sizeClass?: PsEquipment['sizeClass'];
  brand?: string;
}

export function buildPsFactoryModel(): PsFactoryModel {
  seq = 0;
  const siteId = 'site-wbp2486';

  const lines: PsProductionLine[] = [
    { id: 'line-a', siteId, code: 'PL-A', name: '单抗原液 A 线', colorToken: PS_LINE_COLOR_TOKENS[0], orderIndex: 0 },
    { id: 'line-b', siteId, code: 'PL-B', name: '单抗原液 B 线', colorToken: PS_LINE_COLOR_TOKENS[1], orderIndex: 1 },
    { id: 'line-c', siteId, code: 'PL-C', name: '共线 / 中试 C 线', colorToken: PS_LINE_COLOR_TOKENS[2], orderIndex: 2 },
  ];

  // 房间(function 决定粗分区:usp/harvest=USP,chromatography/ufdf=DSP,其余=公用)
  const R = (id: string, code: string, name: string, fn: PsRoomFunction): PsRoom => ({ id, siteId, code, name, function: fn });
  const rooms: PsRoom[] = [
    R('r-1501', 'R-1501', '种子制备间 A', 'usp'),
    R('r-1502', 'R-1502', '种子制备间 B', 'usp'),
    R('r-1510', 'R-1510', '主培养间 A', 'usp'),
    R('r-1511', 'R-1511', '主培养间 B', 'usp'),
    R('r-1520', 'R-1520', '收获间(共用)', 'harvest'),
    R('r-1530', 'R-1530', '捕获间 A', 'chromatography'),
    R('r-1531', 'R-1531', '捕获间 B', 'chromatography'),
    R('r-1540', 'R-1540', '精纯间 A', 'chromatography'),
    R('r-1541', 'R-1541', '精纯间 B', 'chromatography'),
    R('r-1550', 'R-1550', '超滤 / 灭活间(共用)', 'ufdf'),
    R('r-1560', 'R-1560', '配液间(共用)', 'media'),
    R('r-1561', 'R-1561', '缓冲液间(共用)', 'buffer'),
    R('r-1570', 'R-1570', '称量 / 洁净间', 'utility'),
    R('r-1590', 'R-1590', 'CIP 间', 'utility'),
  ];

  // 房间↔产线(共用房间挂多条线)
  const link = (roomId: string, lineId: string, isPrimary = false): PsRoomLineLink => ({ id: uid('rl'), roomId, lineId, isPrimary });
  const roomLines: PsRoomLineLink[] = [
    link('r-1501', 'line-a', true),
    link('r-1502', 'line-b', true),
    link('r-1510', 'line-a', true),
    link('r-1511', 'line-b', true),
    link('r-1520', 'line-a', true), link('r-1520', 'line-b'), // 共用
    link('r-1530', 'line-a', true),
    link('r-1531', 'line-b', true),
    link('r-1540', 'line-a', true),
    link('r-1541', 'line-b', true),
    link('r-1550', 'line-a', true), link('r-1550', 'line-b'), // 共用
    link('r-1560', 'line-a', true), link('r-1560', 'line-b'), link('r-1560', 'line-c'), // 三线共用
    link('r-1561', 'line-a', true), link('r-1561', 'line-b'), // 共用
    link('r-1570', 'line-c', true),
    link('r-1590', 'line-c', true),
  ];

  const seeds: EqSeed[] = [
    // R-1501 种子 A
    { code: 'SH-01', name: '摇床 1', type: 'shaker', roomId: 'r-1501' },
    { code: 'WV-01', name: 'Wave 1', type: 'wave', roomId: 'r-1501' },
    { code: 'SR-050A', name: '种子反应器 50L', type: 'reactor', roomId: 'r-1501', stir: 'top', volumeL: 50 },
    { code: 'SR-250A', name: '种子反应器 250L', type: 'reactor', roomId: 'r-1501', stir: 'top', volumeL: 250 },
    // R-1502 种子 B
    { code: 'SH-02', name: '摇床 2', type: 'shaker', roomId: 'r-1502' },
    { code: 'WV-02', name: 'Wave 2', type: 'wave', roomId: 'r-1502' },
    { code: 'SR-050B', name: '种子反应器 50L', type: 'reactor', roomId: 'r-1502', stir: 'top', volumeL: 50 },
    { code: 'SR-250B', name: '种子反应器 250L', type: 'reactor', roomId: 'r-1502', stir: 'top', volumeL: 250 },
    // R-1510 主培养 A
    { code: 'BR-1000A', name: '生物反应器 1000L', type: 'reactor', roomId: 'r-1510', stir: 'top', volumeL: 1000 },
    { code: 'BR-2000A', name: '生物反应器 2000L', type: 'reactor', roomId: 'r-1510', stir: 'top', volumeL: 2000 },
    { code: 'BR-4000A', name: 'ABEC 主反应器 4000L', type: 'reactor', roomId: 'r-1510', stir: 'bottom', volumeL: 4000, brand: 'ABEC' },
    // R-1511 主培养 B
    { code: 'BR-1000B', name: '生物反应器 1000L', type: 'reactor', roomId: 'r-1511', stir: 'top', volumeL: 1000 },
    { code: 'BR-2000B', name: '生物反应器 2000L', type: 'reactor', roomId: 'r-1511', stir: 'top', volumeL: 2000 },
    { code: 'BR-4000B', name: 'ABEC 主反应器 4000L', type: 'reactor', roomId: 'r-1511', stir: 'bottom', volumeL: 4000, brand: 'ABEC' },
    // R-1520 收获(共用)
    { code: 'CF-01', name: '连续流离心机 1', type: 'centrifuge', roomId: 'r-1520' },
    { code: 'CF-02', name: '连续流离心机 2', type: 'centrifuge', roomId: 'r-1520' },
    // R-1530 捕获 A
    { code: 'AKTA-01', name: '层析 skid 1', type: 'chromatography-skid', roomId: 'r-1530' },
    { code: 'AKTA-02', name: '层析 skid 2', type: 'chromatography-skid', roomId: 'r-1530' },
    { code: 'T-1810', name: '储罐 1810', type: 'storage-tank', roomId: 'r-1530' },
    { code: 'T-1811', name: '储罐 1811', type: 'storage-tank', roomId: 'r-1530' },
    // R-1531 捕获 B
    { code: 'AKTA-03', name: '层析 skid 3', type: 'chromatography-skid', roomId: 'r-1531' },
    { code: 'AKTA-04', name: '层析 skid 4', type: 'chromatography-skid', roomId: 'r-1531' },
    { code: 'T-1812', name: '储罐 1812', type: 'storage-tank', roomId: 'r-1531' },
    { code: 'T-1813', name: '储罐 1813', type: 'storage-tank', roomId: 'r-1531' },
    // R-1540 精纯 A
    { code: 'AKTA-05', name: '层析 skid 5', type: 'chromatography-skid', roomId: 'r-1540' },
    { code: 'AKTA-06', name: '层析 skid 6', type: 'chromatography-skid', roomId: 'r-1540' },
    { code: 'UF-01', name: '超滤 skid 1', type: 'ufdf-skid', roomId: 'r-1540' },
    { code: 'T-1814', name: '储罐 1814', type: 'storage-tank', roomId: 'r-1540' },
    // R-1541 精纯 B
    { code: 'AKTA-07', name: '层析 skid 7', type: 'chromatography-skid', roomId: 'r-1541' },
    { code: 'AKTA-08', name: '层析 skid 8', type: 'chromatography-skid', roomId: 'r-1541' },
    { code: 'UF-02', name: '超滤 skid 2', type: 'ufdf-skid', roomId: 'r-1541' },
    { code: 'T-1815', name: '储罐 1815', type: 'storage-tank', roomId: 'r-1541' },
    // R-1550 超滤/灭活(共用)
    { code: 'UF-03', name: '超滤 skid 3', type: 'ufdf-skid', roomId: 'r-1550' },
    { code: 'UF-04', name: '超滤 skid 4', type: 'ufdf-skid', roomId: 'r-1550' },
    { code: 'SB-01', name: '储袋 1(2000L)', type: 'storage-bag', roomId: 'r-1550' },
    { code: 'SB-02', name: '储袋 2(2000L)', type: 'storage-bag', roomId: 'r-1550' },
    // R-1560 配液(三线共用)
    { code: 'BH-01', name: '配液罐 1701', type: 'prep-tank', roomId: 'r-1560' },
    { code: 'BH-02', name: '配液罐 1702', type: 'prep-tank', roomId: 'r-1560' },
    { code: 'BH-03', name: '配液罐 1703', type: 'prep-tank', roomId: 'r-1560' },
    { code: 'BH-04', name: '配液罐 1704', type: 'prep-tank', roomId: 'r-1560' },
    { code: 'SB-03', name: '储袋 3(1000L)', type: 'storage-bag', roomId: 'r-1560' },
    { code: 'SB-04', name: '储袋 4(1000L)', type: 'storage-bag', roomId: 'r-1560' },
    // R-1561 缓冲液(共用)
    { code: 'BH-05', name: '配液罐 1705', type: 'prep-tank', roomId: 'r-1561' },
    { code: 'BH-06', name: '配液罐 1706', type: 'prep-tank', roomId: 'r-1561' },
    { code: 'T-1820', name: '储罐 1820', type: 'storage-tank', roomId: 'r-1561' },
    { code: 'T-1821', name: '储罐 1821', type: 'storage-tank', roomId: 'r-1561' },
    { code: 'SB-05', name: '储袋 5(2000L)', type: 'storage-bag', roomId: 'r-1561' },
    // R-1570 称量/洁净
    { code: 'BSC-01', name: '生物安全柜 1', type: 'bsc', roomId: 'r-1570' },
    { code: 'BSC-02', name: '生物安全柜 2', type: 'bsc', roomId: 'r-1570' },
    { code: 'LAF-01', name: '层流罩 1', type: 'laf', roomId: 'r-1570' },
    // R-1590 CIP
    { code: 'CIP-S1', name: 'CIP 站 1', type: 'cip-station', roomId: 'r-1590' },
    { code: 'CIP-S2', name: 'CIP 站 2', type: 'cip-station', roomId: 'r-1590' },
    { code: 'CIP-S3', name: 'CIP 站 3(应急)', type: 'cip-station', roomId: 'r-1590' },
  ];

  const equipment: PsEquipment[] = seeds.map((s, i) => ({
    id: `eq-${s.code}`,
    roomId: s.roomId,
    code: s.code,
    name: s.name,
    equipmentType: s.type,
    stirDirection: s.stir,
    volumeL: s.volumeL,
    sizeClass: s.sizeClass,
    brand: s.brand,
    categoryOrder: i,
  }));

  const pipelines = [
    { id: 'pl-m1', siteId, code: 'M1', name: 'USP 主链', primaryStationId: 'eq-CIP-S1', backupStationId: 'eq-CIP-S3' },
    { id: 'pl-m2', siteId, code: 'M2', name: '配液 / buffer', primaryStationId: 'eq-CIP-S1', backupStationId: 'eq-CIP-S3' },
    { id: 'pl-m3', siteId, code: 'M3', name: 'DSP 层析', primaryStationId: 'eq-CIP-S2', backupStationId: 'eq-CIP-S3' },
  ];

  // CIP 路由关系(设备 → 主站/备站,经管线)
  const cip = (src: string, pipelineId: string, primary: string, backup?: string): PsEquipmentRelation[] => {
    const out: PsEquipmentRelation[] = [
      { id: uid('rel'), relationType: 'cip-route', sourceEquipmentId: src, targetEquipmentId: primary, role: 'primary', pipelineId },
    ];
    if (backup) out.push({ id: uid('rel'), relationType: 'cip-route', sourceEquipmentId: src, targetEquipmentId: backup, role: 'backup', pipelineId });
    return out;
  };
  const relations: PsEquipmentRelation[] = [
    ...cip('eq-BR-4000A', 'pl-m1', 'eq-CIP-S1', 'eq-CIP-S3'),
    ...cip('eq-BR-4000B', 'pl-m1', 'eq-CIP-S1', 'eq-CIP-S3'),
    ...cip('eq-AKTA-01', 'pl-m3', 'eq-CIP-S2', 'eq-CIP-S3'),
    ...cip('eq-AKTA-03', 'pl-m3', 'eq-CIP-S2', 'eq-CIP-S3'),
    ...cip('eq-BH-01', 'pl-m2', 'eq-CIP-S1'),
    ...cip('eq-BH-05', 'pl-m2', 'eq-CIP-S1'),
  ];

  return {
    site: { id: siteId, code: 'WBP2486', name: 'WBP2486 原液车间' },
    lines,
    rooms,
    equipment,
    pipelines,
    relations,
    roomLines,
  };
}
