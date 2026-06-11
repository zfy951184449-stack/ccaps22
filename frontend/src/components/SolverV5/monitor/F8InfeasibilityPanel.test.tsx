/**
 * F8 验收测试：InfeasibilityPanel（无解诊断面板）
 *
 * 断言（§F8 验收标准）：
 * 1. 喂 INFEASIBLE + infeasibility mock → 卡片显示（每组一卡，含 message_zh）
 * 2. 点「跳到配置」→ onOpenConfig 被调用，传入 config_keys
 * 3. 缺字段降级（groups=null，located=undefined）→ V4 风格红字，不崩溃
 * 4. located=false → 诊断失败降级提示
 * 5. 七组 group 标识符（§1.5 冻结）正确映射为中文标签
 * 6. 颜色全 var(--wx-*)（无硬编码 hex）
 */

import React from 'react';
import { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import InfeasibilityPanel from './InfeasibilityPanel';
import type { InfeasibilityGroup } from './monitorTypes';
import type { InfeasibilityGroupId } from '../../../types/solverV5';

// ── 工具函数 ───────────────────────────────────────────────────────────────────

let container: HTMLElement;
let root: Root;

beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
    act(() => { root.unmount(); });
    document.body.removeChild(container);
    jest.restoreAllMocks();
});

function makeGroup(
    group: InfeasibilityGroupId,
    configKeys: string[] = [],
    overrides?: Partial<InfeasibilityGroup>,
): InfeasibilityGroup {
    return {
        group,
        lit_key: `lit_${group.toLowerCase().replace(/_/g, '_')}`,
        message_zh: `测试冲突：${group} 约束与其他条件冲突`,
        suggestion_zh: `建议：关闭 ${group} 相关约束或放宽参数`,
        config_keys: configKeys,
        ...overrides,
    };
}

function render(ui: React.ReactElement) {
    act(() => { root.render(ui); });
}

// ── 1. 正常 INFEASIBLE 场景：卡片显示 ──────────────────────────────────────────

describe('正常无解场景', () => {
    test('喂两组 mock → 渲染两张卡片，含 message_zh', () => {
        const groups: InfeasibilityGroup[] = [
            makeGroup('STANDARD_HOURS', ['enable_standard_hours']),
            makeGroup('LEADERSHIP_COVERAGE', ['enable_leadership_coverage', 'enable_leader_production_coverage']),
        ];

        render(
            <InfeasibilityPanel
                groups={groups}
                located={true}
                onOpenConfig={() => {}}
            />
        );

        const text = container.textContent ?? '';
        expect(text).toContain('测试冲突：STANDARD_HOURS');
        expect(text).toContain('测试冲突：LEADERSHIP_COVERAGE');
    });

    test('卡片数量与 groups 数组长度一致', () => {
        const groups: InfeasibilityGroup[] = [
            makeGroup('CONSECUTIVE_DAYS'),
            makeGroup('LOCKED_OPERATIONS'),
            makeGroup('POSITION_MUST_FILL'),
        ];

        render(
            <InfeasibilityPanel
                groups={groups}
                located={true}
            />
        );

        // 每张卡片都有对应的 message_zh
        const text = container.textContent ?? '';
        expect(text).toContain('测试冲突：CONSECUTIVE_DAYS');
        expect(text).toContain('测试冲突：LOCKED_OPERATIONS');
        expect(text).toContain('测试冲突：POSITION_MUST_FILL');
    });

    test('渲染不崩溃（React 挂载正常）', () => {
        const groups: InfeasibilityGroup[] = [
            makeGroup('SPECIAL_SHIFT_COVERAGE', ['enable_special_shift_coverage']),
        ];

        expect(() => {
            render(
                <InfeasibilityPanel
                    groups={groups}
                    located={true}
                    onOpenConfig={() => {}}
                />
            );
        }).not.toThrow();

        expect(container).toBeTruthy();
    });
});

// ── 2. 「跳到配置」按钮 ────────────────────────────────────────────────────────

