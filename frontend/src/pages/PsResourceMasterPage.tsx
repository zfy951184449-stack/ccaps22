/**
 * 排产资源主数据界面(production scheduling resource master · 模板层 · 无时间无实例)。
 *
 * 权威设计:docs/production_scheduling/40_scheduling_layer_spec.md(§5 资源 / C10·C11·C16)、
 *           docs/production_scheduling/10_process_flow_model_spec.md(§3.3 共享清洗/配制资源拓扑 / D20)。
 *
 * 重点 = 现有「资源节点管理」没有的排产专属维度:
 *   ① CIP 站拓扑(容量 1,设备→管线→{主站,备站})② 配液罐(短占+转储释放)
 *   ③ 储存容器(效期内占)④ 房间 & suite(放行状态机 + 互斥)⑤ 物料效期常数。
 * 这些是排产引擎在批次层做资源传播 + 确定性落点时查询的「主数据」,本身无时间、无批次实例。
 *
 * 第一刀:真实 mock + 分区/Tab + 可点选查看;不做后端持久化/CRUD(TODO)。
 */
import React, { useMemo, useState } from 'react';
import {
  WxbDataTable,
  WxbPageHeader,
  WxbPageSection,
  WxbPageShell,
  WxbTabs,
  WxbTag,
} from '../components/wxb-ui';
import { buildPsResourceMaster } from '../mock/psResourceMock';
import { PsCipTopology } from '../components/PsResourceMaster/PsCipTopology';
import { PsOccupancyDiagram } from '../components/PsResourceMaster/PsOccupancyDiagram';
import {
  PS_RESOURCE_TAB_LABEL,
  PS_SHELF_CATEGORY_LABEL,
  PS_SUITE_ROLE_LABEL,
  psShelfCategoryColor,
  psSuiteRoleColor,
} from '../types/psResource';
import type {
  PsPrepTank,
  PsResourceTab,
  PsRoom,
  PsShelfLife,
  PsStorageVessel,
  PsSuite,
} from '../types/psResource';
import './PsResourceMasterPage.css';

const TAB_ORDER: PsResourceTab[] = ['cip', 'prep', 'storage', 'room', 'shelf-life'];

const fmtShelfLife = (h: number) => (h % 24 === 0 ? `${h / 24}d (${h}h)` : `${h}h`);

// 效期紧迫度分级(短=紧,直接对应「效期墙紧不紧」)
const SHELF_MAX_HOURS = 168; // 碱液 7d 为标度上限
const shelfTone = (h: number): 'crit' | 'warn' | 'mid' | 'ok' =>
  h <= 4 ? 'crit' : h <= 24 ? 'warn' : h <= 72 ? 'mid' : 'ok';
// sqrt 标度:让 4h 也看得见,又不让 168h 撑满
const shelfBarPct = (h: number) => Math.max(8, Math.round(Math.sqrt(h / SHELF_MAX_HOURS) * 100));

