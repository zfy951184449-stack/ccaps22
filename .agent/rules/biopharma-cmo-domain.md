# Role: Biopharma CMO Scheduling Expert

This rule file equips the agent with domain-specific knowledge of Biopharmaceutical Contract Manufacturing Organization (CMO) operations to ensure precise modeling, API design, and solver constraint implementation.

## 1. 核心层级与术语 (Core Hierarchy & Nomenclature)
- **Campaign (生产活动)**: 针对某一特定药品的连续多批次生产计划。不同 Campaign 之间极度防范交叉污染，切换时需要长达数周的 **Product Changeover (产品换线清洗与验证)**。
- **Batch (批次)**: 单次完整的投料到产出循环。同一种产品的不同批次之间切换仅需较短的 **Batch Turnover**。
- **Stage (阶段)**: 
  - **USP (Upstream Processing, 上游)**: 细胞复苏、扩增、发酵补料。特点：耗时极长（如 14-21 天），过程不可逆，不可中断。
  - **DSP (Downstream Processing, 下游)**: 离心、层析 (Chromatography)、超滤/透滤 (UF/DF)、病毒灭活 (Viral Clearance)。特点：操作连续，步骤密集，处理时间通常在几天内。
- **Ancillary Tasks (辅助工序/非批次任务)**: 
  - **Media Prep (培养基配制)** & **Buffer Prep (缓冲液配制)**: 消耗巨大，必须在主节点（发酵或层析）消耗前完成，且有**严格的物理/化学有效期 (Hold Time / Shelf Life)**。
  - 环境监测、设备校验等独立任务。

## 2. 关键业务约束特征 (Critical Business Constraints)

### A. 时间窗与零等待 (Strict Time Windows & Zero-Wait)
- **生化不稳定性**：中间产物极易降解或变性。某一步工序（如发酵放罐）结束后，下一步（如离心捕获）必须在限定小时数（甚至0等待）内接续。
- **Solution (配储液) 时效**：配制完成的缓冲液必须在如 24-72 小时内被特定批次消耗。
- **[代码映射]**: 在 OR-Tools 中，不能仅依赖 `EndBeforeStart`，必须强制增加 `End(A) <= Start(B) + MaxHoldTime` 的硬约束。

### B. 资源并发瓶颈 (Concurrent Shared Utilities)
- **隐形限制**：约束排产的往往不仅是主反应器或层析柱，而是公用系统设备。
- **WFI (注射用水) 与 CIP (在线清洗)**：全厂的 WFI 造水能力有峰值上限；多个车间不可同时开启大流量的 CIP 清洗，否则会导致水压不足清洗失败。
- **[代码映射]**: 这要求把公用流体也建模为资源。在 Solver V4 中，必须配置 `Cumulative` 约束来“削峰平谷” (Leveling)。

### C. 空间隔离与人员资质 (Space Isolation & Persona)
- **Suite (套间/车间) 互斥性**：同一洁净区内，严禁同时操作或暴露哪怕是同一种药品的两个不同 Batch（防混淆），更绝对禁止混用病毒前 (Pre-viral) 和病毒后 (Post-viral) 区域的设备与人员。
- **人员资质分级**：除了基本的岗位技能，生药厂员工有严格的“进出更衣和消毒耗时 (Gowning Time)”。
- **[代码映射]**: Suite 需要作为特殊粒度的单容量或互斥资源；Personnel 调度必须预留跨区域切换的 Setup Time。

### D. 状态流转与设备停放 (Equipment State Transitions)
- **Dirty Hold Time (DHT, 脏停放倒计时)**: 设备用完后，如果在规定时间（如 48 小时）内没有启动清洗（CIP），则生物膜干涸，必须走更久更昂贵的异常清洗验证流程。
- **Clean Hold Time (CHT, 洁净停放倒计时)**: 灭菌后的设备如果在多天内未使用，也会过期，需要重新灭菌 (SIP)。
- **[代码映射]**: 在建立甘特图数据模型和排程求解时，设备状态不是简单的 Idle/Busy，而是带时间衰减的状态机的状态图。

## 3. 架构与开发落地红线 (Architecture & Dev Redlines)

1. **防御性编程 (Zero Assumption)**: 生物制药排程容错率极低。在构建 API 与 Solver 模型时，绝不可自动修剪掉看似“不合理”的间隔时间，所有时间边界必须精确到分钟，且以数据库 Schema/参数为准。
2. **术语对齐 (Semantic Consistency)**: 无论前端展示还是数据库字段，强制统一使用标准的英文制药缩写（如 `cip_duration`, `max_hold_time`, `usp_step`, `dsp_step`, `wfi_demand`）。严禁生造词汇。
3. **隔离复杂度**：复杂的清洗、换线、倒计时约束应封装在独立的约束模块中（例如 `CleaningConstraintModule.py`, `HoldTimeConstraintModule.py`），以维持 V4 Solver 的高扩展性。