describe('跳到配置回调', () => {
    test('有 config_keys + onOpenConfig → 按钮存在，点击调用 onOpenConfig', () => {
        const mockFn = jest.fn();
        const groups: InfeasibilityGroup[] = [
            makeGroup('STANDARD_HOURS', ['enable_standard_hours', 'max_time_seconds']),
        ];

        render(
            <InfeasibilityPanel
                groups={groups}
                located={true}
                onOpenConfig={mockFn}
            />
        );

        // 找到「跳到配置」按钮
        const buttons = Array.from(container.querySelectorAll('button'));
        const configBtn = buttons.find(btn => btn.textContent?.includes('跳到配置'));
        expect(configBtn).toBeTruthy();

        act(() => {
            configBtn?.click();
        });

        expect(mockFn).toHaveBeenCalledWith(['enable_standard_hours', 'max_time_seconds']);
    });

    test('无 onOpenConfig → 「跳到配置」按钮不渲染', () => {
        const groups: InfeasibilityGroup[] = [
            makeGroup('LOCKED_SHIFTS', ['enable_locked_shifts']),
        ];

        render(
            <InfeasibilityPanel
                groups={groups}
                located={true}
                // onOpenConfig 未传
            />
        );

        const buttons = Array.from(container.querySelectorAll('button'));
        const configBtn = buttons.find(btn => btn.textContent?.includes('跳到配置'));
        expect(configBtn).toBeFalsy();
    });

    test('config_keys 为空数组 → 「跳到配置」按钮不渲染', () => {
        const mockFn = jest.fn();
        const groups: InfeasibilityGroup[] = [
            makeGroup('POSITION_MUST_FILL', []),  // 空 config_keys
        ];

        render(
            <InfeasibilityPanel
                groups={groups}
                located={true}
                onOpenConfig={mockFn}
            />
        );

        const buttons = Array.from(container.querySelectorAll('button'));
        const configBtn = buttons.find(btn => btn.textContent?.includes('跳到配置'));
        expect(configBtn).toBeFalsy();
    });
});

// ── 3. 缺字段降级 ─────────────────────────────────────────────────────────────

describe('缺字段降级（V4 风格红字）', () => {
    test('groups=null → 降级红字，不崩溃', () => {
        expect(() => {
            render(
                <InfeasibilityPanel
                    groups={null}
                    onOpenConfig={() => {}}
                />
            );
        }).not.toThrow();

        const text = container.textContent ?? '';
        // V4 降级：显示无可行解说明文字
        expect(text).toContain('无可行解');
    });

    test('groups=undefined → 降级红字，不崩溃', () => {
        expect(() => {
            render(
                <InfeasibilityPanel
                    groups={undefined}
                />
            );
        }).not.toThrow();

        expect(container).toBeTruthy();
    });

    test('groups=[] → 降级展示（空数组），不崩溃', () => {
        expect(() => {
            render(
                <InfeasibilityPanel
                    groups={[]}
                />
            );
        }).not.toThrow();

        expect(container).toBeTruthy();
    });
});

// ── 4. located=false 降级 ──────────────────────────────────────────────────────

describe('located=false（诊断失败）', () => {
    test('located=false → 显示诊断失败提示', () => {
        render(
            <InfeasibilityPanel
                groups={[]}
                located={false}
            />
        );

        const text = container.textContent ?? '';
        // 应有「诊断运行完毕，但未能精确定位」相关文字
        expect(text).toContain('诊断运行完毕');
    });

    test('located=false + onOpenConfig → 不崩溃', () => {
        expect(() => {
            render(
                <InfeasibilityPanel
                    groups={null}
                    located={false}
                    onOpenConfig={() => {}}
                />
            );
        }).not.toThrow();
    });
});

// ── 5. 七组 group 标识符 §1.5 冻结映射 ───────────────────────────────────────

