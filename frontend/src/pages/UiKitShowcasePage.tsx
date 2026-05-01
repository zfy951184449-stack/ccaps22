import React, { useState } from 'react';
import { 
  WxbButton, WxbCard, WxbBadge, WxbKpiCard, WxbInput, 
  WxbAlert, WxbStepper, WxbTableWrapper, WxbChartCard,
  WxbSideNav, WxbTopNav, WxbIcon, WxbLogo, WxbSwitch, WxbModal,
  // ── 新增表单控件 ──
  WxbSelect, WxbDatePicker, WxbTimePicker, WxbInputNumber,
  WxbTextarea, WxbSearchInput, WxbCheckbox, WxbRadioGroup,
  WxbSlider, WxbUpload, WxbFormField,
  // ── 新增数据展示 ──
  WxbDataTable, WxbTag, WxbTooltip, WxbPopover,
  WxbAvatar, WxbAvatarGroup, WxbDescriptions, WxbTimeline,
  WxbList, WxbTree, WxbSkeleton, WxbEmpty, WxbDivider,
  // ── 新增导航 ──
  WxbTabs, WxbBreadcrumb, WxbPagination, WxbSegmented, WxbDropdown,
  // ── 新增反馈 ──
  WxbDrawer, WxbPopconfirm, WxbSpinner, WxbProgress,
  wxbToast, WxbCollapse,
  // ── 数据可视化 ──
  WxbBarChart, WxbPieChart, WxbAreaChart, WxbMiniGantt,
  WxbGauge, WxbSparkline, WxbGanttChart,
} from '../components/wxb-ui';
import { WxbIconsData, WxbIconName } from '../components/wxb-ui/Icon/icons';

const MOCK_CHART_DATA = [
  {used:65, avail:64, label:'W14', date:'2026-04-07'},
  {used:67, avail:60, label:'W15', date:'2026-04-14'},
  {used:70, avail:55, label:'W16', date:'2026-04-21'},
  {used:67, avail:58, label:'W17', date:'2026-04-28'},
  {used:73, avail:48, label:'W18', date:'2026-05-05'},
  {used:77, avail:43, label:'W19', date:'2026-05-12'},
  {used:80, avail:38, label:'W20', date:'2026-05-19'},
  {used:83, avail:33, label:'W21', date:'2026-05-26'},
  {used:84, avail:31, label:'W22', date:'2026-06-02'},
  {used:86, avail:27, label:'W23', date:'2026-06-09'},
  {used:88, avail:23, label:'W24', date:'2026-06-16'},
];

