/**
 * 工艺流模板列表 mock(模板层 · 无时间无实例)—— 工艺模板列表(新)界面用。
 *
 * 权威设计:docs/production_scheduling/50_end_to_end_flow.md(① 模板层 = 规划域)、
 *           10_process_flow_model_spec.md(模型层 D1–D24)。
 *
 * 不变量:
 *  - 模板层只含「主工艺链」,无时间、无实例(D4)。列表只做「目录 + 版本 + 状态」视图,不连后端。
 *  - 真实条目 WBP2486/B 的明细可由 mock/wbp2486Template.ts 提供;此处只放轻量列表行。
 *  - 列表行 = 轻量投影,不重复定义 PfTemplate(明细模型在 types/processFlowTemplate.ts)。
 */

/** 模板状态(草稿 → 启用 → 归档) */
export type TemplateListStatus = 'draft' | 'active' | 'archived';

/** 列表行:轻量投影,仅供目录/版本视图。明细仍以 PfTemplate 为准。 */
export interface TemplateListRow {
  /** 行键(= 模板实例 id) */
  id: string;
  /** 模板编码(含版本号,如 WBP2486/B) */
  code: string;
  /** 模板名称 */
  name: string;
  /** 产品代号(WBP2486 / WBP3100 …) */
  product: string;
  /** 阶段数(主链 stage 数) */
  stageCount: number;
  /** 主链操作数(钉子 + 弹簧合计,辅助不计) */
  opCount: number;
  /** 版本号(语义版本,如 B / v2.1) */
  version: string;
  /** 状态 */
  status: TemplateListStatus;
  /** 更新日期(YYYY-MM-DD) */
  updatedAt: string;
  /** 维护人 */
  owner: string;
  /** 一句话用途/备注 */
  note?: string;
  /** 是否当前启用版本(同编码多版本中唯一) */
  isCurrent?: boolean;
}

export const TEMPLATE_STATUS_LABEL: Record<TemplateListStatus, string> = {
  draft: '草稿',
  active: '启用',
  archived: '归档',
};

/** 状态 → WxbTag 颜色(只用语义色名,真实色值走 CSS 变量) */
export const TEMPLATE_STATUS_TAG_COLOR: Record<TemplateListStatus, 'green' | 'blue' | 'neutral'> = {
  draft: 'blue',
  active: 'green',
  archived: 'neutral',
};

/**
 * 列表 mock:
 *  - WBP2486/B 单抗主工艺流(真实,对应 mock/wbp2486Template.ts,14 阶段 / 22 主链操作)。
 *  - WBP2486/A 为其上一版本(已归档),演示同编码多版本。
 *  - WBP2486-DSP/A 独立 DSP 精纯子工艺流(草稿,演示 DSP 拆分)。
 *  - WBP3100/v1.0 另一产品(双抗)主工艺流,演示跨产品。
 */
export function buildTemplateListMock(): TemplateListRow[] {
  return [
    {
      id: 'tpl-wbp2486-b',
      code: 'WBP2486/B',
      name: 'WBP2486 单抗 · 主工艺流(USP→DSP)',
      product: 'WBP2486',
      stageCount: 14,
      opCount: 22,
      version: 'B',
      status: 'active',
      updatedAt: '2026-06-12',
      owner: '王工',
      note: '4000L ABEC 主培养 → AC/VIN/CEX/AEX/HA/UFDF/VF → 终配灌装,含每日取样/补料钩子',
      isCurrent: true,
    },
    {
      id: 'tpl-wbp2486-a',
      code: 'WBP2486/A',
      name: 'WBP2486 单抗 · 主工艺流(USP→DSP)',
      product: 'WBP2486',
      stageCount: 14,
      opCount: 21,
      version: 'A',
      status: 'archived',
      updatedAt: '2025-11-03',
      owner: '王工',
      note: 'B 版上一稿:AEX 仅单循环、无 UFDF3 终配;留档对照',
    },
    {
      id: 'tpl-wbp2486-dsp-a',
      code: 'WBP2486-DSP/A',
      name: 'WBP2486 单抗 · DSP 精纯子工艺流',
      product: 'WBP2486',
      stageCount: 8,
      opCount: 11,
      version: 'A',
      status: 'draft',
      updatedAt: '2026-06-10',
      owner: '李工',
      note: '从主工艺流拆出的 DSP 段,用于捕获后中间产物外采联动场景的独立排产',
      isCurrent: true,
    },
    {
      id: 'tpl-wbp3100-v1',
      code: 'WBP3100/v1.0',
      name: 'WBP3100 双抗 · 主工艺流(USP→DSP)',
      product: 'WBP3100',
      stageCount: 16,
      opCount: 26,
      version: 'v1.0',
      status: 'active',
      updatedAt: '2026-05-28',
      owner: '赵工',
      note: '双抗:双链分别表达后混合,USP 含两条种子串、DSP 多一道 Mixed-Mode 精纯',
      isCurrent: true,
    },
    {
      id: 'tpl-wbp3100-v1.1',
      code: 'WBP3100/v1.1',
      name: 'WBP3100 双抗 · 主工艺流(USP→DSP)',
      product: 'WBP3100',
      stageCount: 16,
      opCount: 26,
      version: 'v1.1',
      status: 'draft',
      updatedAt: '2026-06-14',
      owner: '赵工',
      note: 'v1.0 版本化草稿:VF 改双级、灌装线切换无菌隔离器,待工艺确认后启用',
    },
  ];
}