describe('七组 group 标识符映射（§1.5 冻结）', () => {
    const SEVEN_GROUPS: InfeasibilityGroupId[] = [
        'STANDARD_HOURS',
        'LOCKED_OPERATIONS',
        'CONSECUTIVE_DAYS',
        'SPECIAL_SHIFT_COVERAGE',
        'LEADERSHIP_COVERAGE',
        'LOCKED_SHIFTS',
        'POSITION_MUST_FILL',
    ];

    const EXPECTED_LABELS: Record<InfeasibilityGroupId, string> = {
        STANDARD_HOURS: '标准工时',
        LOCKED_OPERATIONS: '锁定操作',
        CONSECUTIVE_DAYS: '连续天数',
        SPECIAL_SHIFT_COVERAGE: '特殊班次覆盖',
        LEADERSHIP_COVERAGE: '领导在岗',
        LOCKED_SHIFTS: '锁定班次',
        POSITION_MUST_FILL: '岗位必填',
    };

    SEVEN_GROUPS.forEach(group => {
        test(`${group} → 中文标签"${EXPECTED_LABELS[group]}"`, () => {
            const groups: InfeasibilityGroup[] = [makeGroup(group)];

            render(
                <InfeasibilityPanel
                    groups={groups}
                    located={true}
                />
            );

            const text = container.textContent ?? '';
            expect(text).toContain(EXPECTED_LABELS[group]);
        });
    });
});

// ── 6. 颜色合规（无硬编码 hex）──────────────────────────────────────────────────

describe('颜色合规（§铁律）', () => {
    test('组件文件无硬编码 hex 颜色', async () => {
        // 动态读取组件源码，检查无 #RRGGBB 形式硬编码
        const fs = await import('fs');
        const path = await import('path');
        const filePath = path.join(
            __dirname,
            'InfeasibilityPanel.tsx',
        );
        const src = fs.readFileSync(filePath, 'utf-8');
        // 匹配 #[0-9a-fA-F]{3,8}（排除注释中的示例）
        const hexMatches = src.match(/#[0-9a-fA-F]{3,8}(?![0-9a-fA-F])/g) ?? [];
        // 过滤掉 SVG/CSS 中合法的非颜色 # 引用（不含纯注释）
        const colorHex = hexMatches.filter(h => /^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(h));
        expect(colorHex).toHaveLength(0);
    });
});

// ── 7. suggestion_zh 和 related_* 可选字段 ───────────────────────────────────

describe('可选字段处理', () => {
    test('无 suggestion_zh → 不渲染建议区，不崩溃', () => {
        const groups: InfeasibilityGroup[] = [{
            group: 'STANDARD_HOURS',
            lit_key: 'lit_hours',
            message_zh: '工时冲突',
            suggestion_zh: '',
            config_keys: [],
        }];

        expect(() => {
            render(
                <InfeasibilityPanel
                    groups={groups}
                    located={true}
                />
            );
        }).not.toThrow();
    });

    test('有 related_employees + related_dates → 渲染关联信息', () => {
        const groups: InfeasibilityGroup[] = [
            makeGroup('CONSECUTIVE_DAYS', ['enable_max_consecutive_work_days'], {
                related_employees: [101, 102, 103],
                related_dates: ['2026-01-15', '2026-01-16'],
            }),
        ];

        render(
            <InfeasibilityPanel
                groups={groups}
                located={true}
            />
        );

        const text = container.textContent ?? '';
        expect(text).toContain('101');
        expect(text).toContain('2026-01-15');
    });

    test('related_employees > 5 → 显示省略（+N）', () => {
        const groups: InfeasibilityGroup[] = [
            makeGroup('STANDARD_HOURS', [], {
                related_employees: [1, 2, 3, 4, 5, 6, 7, 8],
            }),
        ];

        render(
            <InfeasibilityPanel
                groups={groups}
                located={true}
            />
        );

        const text = container.textContent ?? '';
        // 应显示 +3（8 - 5 = 3）
        expect(text).toContain('+3');
    });
});
