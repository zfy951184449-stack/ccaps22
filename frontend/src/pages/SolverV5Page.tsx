import React from 'react';
import MonthlyBatchSelector from '../components/SolverV5/MonthlyBatchSelector';
import '../components/SolverV5/SolverV5.css';

const SolverV5Page: React.FC = () => {
    return (
        <div className="solver-v5-page">
            <MonthlyBatchSelector />
        </div>
    );
};

export default SolverV5Page;
