import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../utils/supabaseClient';
import { getLocalDate } from '../utils/dateUtils';

export const useTrips = () => {
    const [trips, setTrips] = useState([]);
    const [routePresets, setRoutePresets] = useState({});
    const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
    const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
    const [loading, setLoading] = useState(true);
    const [isSupabaseReady, setIsSupabaseReady] = useState(false);

    useEffect(() => {
        const init = async () => {
            try {
                // Test connection
                const { error } = await supabase.from('trips').select('id').limit(1);

                if (error) {
                    console.warn('Supabase connection warning:', error);
                    // If table doesn't exist or connection failed, we might fall back, 
                    // but for now let's try to proceed if it's just an empty table or soft error
                    if (error.code === 'PGRST116') { /* empty result is fine */ }
                    else throw error;
                }

                setIsSupabaseReady(true);
                await Promise.all([fetchTrips(), fetchPresets()]);

                const tripsSubscription = supabase
                    .channel('trips_channel')
                    .on('postgres_changes', { event: '*', table: 'trips' }, () => {
                        fetchTrips();
                    })
                    .subscribe();

                setLoading(false);
                return () => supabase.removeChannel(tripsSubscription);
            } catch (err) {
                console.error('Supabase init failed:', err);
                loadLocalData();
            }
        };

        init();
    }, []);

    const loadLocalData = () => {
        const savedTrips = localStorage.getItem('fleet_management_trips');
        const savedPresets = localStorage.getItem('fleet_route_presets');
        const tripsArray = savedTrips ? JSON.parse(savedTrips) : [];
        setTrips(tripsArray.map(normalizeTrip));
        setRoutePresets(savedPresets ? JSON.parse(savedPresets) : {});
        setIsSupabaseReady(false);
        setLoading(false);
    };

    const normalizeTrip = (t) => {
        // DRIVE NAME: Trim and collapse multiple spaces into one
        const driverName = (t.driverName || t.driver_name || t.driver || t.staff || t.name || '')
            .trim()
            .replace(/\s+/g, ' ');

        // Standardize ALL financial fields
        const price = parseFloat(t.price) || 0;
        const fuel = parseFloat(t.fuel) || 0;
        const wage = parseFloat(t.wage) || 0;
        const maintenance = parseFloat(t.maintenance) || 0;
        const basket = parseFloat(t.basket) || 0;

        // Advance (ยอดเบิก): Use any variant but consolidate to staffShare
        const staffShare = parseFloat(t.staffShare) || parseFloat(t.advance) || parseFloat(t.staff_advance) || 0;

        // Basket Share (ส่วนแบ่งตะกร้า): Priority to basketShare, then variants
        const basketShare = parseFloat(t.basketShare) || parseFloat(t.basket_share) || 0;

        // Profit calculation (Revenue - Expenses)
        // Revenue = price (trip fee) + basket (basket revenue)
        // Expenses = fuel + wage + maintenance + basketShare (what we pay driver for baskets)
        const profit = (price + basket) - (fuel + wage + maintenance + basketShare);

        return {
            id: t.id,
            date: (() => {
                if (!t.date) return getLocalDate();
                if (typeof t.date === 'string') return t.date.split('T')[0];
                const d = new Date(t.date);
                return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
            })(),
            driverName,
            price,
            fuel,
            wage,
            maintenance,
            basket,
            basketCount: parseInt(t.basket_count || t.basketCount || 0),
            basketShare,
            staffShare,
            profit,
            // Keep original source just in case, but code should use normalized fields
            _original: t
        };
    };

    const fetchTrips = async () => {
        try {
            const { data, error } = await supabase
                .from('trips')
                .select('*')
                .order('date', { ascending: false });

            if (!error && data) {
                setTrips(data.map(normalizeTrip));
            }
        } catch (err) {
            console.error('Fetch error:', err);
        }
    };

    const fetchPresets = async () => {
        try {
            const { data, error } = await supabase.from('route_presets').select('*');
            if (!error && data) {
                const presets = {};
                data.forEach(p => {
                    presets[p.route] = { price: p.price, wage: p.wage };
                });
                setRoutePresets(presets);
            }
        } catch (err) {
            console.error('Presets error:', err);
        }
    };

    const [cnDeductions, setCnDeductions] = useState(() => {
        const saved = localStorage.getItem('pattatha_cn_deductions');
        return saved ? JSON.parse(saved) : {};
    });

    useEffect(() => {
        localStorage.setItem('pattatha_cn_deductions', JSON.stringify(cnDeductions));
    }, [cnDeductions]);

    const calculateStats = (tripsToProcess, currentCnDeductions = {}) => {
        const stats = tripsToProcess.reduce((acc, t) => {
            acc.totalTrips += 1;
            acc.totalRevenue += t.price + t.basket;
            acc.totalWages += t.wage;
            acc.totalFuel += t.fuel;
            acc.totalMaintenance += t.maintenance;
            acc.totalBasket += t.basketShare;
            acc.totalStaffAdvance += t.staffShare;
            acc.totalProfit += t.profit;
            return acc;
        }, {
            totalTrips: 0, totalRevenue: 0, totalWages: 0, totalFuel: 0,
            totalMaintenance: 0, totalBasket: 0, totalStaffAdvance: 0, totalProfit: 0, totalRemainingPay: 0
        });

        // Calculate totalRemainingPay correctly per driver with housing allowance and CN deductions
        const drivers = {};
        tripsToProcess.forEach(t => {
            const name = t.driverName || 'ไม่ระบุชื่อ';
            if (!drivers[name]) {
                drivers[name] = { wage: 0, basketShare: 0, advance: 0 };
            }
            drivers[name].wage += t.wage;
            drivers[name].basketShare += t.basketShare;
            drivers[name].advance += t.staffShare;
        });

        stats.totalRemainingPay = Object.entries(drivers).reduce((sum, [name, d]) => {
            const cn = parseFloat(currentCnDeductions[name]) || 0;
            return sum + (d.wage + d.basketShare + 1000) - d.advance - cn;
        }, 0);

        return stats;
    };

    const stats = useMemo(() => {
        const startDate = new Date(currentYear, currentMonth - 1, 20);
        const endDate = new Date(currentYear, currentMonth, 19);

        const currentMonthTrips = trips.filter(t => {
            if (!t.date) return false;
            const [y, m, d] = t.date.split('-').map(Number);
            const checkDate = new Date(y, m - 1, d);
            return checkDate >= startDate && checkDate <= endDate;
        });
        return calculateStats(currentMonthTrips, cnDeductions);
    }, [trips, currentMonth, currentYear, cnDeductions]);

    const yearlyStats = useMemo(() => {
        const currentYearTrips = trips.filter(t => {
            const [y] = t.date.split('-').map(Number);
            return y === currentYear;
        });
        return calculateStats(currentYearTrips, {}); // CN is monthly, maybe ignore for yearly for now
    }, [trips, currentYear]);

    const calculateProfit = (price, fuel, wage, basket, staffShare, maintenance, basketShare) => {
        return (parseFloat(price) || 0) + (parseFloat(basket) || 0) - (parseFloat(fuel) || 0) - (parseFloat(wage) || 0) - (parseFloat(maintenance) || 0) - (parseFloat(basketShare) || 0);
    };

    const addTrip = async (trip) => {
        const price = parseFloat(trip.price) || 0;
        const fuel = parseFloat(trip.fuel) || 0;
        const wage = parseFloat(trip.wage) || 0;
        const basket = parseFloat(trip.basket) || 0;
        const staffShare = parseFloat(trip.staffShare) || 0; // ยอดเบิก (Advance)
        const basketShare = parseFloat(trip.basketShare) || 0; // ส่วนแบ่งตะกร้า
        const maintenance = parseFloat(trip.maintenance) || 0;
        const basketCount = parseInt(trip.basketCount) || 0;
        const profit = calculateProfit(price, fuel, wage, basket, staffShare, maintenance, basketShare);

        const baseData = {
            date: trip.date || getLocalDate(),
            route: trip.route,
            price, fuel, wage, profit
        };

        if (isSupabaseReady) {
            // We search for a payload that actually works without throwing "column not found"
            const attempts = [
                // 1. Full attempt with standardized columns
                { ...baseData, driver_name: trip.driverName || '', basket, maintenance, staff_share: basketShare, advance: staffShare, basket_count: basketCount },
                // 2. Try camelCase driverName
                { ...baseData, driverName: trip.driverName || '', basket, maintenance, staff_share: basketShare, advance: staffShare, basket_count: basketCount },
                // 3. Try 'name'
                { ...baseData, name: trip.driverName || '', basket, maintenance, staff_share: basketShare, advance: staffShare },
                // 4. Try 'driver'
                { ...baseData, driver: trip.driverName || '', basket, maintenance, staff_share: basketShare, advance: staffShare },
                // 5. Minimal Financial
                { ...baseData, basket, maintenance, staff_share: basketShare, advance: staffShare },
                // 6. Bare Minimal
                { ...baseData }
            ];

            let success = false;
            for (const payload of attempts) {
                try {
                    const { data, error } = await supabase.from('trips').insert([payload]).select();
                    if (!error && data?.[0]) {
                        setTrips(prev => [normalizeTrip(data[0]), ...prev]);
                        success = true;
                        break;
                    }
                } catch (err) { }
            }
            if (!success) alert('ไม่สามารถบันทึกได้ กรุณารีเฟรชหน้าแล้วลองใหม่');
        } else {
            const localTrip = normalizeTrip({ ...baseData, id: Date.now(), driverName: trip.driverName, basket, maintenance, staffShare, basketShare, basketCount });
            setTrips(prev => [localTrip, ...prev]);
        }
    };

    const deleteTrip = async (id) => {
        if (isSupabaseReady) {
            await supabase.from('trips').delete().eq('id', id);
        }
        setTrips(prev => prev.filter(t => t.id !== id));
    };

    const updateTrip = async (id, updatedFields) => {
        const normalized = normalizeTrip(updatedFields);
        const profit = calculateProfit(normalized.price, normalized.fuel, normalized.wage, normalized.basket, normalized.staffShare, normalized.maintenance, normalized.basketShare);

        const baseUpdate = {
            date: normalized.date, route: normalized.route,
            price: normalized.price, fuel: normalized.fuel, wage: normalized.wage,
            profit
        };

        if (isSupabaseReady) {
            const attempts = [
                { ...baseUpdate, driverName: normalized.driverName, basket: normalized.basket, maintenance: normalized.maintenance, staff_share: normalized.basketShare, advance: normalized.staffShare, basket_share: normalized.basketShare, basket_count: normalized.basketCount },
                { ...baseUpdate, driver_name: normalized.driverName, basket: normalized.basket, maintenance: normalized.maintenance, staff_share: normalized.basketShare, advance: normalized.staffShare, basket_share: normalized.basketShare, basket_count: normalized.basketCount },
                { ...baseUpdate, basket: normalized.basket, maintenance: normalized.maintenance, staff_share: normalized.basketShare, advance: normalized.staffShare },
                { ...baseUpdate }
            ];

            for (const payload of attempts) {
                const { error } = await supabase.from('trips').update(payload).eq('id', id);
                if (!error) break;
            }
        }
        setTrips(prev => prev.map(t => t.id === id ? { ...normalized, id, profit } : t));
    };

    const getTripsForMonth = (month, year) => {
        const startDate = new Date(year, month - 1, 20);
        const endDate = new Date(year, month, 19);
        return trips.filter(t => {
            if (!t.date) return false;
            const [y, m, d] = t.date.split('-').map(Number);
            const checkDate = new Date(y, m - 1, d);
            return checkDate >= startDate && checkDate <= endDate;
        });
    };

    const deletePreset = async (route) => {
        if (isSupabaseReady) await supabase.from('route_presets').delete().eq('route', route);
        const updated = { ...routePresets };
        delete updated[route];
        setRoutePresets(updated);
    };

    return {
        trips, routePresets, loading, currentMonth, currentYear,
        setCurrentMonth, setCurrentYear, fetchTrips, addTrip, deleteTrip, updateTrip, deletePreset,
        stats, yearlyStats, getTripsForMonth, cnDeductions, setCnDeductions
    };
};