const UiKitShowcasePage: React.FC = () => {
  const [showModal, setShowModal] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showDrawer, setShowDrawer] = useState(false);
  const [paginationPage, setPaginationPage] = useState(3);

  return (
    <div style={{ padding: 24, fontFamily: 'var(--wx-font-sans)', background: '#F5F8FB', minHeight: '100vh' }}>
      <h1 className="wxb-h2" style={{ marginBottom: 24 }}>WuXi Biologics UI Kit Showcase</h1>
      
      {/* 顶部导航展示 (纯 UI 组件) */}
      <section style={{ marginBottom: 32 }}>
        <h2 className="wxb-h4" style={{ marginBottom: 16 }}>0. Global Navigation</h2>
        <WxbTopNav 
          links={[
            { id: '1', label: 'Overview', icon: <span style={{display:'inline-block', width:12, height:12, borderRadius:'50%', border:'2px solid currentColor'}}></span> },
            { id: '2', label: 'Operations', icon: <span style={{display:'inline-block', width:12, height:12, background:'currentColor'}}></span>, animClass: 'anim-cube' },
          ]}
          activeId="2"
        />
      </section>

      <div style={{ display: 'flex', gap: 24 }}>
        {/* 侧边导航展示 (纯 UI 组件) */}
        <div style={{ width: 240, flexShrink: 0 }}>
          <h2 className="wxb-h4" style={{ marginBottom: 16 }}>0. Side Navigation</h2>
          <WxbSideNav 
            groups={[
              { title: 'Operations', items: [{ id: 'dashboard', label: 'Dashboard', icon: '·' }, { id: 'batch', label: 'Batch Execution', icon: '■' }] },
              { title: 'Quality', items: [{ id: 'dev', label: 'Deviations', icon: '!', badge: 3 }] }
            ]}
            activeId="batch"
            capacity={{ label: 'Capacity · 30d', value: '78%', percent: 78, subLeft: 'Used 31.4 kL', subRight: '+4.2 pts' }}
          />
        </div>

        {/* 核心基础组件 */}
        <div style={{ flex: 1 }}>
          <section style={{ marginBottom: 32 }}>
            <h2 className="wxb-h4" style={{ marginBottom: 16 }}>1. Buttons & Inputs</h2>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
              <WxbButton variant="primary">Primary</WxbButton>
              <WxbButton variant="secondary">Secondary</WxbButton>
              <WxbButton variant="ghost">Ghost</WxbButton>
              <WxbButton variant="danger">Danger</WxbButton>
            </div>
            <div style={{ display: 'flex', gap: 24, maxWidth: 600 }}>
              <WxbInput label="Lot No." placeholder="BX-2418-A03" helpText="Format: BX-YYWW-A##" />
              <WxbInput label="Yield (g/L)" defaultValue="0.00" error="Yield must be greater than 0." />
            </div>
          </section>

          <section style={{ marginBottom: 32 }}>
            <h2 className="wxb-h4" style={{ marginBottom: 16 }}>1b. Switch / Toggle</h2>
            <WxbCard>
              <div style={{ display: 'flex', gap: 32, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
                  <span className="wxb-body" style={{ fontSize: 12, color: 'var(--wx-fg-3)' }}>Default</span>
                  <WxbSwitch />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
                  <span className="wxb-body" style={{ fontSize: 12, color: 'var(--wx-fg-3)' }}>Checked</span>
                  <WxbSwitch defaultChecked />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
                  <span className="wxb-body" style={{ fontSize: 12, color: 'var(--wx-fg-3)' }}>With Label</span>
                  <WxbSwitch checkedChildren="启用" unCheckedChildren="停用" defaultChecked />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
                  <span className="wxb-body" style={{ fontSize: 12, color: 'var(--wx-fg-3)' }}>Small</span>
                  <WxbSwitch size="sm" defaultChecked />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
                  <span className="wxb-body" style={{ fontSize: 12, color: 'var(--wx-fg-3)' }}>Disabled OFF</span>
                  <WxbSwitch disabled />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
                  <span className="wxb-body" style={{ fontSize: 12, color: 'var(--wx-fg-3)' }}>Disabled ON</span>
                  <WxbSwitch disabled checked />
                </div>
              </div>
            </WxbCard>
          </section>

          <section style={{ marginBottom: 32 }}>
            <h2 className="wxb-h4" style={{ marginBottom: 16 }}>1c. Modals & Dialogs</h2>
            <WxbCard>
              <div style={{ display: 'flex', gap: 16 }}>
                <WxbButton onClick={() => setShowModal(true)}>Open Standard Modal</WxbButton>
                <WxbButton variant="danger" onClick={() => setShowConfirm(true)}>Open Danger Confirm</WxbButton>
              </div>
            </WxbCard>

            <WxbModal 
              title="Standard Dialog" 
              open={showModal} 
              onCancel={() => setShowModal(false)}
              onOk={() => setShowModal(false)}
            >
              <p className="wxb-body" style={{ margin: '16px 0', color: 'var(--wx-fg-2)' }}>
                This is a standard WxbModal. Notice the 12px border radius, the subtle backdrop blur, and the primary action button.
              </p>
              <WxbInput label="Your Feedback" placeholder="Type here..." />
            </WxbModal>

            <WxbModal 
              title="Irreversible Action" 
              open={showConfirm} 
              onCancel={() => setShowConfirm(false)}
              onOk={() => setShowConfirm(false)}
              okText="Delete Record"
              okVariant="danger"
              width={400}
            >
              <p className="wxb-body" style={{ margin: '16px 0', color: 'var(--wx-fg-2)' }}>
                Are you sure you want to delete this record? This action cannot be undone.
              </p>
            </WxbModal>
          </section>

          <section style={{ marginBottom: 32 }}>
            <h2 className="wxb-h4" style={{ marginBottom: 16 }}>2. Badges & Alerts</h2>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
              <WxbBadge variant="code" status="success" label="In Spec" />
              <WxbBadge variant="outline" status="warning" code="WRN" label="Near Limit" />
              <WxbBadge variant="tracked" status="error" label="OOS" />
            </div>
            <div style={{ display: 'flex', gap: 16 }}>
              <WxbAlert variant="warning" title="Bioreactor BR-204 approaching lower limit">
                Current 38%, threshold 35%. Consider increasing sparge rate.
              </WxbAlert>
              <WxbAlert variant="error" title="DEV-2026-0418 · OOS detected">
                Yield falls below specification. Investigation required.
              </WxbAlert>
            </div>
          </section>

          <section style={{ marginBottom: 32 }}>
            <h2 className="wxb-h4" style={{ marginBottom: 16 }}>3. Stepper & Table</h2>
            <WxbCard style={{ marginBottom: 24 }}>
              <WxbStepper steps={[
                { label: 'Inoculation', desc: 'D0', status: 'done' },
                { label: 'Seed Train', desc: 'D1-D4', status: 'done' },
                { label: 'Production', desc: 'D5-D11', status: 'curr' },
                { label: 'Harvest', desc: 'D12', status: 'todo' }
              ]} />
            </WxbCard>

            <WxbTableWrapper>
              <thead>
                <tr>
                  <th>Lot</th>
                  <th>Bioreactor</th>
                  <th className="num-cell">Yield</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="mono-cell">BX-2418-A03</td>
                  <td>BR-204</td>
                  <td className="num-cell">5.84 g/L</td>
                  <td><WxbBadge variant="code" status="info" label="QA Review" /></td>
                </tr>
                <tr>
                  <td className="mono-cell">BX-2418-A02</td>
                  <td>BR-204</td>
                  <td className="num-cell">5.62 g/L</td>
                  <td><WxbBadge variant="code" status="success" label="Released" /></td>
                </tr>
              </tbody>
            </WxbTableWrapper>
          </section>

          <section style={{ marginBottom: 32 }}>
            <h2 className="wxb-h4" style={{ marginBottom: 16 }}>4. Chart & KPI</h2>
            <div style={{ display: 'flex', gap: 16 }}>
              <div style={{ flex: 2 }}>
                <WxbChartCard 
                  title="Capacity Utilization" 
                  subtitle="13-week trend · Wuxi MFG18" 
                  data={MOCK_CHART_DATA} 
                />
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
                <WxbKpiCard title="Overall Capacity" value="78" unit="%" trend="up" trendText="4.2 pts WoW" />
                <WxbKpiCard title="Open Deviations" value="3" trend="down" trendText="1 vs last week" />
              </div>
            </div>
          </section>

          <section style={{ marginBottom: 32 }}>
            <h2 className="wxb-h4" style={{ marginBottom: 16 }}>5. Brand Logo</h2>
            <div style={{ display: 'flex', gap: 24, alignItems: 'center', background: '#fff', padding: 24, borderRadius: 8, border: '1px solid #E4EAF1' }}>
              <WxbLogo width={200} mode="dark" />
              <div style={{ background: '#0B3D7F', padding: '24px 32px', borderRadius: 6 }}>
                <WxbLogo width={200} mode="light" />
              </div>
            </div>
          </section>

          <section style={{ marginBottom: 64 }}>
            <h2 className="wxb-h4" style={{ marginBottom: 16 }}>6. GMP Process Iconography Library</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: 12 }}>
              {Object.keys(WxbIconsData).map((iconName) => (
                <div key={iconName} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, background: '#fff', border: '1px solid #E4EAF1', borderRadius: 8, padding: '12px 6px', transition: 'border-color 200ms', cursor: 'default' }} 
                     onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#1F6FEB'; e.currentTarget.style.color = '#0B3D7F'; e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(31,111,235,.12)'; }}
                     onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#E4EAF1'; e.currentTarget.style.color = 'inherit'; e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'none'; }}
                >
                  <WxbIcon name={iconName as WxbIconName} size={28} />
                  <span style={{ fontSize: 10, fontFamily: "var(--wx-font-mono)", color: '#8898A8', textAlign: 'center', wordBreak: 'break-all' }}>{iconName}</span>
                </div>
              ))}
            </div>
           </section>
        </div>
      </div>

      <section style={{ marginBottom: 32 }}>
        <h2 className="wxb-h4" style={{ marginBottom: 16 }}>7. Form Controls</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <WxbCard title="7a. 下拉选择器 Select">
            <WxbSelect label="产品类型" placeholder="请选择..." options={[{ label: '单克隆抗体', value: 'mab' }, { label: '双特异性抗体', value: 'bsab' }, { label: 'ADC', value: 'adc' }]} style={{ width: '100%' }} />
            <div style={{ height: 12 }} />
            <WxbSelect label="多选模式" placeholder="请选择标签..." mode="multiple" options={[{ label: 'GMP', value: 'gmp' }, { label: 'cGMP', value: 'cgmp' }, { label: 'BSL-2', value: 'bsl2' }]} style={{ width: '100%' }} />
          </WxbCard>
          <WxbCard title="7b. 日期 & 时间选择器">
            <WxbDatePicker label="批次开始日期" style={{ width: '100%' }} placeholder="选择日期" />
            <div style={{ height: 12 }} />
            <WxbTimePicker label="换班时间" style={{ width: '100%' }} placeholder="选择时间" />
          </WxbCard>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <WxbCard title="7c. 数字输入 & 多行文本">
            <WxbInputNumber label="人员数量" placeholder="输入数量" min={1} max={100} defaultValue={8} style={{ width: '100%' }} />
            <div style={{ height: 12 }} />
            <WxbTextarea label="备注说明" placeholder="输入备注信息..." helpText="最多 500 字" />
          </WxbCard>
          <WxbCard title="7d. 搜索输入框 SearchInput">
            <WxbSearchInput placeholder="搜索员工姓名..." onSearch={(v) => console.log('search:', v)} />
            <div style={{ height: 12 }} />
            <WxbSearchInput placeholder="搜索批次号..." defaultValue="BAT-2026" />
          </WxbCard>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <WxbCard title="7e. 复选框 Checkbox">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <WxbCheckbox defaultChecked>已通过 GMP 培训</WxbCheckbox>
              <WxbCheckbox>持有安全证书</WxbCheckbox>
              <WxbCheckbox indeterminate>部分完成（半选态）</WxbCheckbox>
              <WxbCheckbox disabled>已锁定（禁用）</WxbCheckbox>
            </div>
          </WxbCard>
          <WxbCard title="7f. 单选框 Radio">
            <WxbRadioGroup options={[{ label: '白班 (08:00-16:00)', value: 'day' }, { label: '中班 (16:00-00:00)', value: 'mid' }, { label: '夜班 (00:00-08:00)', value: 'night' }]} defaultValue="day" direction="vertical" />
          </WxbCard>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <WxbCard title="7g. 滑动条 Slider">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <WxbSlider defaultValue={65} />
              <WxbSlider defaultValue={30} disabled />
            </div>
          </WxbCard>
          <WxbCard title="7h. 文件上传 Upload">
            <WxbUpload accept=".xlsx,.csv" fileList={[{ uid: '1', name: 'template_v3.xlsx', size: 24576, status: 'done' }, { uid: '2', name: 'schedule_fail.csv', size: 8192, status: 'error' }]} />
          </WxbCard>
        </div>

        <WxbCard title="7i. 表单字段 FormField">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <WxbFormField label="员工姓名" required error="此字段必填"><WxbInput placeholder="请输入..." /></WxbFormField>
            <WxbFormField label="工号" helpText="格式: WXB-XXXX"><WxbInput placeholder="WXB-" /></WxbFormField>
          </div>
        </WxbCard>
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 className="wxb-h4" style={{ marginBottom: 16 }}>8. Data Display</h2>
        <WxbCard title="8a. 数据表格 DataTable">
          <WxbDataTable size="small" dataSource={[{ key: '1', id: 'BAT-001', product: '贝伐珠单抗', status: '进行中', progress: 67 }, { key: '2', id: 'BAT-002', product: '阿达木单抗', status: '已完成', progress: 100 }, { key: '3', id: 'BAT-003', product: 'ADC-X01', status: '待排程', progress: 0 }]}
            columns={[{ title: '批次号', dataIndex: 'id', key: 'id', sorter: (a: any, b: any) => a.id.localeCompare(b.id) }, { title: '产品', dataIndex: 'product', key: 'product' }, { title: '状态', dataIndex: 'status', key: 'status' }, { title: '进度', dataIndex: 'progress', key: 'progress', render: (v: number) => <WxbProgress percent={v} /> }]} pagination={false} />
        </WxbCard>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <WxbCard title="8b. 标签 Tag">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <WxbTag color="blue">蓝色标签</WxbTag>
              <WxbTag color="green">已通过</WxbTag>
              <WxbTag color="amber">待审核</WxbTag>
              <WxbTag color="red">已拒绝</WxbTag>
              <WxbTag color="cyan">信息</WxbTag>
              <WxbTag color="neutral">中性</WxbTag>
              <WxbTag color="blue" closable onClose={() => console.log('close')}>可关闭</WxbTag>
            </div>
          </WxbCard>
          <WxbCard title="8c. 文字提示 & 气泡卡片">
            <div style={{ display: 'flex', gap: 16 }}>
              <WxbTooltip title="这是一段提示文字"><WxbButton variant="secondary">悬停查看 Tooltip</WxbButton></WxbTooltip>
              <WxbPopover title="批次详情" content={<div><p>产品: 贝伐珠单抗</p><p>进度: 67%</p></div>}><WxbButton variant="secondary">悬停查看 Popover</WxbButton></WxbPopover>
            </div>
          </WxbCard>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <WxbCard title="8d. 头像 Avatar">
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <WxbAvatar initials="ZY" />
              <WxbAvatar initials="LW" color="#2E9D6E" />
              <WxbAvatar initials="CX" color="#D6493A" size={28} />
              <WxbAvatarGroup max={3}>
                <WxbAvatar initials="A" /><WxbAvatar initials="B" color="#2E9D6E" /><WxbAvatar initials="C" color="#E8B53C" /><WxbAvatar initials="D" color="#D6493A" /><WxbAvatar initials="E" />
              </WxbAvatarGroup>
            </div>
          </WxbCard>
          <WxbCard title="8e. 描述列表 Descriptions">
            <WxbDescriptions bordered columns={2} items={[{ label: '批次号', value: 'BAT-2026-001' }, { label: '产品', value: '贝伐珠单抗' }, { label: '状态', value: '进行中' }, { label: '负责人', value: '张工' }]} />
          </WxbCard>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <WxbCard title="8f. 时间线 Timeline">
            <WxbTimeline items={[{ label: '批次创建', time: '2026-04-01 08:00', color: 'green' }, { label: '培养基配制', time: '2026-04-02 09:30', color: 'green' }, { label: '接种进行中', time: '2026-04-03 14:00', color: 'blue' }, { label: '待纯化', time: '计划中', color: 'neutral' }]} />
          </WxbCard>
          <WxbCard title="8g. 列表 List">
            <WxbList header="近期偏差" dataSource={['DEV-001: pH 超出范围 (已关闭)', 'DEV-002: 温度波动 (处理中)', 'DEV-003: 无菌检测异常 (调查中)']} renderItem={(item: string) => <span>{item}</span>} />
          </WxbCard>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <WxbCard title="8h. 树形控件 Tree">
            <WxbTree defaultExpandAll treeData={[{ title: '生产部', key: 'prod', children: [{ title: '上游车间', key: 'up', children: [{ title: '发酵组', key: 'ferm' }, { title: '培养组', key: 'cult' }] }, { title: '下游车间', key: 'down', children: [{ title: '纯化组', key: 'purif' }] }] }]} />
          </WxbCard>
          <WxbCard title="8i. 骨架屏 & 空状态">
            <WxbSkeleton avatar rows={2} />
            <WxbDivider label="VS" />
            <WxbEmpty description="暂无排程数据" action={<WxbButton variant="primary">创建排程</WxbButton>} />
          </WxbCard>
        </div>

        <WxbCard title="8j. 分割线 Divider">
          <p style={{ margin: 0, color: '#5A6B7E' }}>段落 A</p>
          <WxbDivider />
          <p style={{ margin: 0, color: '#5A6B7E' }}>段落 B</p>
          <WxbDivider label="OR" />
          <p style={{ margin: 0, color: '#5A6B7E' }}>段落 C &nbsp;<WxbDivider direction="vertical" />&nbsp; 行内分割</p>
        </WxbCard>

      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 className="wxb-h4" style={{ marginBottom: 16 }}>9. Navigation</h2>
        <WxbCard title="9a. 标签页 Tabs">
          <WxbTabs items={[{ key: 'overview', label: '概览', children: <p>批次概览内容区域</p> }, { key: 'schedule', label: '排程', children: <p>排程视图内容区域</p> }, { key: 'personnel', label: '人员', children: <p>人员管理内容区域</p> }, { key: 'disabled', label: '已归档', disabled: true }]} />
        </WxbCard>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <WxbCard title="9b. 面包屑 Breadcrumb">
            <WxbBreadcrumb items={[{ label: '首页' }, { label: '生产管理' }, { label: '批次列表' }, { label: 'BAT-2026-001' }]} />
          </WxbCard>
          <WxbCard title="9c. 分页器 Pagination">
            <WxbPagination current={paginationPage} total={200} pageSize={10} onChange={setPaginationPage} />
          </WxbCard>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <WxbCard title="9d. 分段控制器 Segmented">
            <WxbSegmented options={[{ label: '日视图', value: 'day' }, { label: '周视图', value: 'week' }, { label: '月视图', value: 'month' }]} defaultValue="week" />
            <div style={{ height: 8 }} />
            <WxbSegmented size="sm" options={[{ label: '列表', value: 'list' }, { label: '甘特', value: 'gantt' }, { label: '看板', value: 'kanban' }]} defaultValue="gantt" />
          </WxbCard>
          <WxbCard title="9e. 下拉菜单 Dropdown">
            <WxbDropdown menu={{ items: [{ key: '1', label: '导出 Excel' }, { key: '2', label: '导出 PDF' }, { type: 'divider' as const }, { key: '3', label: '删除', danger: true }] }}>
              <WxbButton variant="secondary">操作菜单 ▾</WxbButton>
            </WxbDropdown>
          </WxbCard>
        </div>

      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 className="wxb-h4" style={{ marginBottom: 16 }}>10. Feedback</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <WxbCard title="10a. 抽屉 Drawer">
            <WxbButton variant="primary" onClick={() => setShowDrawer(true)}>打开抽屉</WxbButton>
            <WxbDrawer title="批次详情" open={showDrawer} onClose={() => setShowDrawer(false)} width={400}>
              <WxbDescriptions columns={1} items={[{ label: '批次号', value: 'BAT-2026-001' }, { label: '产品', value: '贝伐珠单抗' }, { label: '阶段', value: '纯化' }, { label: '负责人', value: '张工' }]} />
            </WxbDrawer>
          </WxbCard>
          <WxbCard title="10b. 气泡确认框 Popconfirm">
            <WxbPopconfirm title="确认删除此批次？" description="删除后不可恢复" onConfirm={() => wxbToast.success('已删除')}>
              <WxbButton variant="danger">删除批次</WxbButton>
            </WxbPopconfirm>
          </WxbCard>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
          <WxbCard title="10c. 加载动画 Spinner">
            <div style={{ display: 'flex', justifyContent: 'center', gap: 24 }}>
              <WxbSpinner size={24} />
              <WxbSpinner size={36} tip="加载中..." />
            </div>
          </WxbCard>
          <WxbCard title="10d. 进度条 Progress (线性)">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <WxbProgress percent={67} />
              <WxbProgress percent={100} status="success" />
              <WxbProgress percent={45} status="warning" />
              <WxbProgress percent={23} status="error" />
            </div>
          </WxbCard>
          <WxbCard title="10d. Progress (环形)">
            <div style={{ display: 'flex', justifyContent: 'center', gap: 16 }}>
              <WxbProgress type="circle" percent={72} size={72} />
              <WxbProgress type="circle" percent={100} size={72} status="success" />
            </div>
          </WxbCard>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <WxbCard title="10e. 全局提示 Toast">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <WxbButton variant="primary" onClick={() => wxbToast.success('操作成功')}>成功</WxbButton>
              <WxbButton variant="secondary" onClick={() => wxbToast.error('操作失败')}>错误</WxbButton>
              <WxbButton variant="secondary" onClick={() => wxbToast.warning('请注意')}>警告</WxbButton>
              <WxbButton variant="ghost" onClick={() => wxbToast.info('提示信息')}>信息</WxbButton>
            </div>
          </WxbCard>
          <WxbCard title="10f. 折叠面板 Collapse">
            <WxbCollapse accordion items={[{ key: '1', label: '上游工艺参数', children: '培养温度: 37°C, pH: 7.0, DO: 40%' }, { key: '2', label: '下游纯化步骤', children: 'Protein A → IEX → SEC → UF/DF' }, { key: '3', label: '质量控制检测', children: 'SEC-HPLC, CE-SDS, icIEF, 残留 HCP' }]} />
          </WxbCard>
        </div>

      </section>

      <section style={{ marginBottom: 64 }}>
        <h2 className="wxb-h4" style={{ marginBottom: 16 }}>11. Data Visualization</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <WxbCard title="11a. 柱状图 BarChart">
            <WxbBarChart title="月度批次产量" unit="批" data={[{ label: '1月', value: 12 }, { label: '2月', value: 8 }, { label: '3月', value: 15 }, { label: '4月', value: 11 }, { label: '5月', value: 18 }, { label: '6月', value: 14 }]} />
          </WxbCard>
          <WxbCard title="11b. 饼图/环形图 PieChart">
            <WxbPieChart title="产品线分布" centerLabel="78批" data={[{ label: '单抗', value: 45, color: '#0B3D7F' }, { label: 'ADC', value: 18, color: '#2E9D6E' }, { label: '双抗', value: 10, color: '#E8B53C' }, { label: '其他', value: 5, color: '#8898A8' }]} />
          </WxbCard>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <WxbCard title="11c. 面积图 AreaChart">
            <WxbAreaChart title="产能利用率趋势" unit="%" data={[{ label: 'W1', value: 62 }, { label: 'W2', value: 68 }, { label: 'W3', value: 71 }, { label: 'W4', value: 65 }, { label: 'W5', value: 78 }, { label: 'W6', value: 82 }, { label: 'W7', value: 85 }, { label: 'W8', value: 79 }]} />
          </WxbCard>
          <WxbCard title="11d. 迷你甘特图 MiniGantt">
            <WxbMiniGantt title="批次 BAT-001 工序" totalDuration={72} tasks={[{ id: '1', label: '培养基配制', start: 0, end: 8, color: '#2E9D6E' }, { id: '2', label: '细胞接种', start: 8, end: 12, color: '#1F6FEB' }, { id: '3', label: '发酵培养', start: 12, end: 48, color: '#0B3D7F', progress: 65 }, { id: '4', label: '收获/纯化', start: 48, end: 64, color: '#E8B53C' }, { id: '5', label: '质量检测', start: 64, end: 72, color: '#8898A8' }]} />
          </WxbCard>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
          <WxbCard title="11e. 仪表盘 Gauge">
            <div style={{ display: 'flex', justifyContent: 'center', gap: 24 }}>
              <WxbGauge percent={78} title="OEE" label="设备效率" />
              <WxbGauge percent={92} title="良品率" label="质量合格" color="var(--wx-green-500,#2E9D6E)" />
            </div>
          </WxbCard>
          <WxbCard title="11f. 迷你趋势线 Sparkline">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, color: '#5A6B7E', width: 80 }}>产量趋势</span>
                <WxbSparkline data={[12, 8, 15, 11, 18, 14, 20]} width={100} height={24} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, color: '#5A6B7E', width: 80 }}>偏差数</span>
                <WxbSparkline data={[5, 3, 7, 2, 4, 1, 2]} width={100} height={24} color="var(--wx-red-500,#D6493A)" />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, color: '#5A6B7E', width: 80 }}>人员利用</span>
                <WxbSparkline data={[78, 82, 85, 79, 88, 91, 87]} width={100} height={24} color="var(--wx-green-500,#2E9D6E)" />
              </div>
            </div>
          </WxbCard>
          <WxbCard title="已有 ChartCard 回顾">
            <WxbChartCard title="产能趋势" subtitle="W14-W24" data={MOCK_CHART_DATA.slice(0, 6)} />
          </WxbCard>
        </div>
      </section>

      {/* ═══ Section 12: 高性能甘特图 ═══ */}
      <section style={{ marginTop: 32 }}>
        <h4 className="wxb-h3" style={{ marginBottom: 16 }}>12. 高性能甘特图 GanttChart（Canvas 渲染）</h4>
        <WxbGanttChart
          style={{ height: 460 }}
          groups={[
            { id: 'g1', label: '上游工艺', color: '#1F6FEB' },
            { id: 'g1-s1', label: '配料', parentId: 'g1', color: '#5A93F0' },
            { id: 'g1-s2', label: '发酵', parentId: 'g1', color: '#1F6FEB' },
            { id: 'g2', label: '下游工艺', color: '#2E9D6E' },
            { id: 'g2-s1', label: '灌装', parentId: 'g2', color: '#2E9D6E' },
            { id: 'g3', label: '质量检测', color: '#E8B53C' },
          ]}
          tasks={[
            { id: 't1', label: '称量', groupId: 'g1-s1', start: 2, end: 10, color: '#5A93F0', progress: 100, windowStart: 0, windowEnd: 14, status: '已完成' },
            { id: 't2', label: '溶解', groupId: 'g1-s1', start: 10, end: 18, color: '#5A93F0', progress: 80, windowStart: 8, windowEnd: 22 },
            { id: 't3', label: '过滤', groupId: 'g1-s1', start: 20, end: 28, color: '#5A93F0', progress: 45, windowStart: 18, windowEnd: 32 },
            { id: 't4', label: '接种', groupId: 'g1-s2', start: 30, end: 36, color: '#1F6FEB', progress: 30 },
            { id: 't5', label: '培养', groupId: 'g1-s2', start: 36, end: 84, color: '#1F6FEB', progress: 10 },
            { id: 't6', label: '收获', groupId: 'g1-s2', start: 84, end: 96, color: '#1F6FEB' },
            { id: 't7', label: 'CIP清洗', groupId: 'g2-s1', start: 98, end: 106, color: '#2E9D6E', progress: 0, windowStart: 96, windowEnd: 110 },
            { id: 't8', label: '灌装', groupId: 'g2-s1', start: 108, end: 120, color: '#2E9D6E' },
            { id: 't9', label: '封口', groupId: 'g2-s1', start: 120, end: 130, color: '#2E9D6E' },
            { id: 't10', label: '外观检测', groupId: 'g3', start: 132, end: 140, color: '#E8B53C' },
            { id: 't11', label: '含量测定', groupId: 'g3', start: 140, end: 152, color: '#E8B53C' },
            { id: 't12', label: '无菌检测', groupId: 'g3', start: 152, end: 168, color: '#E8B53C' },
          ]}
          dependencies={[
            { id: 'd1', from: 't1', to: 't2', type: 'FS', lag: 0 },
            { id: 'd2', from: 't2', to: 't3', type: 'FS', lag: 2 },
            { id: 'd3', from: 't3', to: 't4', type: 'FS', lag: 2 },
            { id: 'd4', from: 't5', to: 't6', type: 'FS' },
            { id: 'd5', from: 't6', to: 't7', type: 'FS', lag: 2 },
            { id: 'd6', from: 't8', to: 't9', type: 'FS' },
            { id: 'd7', from: 't9', to: 't10', type: 'FS', lag: 2 },
          ]}
          links={[
            { id: 'l1', taskIds: ['t4', 't7'], label: '共享设备', color: '#722ed1', style: 'dashed' },
          ]}
          onTaskClick={(task) => console.log('Task clicked:', task.label)}
        />
      </section>

    </div>
  );
};

export default UiKitShowcasePage;
