import React from 'react';
import '../SolverV4.css';

interface SegmentedControlProps {
    options: { key: string; label: string }[];
    value: string;
    onChange: (key: string) => void;
}

const SegmentedControl: React.FC<SegmentedControlProps> = ({ options, value, onChange }) => {
    return (
        <div className="v4-segmented-control">
            {options.map((option) => (
                <button
                    key={option.key}
                    className={`v4-segment ${value === option.key ? 'active' : ''}`}
                    onClick={() => onChange(option.key)}
                >
                    {option.label}
                </button>
            ))}
        </div>
    );
};

export default SegmentedControl;
