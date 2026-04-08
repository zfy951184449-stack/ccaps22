/**
 * Dashboard
 *
 * 调度中心主控台 — Premium Edition
 *
 * Features:
 * - 纯白玻璃态 Glassmorphism（禁止深色/流光）
 * - 原生 CSS Grid 自适应布局
 * - 全局筛选联动 (Global Filter Linkage)
 * - Framer-motion 精致微交互
 */

import React, { useState } from 'react';
import { motion, Variants } from 'framer-motion';
import dayjs, { Dayjs } from 'dayjs';
import DashboardFilterBar from './Dashboard/DashboardFilterBar';
import ManpowerCurveCard from './Dashboard/ManpowerCurveCard';
import WorkHoursCurveCard from './Dashboard/WorkHoursCurveCard';
import DailyAssignmentsPanel from './Dashboard/DailyAssignmentsPanel';
import './Dashboard.css';

const Dashboard: React.FC = () => {
    // ---- 全局筛选状态（Assessor防腐铁规：保留所有状态与联动）----
    const [selectedMonth, setSelectedMonth] = useState<Dayjs>(dayjs());
    const [orgPath, setOrgPath] = useState<number[]>([]);
    const [selectedShift, setSelectedShift] = useState<number | undefined>(undefined);

    // ---- 动画配置 ----
    const containerVariants: Variants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: { staggerChildren: 0.08, delayChildren: 0.05 }
        }
    };

    const itemVariants: Variants = {
        hidden: { opacity: 0, y: 16 },
        visible: {
            opacity: 1,
            y: 0,
            transition: { type: 'spring', stiffness: 120, damping: 18 }
        }
    };

    return (
        <motion.div
            className="dashboard-page"
            initial="hidden"
            animate="visible"
            variants={containerVariants}
        >
            {/* 1. 全局筛选条 */}
            <motion.div variants={itemVariants}>
                <DashboardFilterBar
                    selectedDate={selectedMonth}
                    onDateChange={setSelectedMonth}
                    orgPath={orgPath}
                    onOrgChange={setOrgPath}
                    selectedShift={selectedShift}
                    onShiftChange={setSelectedShift}
                />
            </motion.div>

            {/* 2. 图表双栏 — 原生 CSS Grid，替代 Antd Row/Col */}
            <div className="dashboard-charts-grid">
                <motion.div variants={itemVariants}>
                    <ManpowerCurveCard
                        date={selectedMonth}
                        orgPath={orgPath}
                        shiftId={selectedShift}
                    />
                </motion.div>

                <motion.div variants={itemVariants}>
                    <WorkHoursCurveCard
                        date={selectedMonth}
                        orgPath={orgPath}
                    />
                </motion.div>
            </div>

            {/* 3. 每日人员分配（全宽） */}
            <motion.div variants={itemVariants}>
                <DailyAssignmentsPanel date={selectedMonth} />
            </motion.div>
        </motion.div>
    );
};

export default Dashboard;

