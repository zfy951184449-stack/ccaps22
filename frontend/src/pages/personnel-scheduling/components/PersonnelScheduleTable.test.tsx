import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import dayjs from 'dayjs';
import PersonnelScheduleTable from './PersonnelScheduleTable';
import { ScheduleV2GridEmployee } from '../types';

const STORAGE_KEY = 'personnel-schedule-pinned-employees:v1';

const makeEmp = (id: number, name: string): ScheduleV2GridEmployee => ({
    id,
    name,
    code: `E${id}`,
    departmentName: '生产一部',
    teamName: '团队A',
    shifts: {},
});

let container: HTMLDivElement;
let root: Root;

const renderTable = (employees: ScheduleV2GridEmployee[]) => {
    act(() => {
        root.render(
            <PersonnelScheduleTable
                currentMonth={dayjs('2026-06-01')}
                employees={employees}
                styles={{}}
                loading={false}
            />
        );
    });
};

const rowNames = () =>
    Array.from(container.querySelectorAll('tbody tr .personnel-schedule-employee-name')).map(
        el => el.textContent
    );

const pinButton = (name: string) =>
    container.querySelector(`button[aria-label="置顶 ${name}"]`) as HTMLButtonElement | null;

const unpinButton = (name: string) =>
    container.querySelector(`button[aria-label="取消置顶 ${name}"]`) as HTMLButtonElement | null;

const clearAllButton = () =>
    container.querySelector('.personnel-schedule-unpin-all') as HTMLButtonElement | null;

const click = (el: HTMLElement | null) => {
    act(() => {
        el!.click();
    });
};

beforeEach(() => {
    window.localStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
});

afterEach(() => {
    act(() => root.unmount());
    container.remove();
    window.localStorage.clear();
});

describe('PersonnelScheduleTable 置顶员工', () => {
    it('未置顶时保持原始顺序，且不显示「取消全部置顶」', () => {
        renderTable([makeEmp(1, '张三'), makeEmp(2, '李四'), makeEmp(3, '王五')]);

        expect(rowNames()).toEqual(['张三', '李四', '王五']);
        expect(clearAllButton()).toBeNull();
    });

    it('点击置顶后该员工移到最前、写入 localStorage，并 sticky 吸附在表头下方', () => {
        renderTable([makeEmp(1, '张三'), makeEmp(2, '李四'), makeEmp(3, '王五')]);

        click(pinButton('李四'));

        expect(rowNames()).toEqual(['李四', '张三', '王五']);
        expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)!)).toEqual([2]);

        const firstRow = container.querySelector('tbody tr')!;
        expect(firstRow.className).toContain('is-pinned');
        // 第一个置顶行吸附在表头(48px)正下方
        const firstTh = firstRow.querySelector('th') as HTMLElement;
        expect(firstTh.style.top).toBe('48px');

        const clearAll = clearAllButton();
        expect(clearAll).not.toBeNull();
        expect(clearAll!.textContent).toContain('1');
    });

    it('初始化时从 localStorage 读取置顶状态', () => {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify([3]));

        renderTable([makeEmp(1, '张三'), makeEmp(2, '李四'), makeEmp(3, '王五')]);

        expect(rowNames()).toEqual(['王五', '张三', '李四']);
        expect(container.querySelector('tbody tr')!.className).toContain('is-pinned');
        expect(unpinButton('王五')).not.toBeNull();
    });

    it('多人置顶时按行高依次叠放，最后一行带分隔标记；清空后恢复', () => {
        renderTable([makeEmp(1, '张三'), makeEmp(2, '李四'), makeEmp(3, '王五')]);

        click(pinButton('张三'));
        click(pinButton('王五'));

        expect(rowNames()).toEqual(['张三', '王五', '李四']);
        const rows = container.querySelectorAll('tbody tr');
        expect((rows[0].querySelector('th') as HTMLElement).style.top).toBe('48px');
        expect((rows[1].querySelector('th') as HTMLElement).style.top).toBe('82px'); // 48 + 34
        expect(rows[1].className).toContain('is-last-pinned');

        click(clearAllButton());

        expect(rowNames()).toEqual(['张三', '李四', '王五']);
        expect(window.localStorage.getItem(STORAGE_KEY)).toBe('[]');
        expect(clearAllButton()).toBeNull();
    });
});
