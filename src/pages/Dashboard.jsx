import React, { useState, useRef } from 'react';
import FleetDashboard from '../components/FleetDashboard';
import TripForm from '../components/TripForm';
import TripTable from '../components/TripTable';
import MonthlyTable from '../components/MonthlyTable';
import { useTrips } from '../hooks/useTrips';
import { exportToCSV } from '../utils/exportUtils';
import { LayoutGrid, List, Truck } from 'lucide-react';
import { getLocalDate } from '../utils/dateUtils';

const Dashboard = () => {
    const {
        trips, addTrip, deleteTrip, updateTrip, stats, yearlyStats,
        currentMonth, setCurrentMonth,
        currentYear, setCurrentYear,
        getTripsForMonth, routePresets
    } = useTrips();

    const [viewMode, setViewMode] = useState('monthly');
    const [formDate, setFormDate] = useState({ value: getLocalDate(), ts: Date.now() });
    const [editingTrip, setEditingTrip] = useState(null);
    const formRef = useRef(null);

    const handleExport = () => {
        const dataToExport = viewMode === 'monthly' ? getTripsForMonth(currentMonth, currentYear) : trips;
        exportToCSV(dataToExport);
    };

    const handleMonthChange = (direction) => {
        let newMonth = currentMonth + direction;
        let newYear = currentYear;
        if (newMonth < 0) {
            newMonth = 11;
            newYear -= 1;
        } else if (newMonth > 11) {
            newMonth = 0;
            newYear += 1;
        }
        setCurrentMonth(newMonth);
        setCurrentYear(newYear);
    };

    const handleSelectDate = (dateStr) => {
        setEditingTrip(null);
        setFormDate({ value: dateStr, ts: Date.now() });
        formRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    const handleEditTrip = (trip) => {
        setEditingTrip(trip);
        setFormDate({ value: trip.date, ts: Date.now() });
        formRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    const handleUpdateTrip = (id, data) => {
        updateTrip(id, data);
        setEditingTrip(null);
    };

    return (
        <FleetDashboard stats={stats} yearlyStats={yearlyStats}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <div className="glass-card fade-in" style={{ padding: '0.35rem', display: 'flex', gap: '0.35rem' }}>
                    <button
                        className={`btn ${viewMode === 'monthly' ? 'btn-primary' : 'btn-outline'}`}
                        onClick={() => setViewMode('monthly')}
                        style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}
                    >
                        <LayoutGrid size={16} /> ตารางรอบ (20-19)
                    </button>
                    <button
                        className={`btn ${viewMode === 'activity' ? 'btn-primary' : 'btn-outline'}`}
                        onClick={() => setViewMode('activity')}
                        style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}
                    >
                        <List size={16} /> รายการทั้งหมด
                    </button>
                </div>
                <a href="/driver" className="btn btn-outline" style={{ textDecoration: 'none' }}>
                    <Truck size={16} /> ลงสายวิ่งงาน (สำหรับคนขับ)
                </a>
            </div>

            <div ref={formRef}>
                <TripForm
                    onAdd={addTrip}
                    onUpdate={handleUpdateTrip}
                    routePresets={routePresets}
                    externalDate={formDate}
                    onDateChange={(val) => setFormDate({ value: val, ts: Date.now() })}
                    editingTrip={editingTrip}
                    onCancelEdit={() => setEditingTrip(null)}
                />
            </div>

            {viewMode === 'monthly' ? (
                <MonthlyTable
                    currentMonth={currentMonth}
                    currentYear={currentYear}
                    trips={trips}
                    onMonthChange={handleMonthChange}
                    onExport={handleExport}
                    onSelectDate={handleSelectDate}
                    onEditTrip={handleEditTrip}
                    onDeleteTrip={deleteTrip}
                    cnDeductions={cnDeductions}
                    setCnDeductions={setCnDeductions}
                />
            ) : (
                <TripTable
                    trips={trips}
                    onDelete={deleteTrip}
                    onEdit={handleEditTrip}
                    onExport={handleExport}
                />
            )}
        </FleetDashboard>
    );
};

export default Dashboard;