const PsResourceMasterPage: React.FC = () => {
  const master = useMemo(() => buildPsResourceMaster(), []);
  const [tab, setTab] = useState<PsResourceTab>('cip');

  const counts = {
    cip: master.cipStations.length,
    prep: master.prepTanks.length,
    storage: master.storageVessels.length,
    room: master.rooms.length,
    'shelf-life': master.shelfLives.length,
  };

  // ── 配液罐表 ──
  const prepColumns = [
    { title: '编号', dataIndex: 'code', key: 'code', width: 110, render: (v: string) => <span className="psrm-code">{v}</span> },
    { title: '名称', dataIndex: 'name', key: 'name' },
    { title: '容积', dataIndex: 'volume', key: 'volume', width: 90 },
    { title: 'POU', dataIndex: 'pou', key: 'pou', width: 90, render: (v?: string) => v ? <WxbTag color="cyan">{v}</WxbTag> : '—' },
    { title: '占用语义', dataIndex: 'occupancyNote', key: 'occupancyNote', render: (v: string) => <span className="psrm-muted">{v}</span> },
  ];

  // ── 储存容器表 ──
  const storageColumns = [
    { title: '编号', dataIndex: 'code', key: 'code', width: 110, render: (v: string) => <span className="psrm-code">{v}</span> },
    { title: '名称', dataIndex: 'name', key: 'name' },
    { title: '类型', dataIndex: 'kind', key: 'kind', width: 90, render: (v: PsStorageVessel['kind']) => <WxbTag color={v === 'bag' ? 'blue' : 'neutral'}>{v === 'bag' ? '储袋' : '储罐'}</WxbTag> },
    { title: '容积', dataIndex: 'volume', key: 'volume', width: 90 },
    { title: '典型承载', dataIndex: 'holds', key: 'holds', render: (v: string) => <span className="psrm-muted">{v}</span> },
  ];

  // ── 房间表 ──
  const suiteName = (id: string) => master.suites.find((s) => s.id === id)?.name ?? id;
  const roomColumns = [
    { title: '房间', dataIndex: 'code', key: 'code', width: 120, render: (v: string, r: PsRoom) => (<span className="psrm-code">{v}<span className="psrm-room-name">{r.name}</span></span>) },
    { title: 'Suite 归属', dataIndex: 'suiteId', key: 'suiteId', width: 170, render: (v: string) => suiteName(v) },
    { title: 'Suite 角色', dataIndex: 'suiteRole', key: 'suiteRole', width: 170, render: (v: PsRoom['suiteRole']) => <WxbTag color={psSuiteRoleColor(v)}>{PS_SUITE_ROLE_LABEL[v]}</WxbTag> },
    { title: '放行态', dataIndex: 'releaseState', key: 'releaseState', width: 110, render: (v: PsRoom['releaseState']) => <WxbTag color={v === 'released' ? 'green' : 'amber'}>{v === 'released' ? '已放行' : '未放行'}</WxbTag> },
    { title: 'CHT 洁净效期', dataIndex: 'chtHours', key: 'chtHours', width: 120, render: (v: number) => `${v}h` },
    { title: '备注', dataIndex: 'note', key: 'note', render: (v?: string) => <span className="psrm-muted">{v ?? '—'}</span> },
  ];

  // ── 物料效期表 ──
  const shelfColumns = [
    { title: '物料', dataIndex: 'material', key: 'material' },
    { title: '类别', dataIndex: 'category', key: 'category', width: 140, render: (v: PsShelfLife['category']) => <WxbTag color={psShelfCategoryColor(v)}>{PS_SHELF_CATEGORY_LABEL[v]}</WxbTag> },
    { title: '效期(短=排产越紧)', dataIndex: 'shelfLifeHours', key: 'shelfLifeHours', width: 220, render: (v: number) => (
      <div className="psrm-shelf-cell">
        <span className={`psrm-shelf-val ${shelfTone(v)}`}>{fmtShelfLife(v)}</span>
        <span className="psrm-shelf-bar"><span className={`psrm-shelf-fill ${shelfTone(v)}`} style={{ width: `${shelfBarPct(v)}%` }} /></span>
      </div>
    ) },
    { title: '起算基准', dataIndex: 'basis', key: 'basis', width: 130 },
    { title: '说明(→ 批次层 max-lag)', dataIndex: 'note', key: 'note', render: (v?: string) => <span className="psrm-muted">{v ?? '—'}</span> },
  ];

  return (
    <WxbPageShell size="full" gap="lg" className="psrm-page">
      <WxbPageHeader
        eyebrow="排产 · 资源主数据(模板层 · 无时间无实例)"
        title="排产资源主数据"
        description="排产专属维度:CIP 站拓扑(容量 1,设备→管线→{主站,备站})、配液罐(短占+转储释放)、储存容器(效期内占)、房间 & suite(放行状态机 + 互斥)、物料效期常数。供排产引擎在批次层做资源传播 + 确定性落点时查询。"
        meta={
          <span className="psrm-meta">
            {master.facility} · {master.cipStations.length} CIP 站 / {master.pipelines.length} 管线 · {master.prepTanks.length} 配液罐 · {master.rooms.length} 房间 · {master.shelfLives.length} 效期常数
          </span>
        }
      />

      <div className="psrm-banner">
        <strong>这是「主数据」,不是排产结果。</strong>
        引擎排产时按各操作 demands(如「CEX skid@clean∧sterile」「buffer@已配制·效期内」「房间@released」)在此查 CIP 路由、配液/储存容量、suite 互斥与效期墙。
        CIP 引擎只往<strong>主站</strong>排,主站塞不下即<strong>报增援</strong>,动备站交给人(D20)。
        <span className="psrm-todo">TODO:后端持久化 + 增删改连新建排产微服务 DataAssembler;当前为只读 mock。</span>
      </div>

      <WxbPageSection variant="framed" density="compact" className="psrm-section">
        <WxbTabs
          activeKey={tab}
          onChange={(k) => setTab(k as PsResourceTab)}
          items={TAB_ORDER.map((t) => ({
            key: t,
            label: (
              <span className="psrm-tab-label">
                {PS_RESOURCE_TAB_LABEL[t]}
                <span className="psrm-tab-count">{counts[t]}</span>
              </span>
            ),
            children: null,
          }))}
        />

        {/* ① CIP 站 & 拓扑 */}
        {tab === 'cip' && (
          <div className="psrm-pane">
            <div className="psrm-view-label">设备 / 罐 → 管线 → {'{主站(优先), 备站(应急)}'} · 同站容量 1,同刻只洗一条管线</div>
            <PsCipTopology
              stations={master.cipStations}
              pipelines={master.pipelines}
              equipment={master.cipEquipment}
            />

            <div className="psrm-view-label psrm-mt">CIP 站清单</div>
            <div className="psrm-card-grid">
              {master.cipStations.map((s) => (
                <div className={`psrm-res-card${s.emergencyOnly ? ' emergency' : ''}`} key={s.id}>
                  <div className="psrm-res-head">
                    <span className="psrm-code">{s.code}</span>
                    <WxbTag color={s.emergencyOnly ? 'amber' : 'green'}>{s.emergencyOnly ? '备站(应急)' : '主站可用'}</WxbTag>
                    <span className="psrm-cap">容量 {s.capacity}</span>
                  </div>
                  <div className="psrm-res-name">{s.name}</div>
                  <div className="psrm-res-sub">{s.department}</div>
                  {s.note && <div className="psrm-muted psrm-res-note">{s.note}</div>}
                </div>
              ))}
            </div>

            <div className="psrm-view-label psrm-mt">管线 → 主备站映射</div>
            <div className="psrm-pipe-list">
              {master.pipelines.map((p) => {
                const primary = master.cipStations.find((s) => s.id === p.primaryStationId);
                const backup = p.backupStationId ? master.cipStations.find((s) => s.id === p.backupStationId) : undefined;
                const equips = master.cipEquipment.filter((e) => e.pipelineId === p.id);
                return (
                  <div className="psrm-pipe-row" key={p.id}>
                    <span className="psrm-pipe-code">{p.code}</span>
                    <span className="psrm-pipe-name">{p.name}</span>
                    <span className="psrm-pipe-arrow">主站</span>
                    <WxbTag color="green">{primary?.code ?? '—'}</WxbTag>
                    {backup && (
                      <>
                        <span className="psrm-pipe-arrow">备站</span>
                        <WxbTag color="amber">{backup.code}</WxbTag>
                      </>
                    )}
                    <span className="psrm-pipe-equips">挂 {equips.length} 设备:{equips.map((e) => e.code).join('、')}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ② 配液罐 */}
        {tab === 'prep' && (
          <div className="psrm-pane">
            <div className="psrm-view-label">配液罐 = 配制期短占 + 转储释放(转移到储存容器后即腾出);数量充足 → 通常非瓶颈(C11)</div>
            <PsOccupancyDiagram />
            <div className="psrm-view-label psrm-mt">配液罐清单</div>
            <WxbDataTable<PsPrepTank>
              rowKey="id"
              density="compact"
              columns={prepColumns as any}
              dataSource={master.prepTanks}
              pagination={false}
            />
          </div>
        )}

        {/* ③ 储存容器 */}
        {tab === 'storage' && (
          <div className="psrm-pane">
            <div className="psrm-view-label">储存容器(储袋/储罐)= 溶液在效期内真正占用的资源(配液罐转储后落于此,C11)</div>
            <PsOccupancyDiagram />
            <div className="psrm-view-label psrm-mt">储存容器清单</div>
            <WxbDataTable<PsStorageVessel>
              rowKey="id"
              density="compact"
              columns={storageColumns as any}
              dataSource={master.storageVessels}
              pagination={false}
            />
          </div>
        )}

        {/* ④ 房间 & suite */}
        {tab === 'room' && (
          <div className="psrm-pane">
            <div className="psrm-view-label">Suite 互斥(审计强约束):同一 suite 同刻不得并行 pre-viral + post-viral;房间放行 = 产出 released 态的派生操作</div>
            <div className="psrm-suite-grid">
              {master.suites.map((s: PsSuite) => {
                const rooms = master.rooms.filter((r) => r.suiteId === s.id);
                return (
                  <div className="psrm-suite-card" key={s.id}>
                    <div className="psrm-suite-head">
                      <span className="psrm-suite-name">{s.name}</span>
                      <WxbTag color={psSuiteRoleColor(s.role)}>{PS_SUITE_ROLE_LABEL[s.role]}</WxbTag>
                    </div>
                    {s.note && <div className="psrm-muted psrm-suite-note">{s.note}</div>}
                    <div className="psrm-suite-rooms">
                      {rooms.map((r) => (
                        <span className="psrm-suite-room" key={r.id}>
                          {r.code}
                          <WxbTag color={r.releaseState === 'released' ? 'green' : 'amber'}>{r.releaseState === 'released' ? '已放行' : '未放行'}</WxbTag>
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="psrm-view-label psrm-mt">房间清单(放行状态机 + suite 归属)</div>
            <WxbDataTable<PsRoom>
              rowKey="id"
              density="compact"
              columns={roomColumns as any}
              dataSource={master.rooms}
              pagination={false}
            />
          </div>
        )}

        {/* ⑤ 物料效期 */}
        {tab === 'shelf-life' && (
          <div className="psrm-pane">
            <div className="psrm-view-label">物料效期常数(配方常数)= 批次层落为生产者→消费者 max-lag;超期 = 时序不可行(免费检测)</div>
            <WxbDataTable<PsShelfLife>
              rowKey="id"
              density="compact"
              columns={shelfColumns as any}
              dataSource={master.shelfLives}
              pagination={false}
            />
          </div>
        )}
      </WxbPageSection>
    </WxbPageShell>
  );
};

export default PsResourceMasterPage;
