
import React from 'react';
import { CheckCircle, Navigation, User, Clock } from 'lucide-react';
import './TransportTimeline.css';

const TransportTimeline = ({ assignment }) => {
    if (!assignment) return null;

    const steps = [
        {
            key: 'accepted',
            label: 'Accepted',
            icon: CheckCircle,
            date: assignment.accepted_at,
            isActive: assignment.current_status === 'accepted'
        },
        {
            key: 'en_route_pickup',
            label: 'En Route',
            icon: Navigation,
            date: assignment.pickup_started_at,
            isActive: assignment.current_status === 'en_route_pickup'
        },
        {
            key: 'patient_loaded',
            label: 'Patient Loaded',
            icon: User,
            date: assignment.patient_loaded_at,
            isActive: assignment.current_status === 'patient_loaded'
        },
        {
            key: 'en_route_hospital',
            label: 'To Hospital',
            icon: Navigation,
            date: assignment.delivery_started_at,
            isActive: assignment.current_status === 'en_route_hospital'
        },
        {
            key: 'delivered',
            label: 'Delivered',
            icon: CheckCircle,
            date: assignment.completed_at,
            isActive: assignment.current_status === 'delivered'
        }
    ];

    // Calculate progress for progress bar
    const getCurrentStepIndex = () => {
        if (assignment.current_status === 'cancelled') return -1;
        const statusMap = {
            'accepted': 0,
            'en_route_pickup': 1,
            'patient_loaded': 2,
            'en_route_hospital': 3,
            'delivered': 4
        };
        return statusMap[assignment.current_status] ?? -1;
    };

    const currentStepIndex = getCurrentStepIndex();

    return (
        <div className="transport-timeline-container">
            <div className="transport-timeline">
                {steps.map((step, index) => {
                    // Step is completed if it has a date OR if current step is ahead of it
                    const isCompleted = step.date || (currentStepIndex > index);
                    const isCurrent = index === currentStepIndex;
                    const Icon = step.icon;

                    return (
                        <div key={step.key} className={`timeline-step ${isCompleted ? 'completed' : ''} ${isCurrent ? 'active' : ''}`}>
                            <div className="step-connector">
                                {index !== 0 && <div className="line"></div>}
                                <div className="step-indicator">
                                    <Icon size={16} />
                                </div>
                                {index !== steps.length - 1 && <div className="line"></div>}
                            </div>
                            <div className="step-content">
                                <span className="step-label">{step.label}</span>
                                {step.date && (
                                    <span className="step-time">
                                        {new Date(step.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default TransportTimeline;
