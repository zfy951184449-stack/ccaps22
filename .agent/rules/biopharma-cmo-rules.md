# Role: Biopharma CMO Scheduling Domain Expert

This rule file provides deep, comprehensive domain knowledge for Contract Manufacturing Organization (CMO) Biopharmaceutical scheduling. It governs how the AI understands business requirements, designs database schemas, and constructs OR-Tools constraints.

## 1. 生产层级与生命周期 (Production Hierarchy & Lifecycle)
*   **Campaign (生产活动)**: 针对特定分子的连续多批次生产。
    *   *约束*: Campaign 之间需要进行 **Product Changeover (产品换线)**，耗时极长（数周），涉及全线 VHP (空间灭菌)、设备残留检测 (Swab Testing)。
    *   *约束*: Campaign 首批通常带有额外的验证时间 (Water Run / Media Fill)。
*   **Batch (批次)**: 单次完整的端到端生产循环。
    *   *约束*: 同 Campaign 下不同 Batch 之间仅需 **Batch Turnover**。
    *   *关联*: 批次有严格的谱系追踪 (Genealogy)，上下级物料（如发酵液分配到多个纯化柱）必须精确溯源。
*   **Stage/Phase (操作阶段 - USP/DSP)**:
    *   **USP (上游 - 细胞培养)**: 涵盖 Seed Train (摇瓶/波浪袋) -> N-X 扩增 -> Production Bioreactor。特征：耗时极长（14-25天）、连续不间断、极度依赖无菌环境。
    *   **DSP (下游 - 纯化分离)**: 涵盖 Centrifuge (离心) -> Chromatography (层析/多步) -> UF/DF (超滤/透滤) -> Viral Clearance (病毒灭活/过滤) -> Bulk Fill (原液灌装)。特征：步骤密集、短时间内对人力和缓冲液消耗极大。
*   **Ancillary (辅助支撑工序)**:
    *   **Media/Buffer Prep (配液)**: 消耗巨大，必须在主工序前完成，受限于配储液罐数量和称量间产能。

## 2. 核心时间窗与流转约束 (Temporal & Flow Constraints)
生物制药排程的灵魂在于对**时间敏感性 (Time-Sensitivity)** 的极度苛求。

*   **Zero-Wait & Strict Hold Times (零等待与严格有效期)**:
    *   中间产物极易降解。例如：发酵必须在达到细胞密度阈值后 X 小时内放罐；离心后的上清液必须在 Y 小时内上样到层析柱。
    *   **配液时效 (Solution Shelf-Life)**: 配制好的缓冲液必须在如 24-72 小时内被消耗，否则报废。
*   **设备状态倒计时 (Equipment State Timers)**:
    *   **DHT (Dirty Hold Time, 脏停放时间)**: 设备使用后，如果在规定时间（如 48h）内未启动 CIP，生物膜干涸，须走昂贵的异常清洗与验证流程。排产必须保证设备用完后有足够时间清洗。
    *   **CHT (Clean Hold Time, 洁净有效期)**: SIP (灭菌) 后的设备，若数天内未投用，无菌状态失效，必须重新灭菌。

## 3. 资源、空间与冲突瓶颈 (Resource & Spatial Bottlenecks)

*   **公用系统削峰 (Utilities Capacity Leveling)**:
    *   **WFI (注射用水) & PW (纯化水)**: 全厂的造水量、储水罐容量和环路出水速率是固定的。多台设备同时进行大规模 CIP/配液会抽干环路，导致洗罐失败或降级。必须将 WFI 消耗建模为 `Cumulative` 约束。
    *   **CIP/SIP Skids (工作站)**: 移动清洗站或固定清洗站的并发数有限。
*   **空间隔离防交叉 (Spatial Segregation - Prevention of Cross-Contamination)**:
    *   **Suite Mutex (套间互斥)**: 同一洁净区 (Suite) 内，严禁暴露同分子的不同 Batch（防混淆），更绝对禁止混用 Pre-viral (病毒处理前) 和 Post-viral (病毒处理后) 区域。
    *   HVAC (空调净化系统) 的压差和气流要求可能限制相邻房间的并发操作。
*   **人员与更衣 (Personnel & Gowning)**:
    *   不仅需要匹配技能树 (Qualification: 懂发酵 vs 懂层析)。
    *   人员进入高级别洁净区（如 Grade B/C）必须计算 **Gowning Time (更衣与消毒耗时)**（可达 30-45 分钟）。跨区操作需要脱衣+重新更衣。
    *   **交接班连续性 (Shift Handover)**: 对于 USP 等不可中断阶段，换班时必须安排重叠时间现场交接。

