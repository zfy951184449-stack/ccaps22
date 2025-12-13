import React from 'react';
import ManpowerCurveCard from './Dashboard/ManpowerCurveCard';
import WorkHoursCurveCard from './Dashboard/WorkHoursCurveCard';
import './Dashboard.css';

const Dashboard: React.FC = () => {
    return (
        <div className="dashboard-page">
            <ManpowerCurveCard />
            <WorkHoursCurveCard />
        </div>
    );
};

export default Dashboard;
