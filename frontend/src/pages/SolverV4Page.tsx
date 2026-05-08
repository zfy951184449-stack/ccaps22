import React from 'react';
import MonthlyBatchSelector from '../components/SolverV4/MonthlyBatchSelector';
import '../components/SolverV4/SolverV4.css';

const SolverV4Page: React.FC = () => {
    return (
        <div className="solver-v4-page">
            <MonthlyBatchSelector />
        </div>
    );
};

export default SolverV4Page;