## 4. 质量控制与物料约束 (QC Release & Material Constraints)

*   **IPC & Release (过程控制与原辅料放行)**:
    *   不可简单假设“做完上一步就能做下一步”。许多关键步骤前必须等待 QC (质检) 出具结果 (Release)。
    *   例如：无菌检测 (Sterility Test) 通常需要 14 天的盲期。在此期间，下游工序只能处于 "Hold" 风险生产或等待状态。
*   **SUS vs SS (一次性技术 vs 不锈钢)**:
    *   必须区分设备类型。**SS (不锈钢)** 强依赖 CIP/SIP 资源并附带 DHT/CHT；**SUS (一次性储液袋/反应器)** 不需要清洗，但需要极长的 Setup_Time 用于管路焊接 (tube welding)、完整性测试 (PUIT)。

## 5. 建模与架构红线 (Modeling & Architecture Redlines)

1.  **防御性时间建模**: 绝不允许在代码中自动或悄悄“修剪”违反生化规律的间隔时间（如为了消除重叠，随意将一个任务推迟 5 小时）。如果时间窗 (`End(A) + Hold <= Start(B)`) 冲突，必须在模型层面抛出 `Infeasible` 或惩罚项。
2.  **细粒度状态机**: 在 UI 渲染和数据库设计时，设备不仅有 Idle/Running，必须包含 `Cleaning (CIP)`, `Sterilizing (SIP)`, `Dirty_Hold`, `Clean_Hold`, `Changeover` 等状态。
3.  **约束解耦**: 所有复杂的生药规则（如 WFI 削峰、DHT/CHT 倒计时、Suite 互斥）必须在 V4 Solver 中封装为独立的 `ConstraintModule`（利用策略模式），禁止在主求解循环中写死 `if-else`。
4. 术语强制: API 字段、响应结构、变量命名强制统一使用生物制药规约：`usp_duration`, `cip_time`, `max_dht`, `gowning_time`, `wfi_peak_rate`。严禁使用通用制造词汇混淆。

## 6. 排班与劳动力调度模型 (Workforce & Shift Scheduling)

生物制药的排班 (Scheduling/Rostering) 远不同于标准“早中晚”三班倒，它必须精确刻画出“人、机、法、环”的高度耦合。

*   **技能矩阵与多能工 (Skill Matrix & Cross-Training)**:
    *   **严格资质准入 (Qualification)**：不仅是“懂操作发酵罐”，还要细分至“具备 B 级洁净区准入资质”和“通过特定标准操作规程 (SOP) 培训”。
    *   **排程映射**: Solver 在分配操作员 (Assign Personnel) 时，不仅要检查空闲时间 (`IntervalVar`)，还必须跨表校验操作员的最新资质是否过期。不支持“凑合找个人顶替”。
*   **物理耗时与断点 (Physical Delays & Breaks)**:
    *   **更衣与进入耗时 (Gowning & De-gowning)**: 如前文所述，员工在不同洁净区穿梭不是物理瞬移。排程必须为每次跨控制区操作插入 15-45 分钟不等的**隔离准备时间 (Setup Time)**。
    *   **强制生理休息与进食 (Mandatory Breaks)**: 高级别洁净服内工作极耗体力，且无法饮水进食。系统必须强制性切分极长工序（如连续 8 小时的装柱或配液），必须安排重叠的人员替岗 (Relief) 或强制切分休息时间窗口。
*   **关键接力与交接班 (Critical Handover & Shift Overlap)**:
    *   **长周期工艺的无缝接力 (Continuous Process Handover)**: 上游细胞培养和部分连续流纯化是 7x24 小时不间断的。换班时，操作员绝不能出现“脱岗盲区”。
    *   **排程映射**: 班次设计必须包含 **重叠交接时间 (Overlap/Handover Time)**（例如 30 分钟），在重叠期内，上一班和下一班的负责人都必须在场（都在场，且都扣除工时）。
*   **轮班模式与合规 (Rostering Patterns & Labor Laws)**:
    *   CMO 工厂常采用压缩工作周（如“做四休四”、“四班二运转”）。
    *   **疲劳与合规约束**: `max_consecutive_days_worked` (最长连续工作天数), `min_rest_between_shifts` (两班之间的最少休息小时数), `max_night_shifts` (最大连续夜班数)。在 V4 Solver 中，这往往需要独立的 Employee Scheduling Module 来前置过滤可行人员名单。
