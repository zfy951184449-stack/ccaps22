/**
 * Dashboard
 * 
 * 调度中心主控台 - 优化版
 * 
 * Features:
 * - Apple HIG 风格设计 (Glassmorphism, Fluid Motion)
 * - 全局筛选联动 (Global Filter Linkage)
 * - 响应式 Grid 布局
 */

import React, { useState } from 'react';
import { motion, Variants } from 'framer-motion';
import dayjs, { Dayjs } from 'dayjs';
import { Row, Col } from 'antd';
import DashboardFilterBar from './Dashboard/DashboardFilterBar';
import ManpowerCurveCard from './Dashboard/ManpowerCurveCard';
import WorkHoursCurveCard from './Dashboard/WorkHoursCurveCard';
import DailyAssignmentsPanel from './Dashboard/DailyAssignmentsPanel';
import './Dashboard.css';

const Dashboard: React.FC = () => {
    // Globe Filter State
    const [selectedMonth, setSelectedMonth] = useState<Dayjs>(dayjs());
    const [orgPath, setOrgPath] = useState<number[]>([]);
    const [selectedShift, setSelectedShift] = useState<number | undefined>(undefined);

    // Animation variants
    const containerVariants: Variants = {
        hidden: { opacity: 0 },
        visible: {
            opacity: 1,
            transition: {
                staggerChildren: 0.1,
                delayChildren: 0.1
            }
        }
    };

    const itemVariants: Variants = {
        hidden: { opacity: 0, y: 20 },
        visible: {
            opacity: 1,
            y: 0,
            transition: {
                type: 'spring',
                stiffness: 100,
                damping: 15
            }
        }
    };

    return (
        <motion.div
            className="dashboard-page"
            initial="hidden"
            animate="visible"
            variants={containerVariants}
        >
            {/* 1. Global Filter Bar */}
            <motion.div variants={itemVariants} style={{ marginBottom: 24 }}>
                <DashboardFilterBar
                    selectedDate={selectedMonth}
                    onDateChange={setSelectedMonth}
                    orgPath={orgPath}
                    onOrgChange={setOrgPath}
                    selectedShift={selectedShift}
                    onShiftChange={setSelectedShift}
                />
            </motion.div>

            {/* 2. Main Charts Grid */}
            <Row gutter={[24, 24]}>
                {/* Manpower Curve (Top Left) */}
                <Col xs={24} lg={12}>
                    <motion.div variants={itemVariants} style={{ height: '100%' }}>
                        <ManpowerCurveCard
                            date={selectedMonth}
                            orgPath={orgPath}
                            shiftId={selectedShift}
                        />
                    </motion.div>
                </Col>

                {/* Work Hours Curve (Top Right) */}
                <Col xs={24} lg={12}>
                    <motion.div variants={itemVariants} style={{ height: '100%' }}>
                        <WorkHoursCurveCard
                            date={selectedMonth}
                            orgPath={orgPath}
                        />
                    </motion.div>
                </Col>

                {/* 3. Daily Assignments (Bottom Full Width) */}
                <Col span={24}>
                    <motion.div variants={itemVariants}>
                        <DailyAssignmentsPanel
                            date={selectedMonth}
                        />
                    </motion.div>
                </Col>
            </Row>
        </motion.div>
    );
};

export default Dashboard;
