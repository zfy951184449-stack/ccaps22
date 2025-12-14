import React from 'react';
import ManpowerCurveCard from './Dashboard/ManpowerCurveCard';
import WorkHoursCurveCard from './Dashboard/WorkHoursCurveCard';
import DailyAssignmentsPanel from './Dashboard/DailyAssignmentsPanel';
import './Dashboard.css';

const Dashboard: React.FC = () => {
    return (
        <div className="dashboard-page">
            <ManpowerCurveCard />
            <WorkHoursCurveCard />
            <DailyAssignmentsPanel />
        </div>
    );
};

export default Dashboard;
