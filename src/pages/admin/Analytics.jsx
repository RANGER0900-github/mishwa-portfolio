import { useState, useEffect, useMemo, useCallback, useDeferredValue, useRef } from 'react';
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip as RechartsTooltip,
    ResponsiveContainer,
    BarChart,
    Bar,
    Cell
} from 'recharts';
import {
    Laptop,
    Smartphone,
    RefreshCw,
    Copy,
    Check,
    Shield,
    ShieldOff,
    Wifi,
    Radio,
    Clock,
    Users,
    Globe,
    TrendingUp,
    Film,
    X,
    MapPin,
    Download,
    FileJson,
    FileSpreadsheet,
    ZoomIn,
    ZoomOut,
    RotateCcw,
    ChevronLeft,
    ChevronRight,
    Search,
    Sparkles,
    CalendarDays,
    Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ComposableMap, Geographies, Geography, Marker, ZoomableGroup } from 'react-simple-maps';
import { useContent } from '../../context/ContentContext';
import { adminFetch } from '../../utils/adminApi';

const geoUrl = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';
const COLORS = ['#64ffda', '#0070f3', '#f59e0b', '#ef4444', '#8b5cf6', '#10b981'];
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_LABELS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const pad = (value) => String(value).padStart(2, '0');

const parseDateTimeValue = (value) => {
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    return parsed;
};

const toDateKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const toTimeKey = (date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`;
const toDateTimeLocal = (date) => `${toDateKey(date)}T${toTimeKey(date)}`;
const getDayStamp = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
const isSameCalendarDay = (left, right) => getDayStamp(left) === getDayStamp(right);

const getMonthGrid = (viewDate) => {
    const firstDayOfMonth = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
    const offset = firstDayOfMonth.getDay();
    const gridStart = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1 - offset);

    return Array.from({ length: 42 }, (_, index) => {
        const date = new Date(gridStart);
        date.setDate(gridStart.getDate() + index);
        return {
            date,
            key: toDateKey(date),
            inCurrentMonth: date.getMonth() === viewDate.getMonth()
        };
    });
};

const formatPickerLabel = (value) => {
    const parsed = parseDateTimeValue(value);
    if (!parsed) return 'Select date & time';
    return parsed.toLocaleString([], {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
};

const formatDuration = (seconds) => {
    const safeSeconds = Math.max(0, Number(seconds) || 0);
    return `${Math.floor(safeSeconds / 60)}m ${safeSeconds % 60}s`;
};

const getVisitorIdentity = (visitor) => {
    const isBot = Boolean(visitor?.isBot ?? visitor?.isCrawler);
    const emoji = visitor?.visitorEmoji || (isBot ? '🤖' : '🧑');
    const label = visitor?.visitorKind || (isBot ? 'bot' : 'human');
    return {
        isBot,
        emoji,
        label: String(label).toUpperCase(),
        className: isBot
            ? 'border-amber-400/40 text-amber-200 bg-amber-500/10'
            : 'border-emerald-400/40 text-emerald-200 bg-emerald-500/10'
    };
};

const Analytics = () => {
    const { content } = useContent();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [selectedVisitor, setSelectedVisitor] = useState(null);
    const [showExportModal, setShowExportModal] = useState(false);
    const [mapZoom, setMapZoom] = useState(1);
    const [mapCenter, setMapCenter] = useState([0, 20]);
    const [copiedVisitorKey, setCopiedVisitorKey] = useState(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(window.innerWidth < 768 ? 20 : 50);
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');
    const [activeDatePicker, setActiveDatePicker] = useState(null);
    const [pickerMonth, setPickerMonth] = useState(new Date());
    const [searchInput, setSearchInput] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [isRefreshing, setIsRefreshing] = useState(false);
    const isMobile = pageSize === 20;
    const datePickerRef = useRef(null);
    const [mobileSections, setMobileSections] = useState({
        charts: true,
        map: false,
        network: false,
        visitors: true
    });

    const toggleSection = (key) => {
        setMobileSections((prev) => ({ ...prev, [key]: !prev[key] }));
    };

    const getVisitorKey = (visitor, index, surface = 'table') => (
        `${surface}:${visitor.id || 'no-id'}:${visitor.timestamp || 'no-time'}:${visitor.ip || 'no-ip'}:${index}`
    );

    const fetchData = useCallback(async ({ silent = false } = {}) => {
        if (!silent) setIsRefreshing(true);
        try {
            const query = new URLSearchParams({
                page: String(currentPage),
                limit: String(pageSize)
            });
            if (fromDate) query.set('from', fromDate);
            if (toDate) query.set('to', toDate);
            if (searchQuery) query.set('q', searchQuery);
            const res = await adminFetch(`/api/analytics?${query.toString()}`);
            const apiData = await res.json();
            setData(apiData);
        } catch (err) {
            console.error('Analytics Error:', err);
        } finally {
            setLoading(false);
            setIsRefreshing(false);
        }
    }, [currentPage, pageSize, fromDate, toDate, searchQuery]);

    useEffect(() => {
        fetchData({ silent: true });
        const interval = setInterval(() => fetchData({ silent: true }), 30000);
        return () => clearInterval(interval);
    }, [fetchData]);

    useEffect(() => {
        const updatePageSize = () => setPageSize(window.innerWidth < 768 ? 20 : 50);
        window.addEventListener('resize', updatePageSize);
        return () => window.removeEventListener('resize', updatePageSize);
    }, []);

    useEffect(() => {
        setCurrentPage(1);
    }, [fromDate, toDate, searchQuery]);

    useEffect(() => {
        const timer = setTimeout(() => {
            setSearchQuery(searchInput.trim());
        }, 280);
        return () => clearTimeout(timer);
    }, [searchInput]);

    useEffect(() => {
        if (!activeDatePicker) return undefined;

        const handleOutsideClick = (event) => {
            if (datePickerRef.current && !datePickerRef.current.contains(event.target)) {
                setActiveDatePicker(null);
            }
        };
        const handleEscape = (event) => {
            if (event.key === 'Escape') {
                setActiveDatePicker(null);
            }
        };

        document.addEventListener('mousedown', handleOutsideClick);
        document.addEventListener('keydown', handleEscape);
        return () => {
            document.removeEventListener('mousedown', handleOutsideClick);
            document.removeEventListener('keydown', handleEscape);
        };
    }, [activeDatePicker]);

    const applyRangeDateTime = useCallback((target, nextDate) => {
        if (!(nextDate instanceof Date) || Number.isNaN(nextDate.getTime())) return;
        const next = new Date(nextDate.getTime());

        if (target === 'from') {
            const currentTo = parseDateTimeValue(toDate);
            if (currentTo && next > currentTo) {
                setToDate(toDateTimeLocal(next));
            }
            setFromDate(toDateTimeLocal(next));
            return;
        }

        const currentFrom = parseDateTimeValue(fromDate);
        if (currentFrom && next < currentFrom) {
            setFromDate(toDateTimeLocal(next));
        }
        setToDate(toDateTimeLocal(next));
    }, [fromDate, toDate]);

    const openDatePicker = useCallback((target) => {
        const selected = parseDateTimeValue(target === 'from' ? fromDate : toDate) || new Date();
        setPickerMonth(new Date(selected.getFullYear(), selected.getMonth(), 1));
        setActiveDatePicker((prev) => (prev === target ? null : target));
    }, [fromDate, toDate]);

    const updateActiveDay = useCallback((nextDay) => {
        if (!activeDatePicker) return;
        const current = parseDateTimeValue(activeDatePicker === 'from' ? fromDate : toDate) || new Date();
        const next = new Date(
            nextDay.getFullYear(),
            nextDay.getMonth(),
            nextDay.getDate(),
            current.getHours(),
            current.getMinutes(),
            0,
            0
        );
        applyRangeDateTime(activeDatePicker, next);
    }, [activeDatePicker, applyRangeDateTime, fromDate, toDate]);

    const updateActiveTime = useCallback((timeValue) => {
        if (!activeDatePicker || !timeValue) return;
        const [hours, minutes] = String(timeValue).split(':').map((value) => Number(value));
        if (Number.isNaN(hours) || Number.isNaN(minutes)) return;
        const current = parseDateTimeValue(activeDatePicker === 'from' ? fromDate : toDate) || new Date();
        const next = new Date(current);
        next.setHours(hours, minutes, 0, 0);
        applyRangeDateTime(activeDatePicker, next);
    }, [activeDatePicker, applyRangeDateTime, fromDate, toDate]);

    const applyPresetRange = useCallback((preset) => {
        const now = new Date();
        let start = new Date(now);
        let end = new Date(now);

        if (preset === 'today') {
            start.setHours(0, 0, 0, 0);
        } else if (preset === '24h') {
            start = new Date(now.getTime() - (24 * 60 * 60 * 1000));
        } else if (preset === '7d') {
            start = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000));
        } else if (preset === 'month') {
            start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
            end = new Date(now);
        }

        setFromDate(toDateTimeLocal(start));
        setToDate(toDateTimeLocal(end));
        setPickerMonth(new Date(start.getFullYear(), start.getMonth(), 1));
        setActiveDatePicker(null);
    }, []);

    const copyToClipboard = async (visitorKey, text) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopiedVisitorKey(visitorKey);
            setTimeout(() => setCopiedVisitorKey((prev) => (prev === visitorKey ? null : prev)), 1200);
        } catch (err) {
            console.error('Copy failed:', err);
        }
    };

    const downloadFile = (fileContent, fileName, contentType) => {
        const a = document.createElement('a');
        const file = new Blob([fileContent], { type: contentType });
        a.href = URL.createObjectURL(file);
        a.download = fileName;
        a.click();
    };

    const exportToCSV = () => {
        const visits = data?.visits || [];
        const headers = ['Timestamp', 'IP Address', 'Country', 'City', 'Device', 'Connection', 'Duration (s)', 'Page'];
        const rows = visits.map((v) => [
            new Date(v.timestamp).toLocaleString(),
            v.ip || '',
            v.country || '',
            v.city || '',
            v.deviceType || '',
            v.connectionType || '',
            Number(v.sessionDuration) || 0,
            v.pageViewed || ''
        ]);

        const csvContent = [headers, ...rows].map((row) => row.join(',')).join('\n');
        downloadFile(csvContent, `analytics_page_${currentPage}.csv`, 'text/csv');
        setShowExportModal(false);
    };

    const exportToJSON = () => {
        const exportData = {
            exportedAt: new Date().toISOString(),
            page: currentPage,
            limit: pageSize,
            stats: data?.stats || {},
            visits: data?.visits || []
        };
        downloadFile(JSON.stringify(exportData, null, 2), `analytics_page_${currentPage}.json`, 'application/json');
        setShowExportModal(false);
    };

    const visits = data?.visits || [];
    const deferredVisits = useDeferredValue(visits);
    const stats = data?.stats || {};
    const reelClicks = data?.reelClicks || {};
    const ipSummary = data?.ipSummary || null;
    const searchPending = searchInput.trim() !== searchQuery;
    const pagination = data?.pagination || { page: currentPage, limit: pageSize, total: visits.length };
    const totalPages = Math.max(1, Math.ceil((pagination.total || 0) / (pagination.limit || 1)));
    const animateRows = deferredVisits.length <= 24;

    const chartData = useMemo(() => {
        if (Array.isArray(stats.daily_visits) && stats.daily_visits.length > 0) {
            return stats.daily_visits.map((row) => ({
                name: new Date(row.date).toLocaleDateString('en', { weekday: 'short' }),
                visits: row.count
            }));
        }

        const days = [];
        for (let i = 6; i >= 0; i -= 1) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const key = d.toISOString().slice(0, 10);
            days.push({
                name: d.toLocaleDateString('en', { weekday: 'short' }),
                visits: visits.filter((v) => v.timestamp?.startsWith(key)).length
            });
        }
        return days;
    }, [stats.daily_visits, visits]);

    const reelData = useMemo(() => (
        Object.entries(reelClicks)
            .map(([id, clicks]) => {
                const project = (content?.projects || []).find((p) => p.id === Number(id));
                return {
                    name: project ? project.title : `Reel ${id}`,
                    clicks
                };
            })
            .sort((a, b) => b.clicks - a.clicks)
            .slice(0, 5)
    ), [reelClicks, content?.projects]);

    const vpnCount = stats.vpn_count ?? visits.filter((v) => v.isVpn).length;
    const regularCount = Math.max(0, (stats.total_visitors ?? visits.length) - vpnCount);
    const wifiCount = stats.connection?.wifi_ethernet ?? visits.filter((v) => v.connectionType === 'wifi' || v.connectionType === 'ethernet').length;
    const cellularCount = stats.connection?.cellular ?? visits.filter((v) => v.connectionType === 'cellular').length;
    const avgSession = stats.average_session_seconds ?? 0;
    const fromParsed = parseDateTimeValue(fromDate);
    const toParsed = parseDateTimeValue(toDate);
    const activeParsed = parseDateTimeValue(activeDatePicker === 'from' ? fromDate : toDate);
    const activeTimeValue = activeParsed ? toTimeKey(activeParsed) : '12:00';
    const pickerDays = useMemo(() => getMonthGrid(pickerMonth), [pickerMonth]);
    const rangeStart = fromParsed && toParsed ? Math.min(getDayStamp(fromParsed), getDayStamp(toParsed)) : null;
    const rangeEnd = fromParsed && toParsed ? Math.max(getDayStamp(fromParsed), getDayStamp(toParsed)) : null;
    const selectedIdentity = selectedVisitor ? getVisitorIdentity(selectedVisitor) : null;
    const selectedPageHistory = selectedVisitor
        ? Array.from(new Set([...(selectedVisitor.pageHistory || []), selectedVisitor.pageViewed || '/'])).filter(Boolean)
        : [];

    const updateZoom = (delta) => {
        setMapZoom((prev) => clamp(Number((prev + delta).toFixed(2)), 1, 8));
    };

    const resetMap = () => {
        setMapZoom(1);
        setMapCenter([0, 20]);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="flex items-center gap-3 text-secondary">
                    <RefreshCw className="animate-spin" />
                    <span>Analyzing real-time data...</span>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 sm:space-y-8 pb-12">
            <header className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                <div>
                    <h1 className="text-3xl sm:text-4xl md:text-5xl font-display font-black text-white mb-2">
                        Analytics<span className="text-secondary">.</span>
                    </h1>
                    <div className="flex flex-wrap items-center gap-3">
                        <p className="text-gray-400 flex items-center gap-2">
                            <span className="w-2 h-2 bg-secondary rounded-full animate-pulse"></span>
                            {stats.total_visitors ?? visits.length} sessions recorded
                        </p>
                        <p className="text-xs text-gray-500 uppercase tracking-wider">
                            Avg Session: <span className="text-white">{formatDuration(avgSession)}</span>
                        </p>
                    </div>
                </div>
                <div className="flex flex-col gap-3 w-full lg:w-auto">
                    <div className="relative w-full lg:w-[460px]">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                        <input
                            type="text"
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                            placeholder="Search IP, page, city, ISP, VPN, session, date/time..."
                            className="w-full pl-10 pr-20 py-3 bg-black/20 border border-white/10 rounded-xl text-gray-200 text-sm focus:outline-none focus:border-secondary/60 transition-all"
                            aria-label="Search analytics"
                        />
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                            {(searchPending || isRefreshing) && <Loader2 size={14} className="text-secondary animate-spin" />}
                            {!searchPending && !isRefreshing && <Sparkles size={14} className="text-secondary/70" />}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:flex sm:flex-wrap gap-3 w-full sm:w-auto">
                        <div ref={datePickerRef} className="relative w-full sm:w-[430px]">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <motion.button
                                    type="button"
                                    onClick={() => openDatePicker('from')}
                                    whileHover={{ y: -1, scale: 1.01 }}
                                    whileTap={{ scale: 0.99 }}
                                    className={`group relative px-3 py-2 text-left border rounded-xl transition-all overflow-hidden ${activeDatePicker === 'from' ? 'border-secondary/60 bg-secondary/10 shadow-[0_0_20px_rgba(0,243,255,0.20)]' : 'border-white/10 bg-black/20 hover:border-secondary/40 hover:bg-secondary/5'}`}
                                >
                                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-r from-secondary/10 via-transparent to-primary/10"></div>
                                    <span className="relative block text-[10px] uppercase tracking-[0.18em] text-gray-500 mb-1">Start Date</span>
                                    <span className="relative flex items-center gap-2 text-sm text-gray-200">
                                        <CalendarDays size={14} className="text-secondary/80" />
                                        {formatPickerLabel(fromDate)}
                                    </span>
                                </motion.button>
                                <motion.button
                                    type="button"
                                    onClick={() => openDatePicker('to')}
                                    whileHover={{ y: -1, scale: 1.01 }}
                                    whileTap={{ scale: 0.99 }}
                                    className={`group relative px-3 py-2 text-left border rounded-xl transition-all overflow-hidden ${activeDatePicker === 'to' ? 'border-secondary/60 bg-secondary/10 shadow-[0_0_20px_rgba(0,243,255,0.20)]' : 'border-white/10 bg-black/20 hover:border-secondary/40 hover:bg-secondary/5'}`}
                                >
                                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-r from-secondary/10 via-transparent to-primary/10"></div>
                                    <span className="relative block text-[10px] uppercase tracking-[0.18em] text-gray-500 mb-1">End Date</span>
                                    <span className="relative flex items-center gap-2 text-sm text-gray-200">
                                        <CalendarDays size={14} className="text-secondary/80" />
                                        {formatPickerLabel(toDate)}
                                    </span>
                                </motion.button>
                            </div>

                            <AnimatePresence>
                                {activeDatePicker && (
                                    <motion.div
                                        key="date-range-picker"
                                        initial={{ opacity: 0, y: 14, scale: 0.98 }}
                                        animate={{ opacity: 1, y: 0, scale: 1 }}
                                        exit={{ opacity: 0, y: 10, scale: 0.98 }}
                                        transition={{ duration: 0.24, ease: 'easeOut' }}
                                        data-lenis-prevent
                                        className={isMobile
                                            ? 'fixed z-[90] left-3 right-3 bottom-[calc(env(safe-area-inset-bottom,0)+5.25rem)] max-h-[68vh] overflow-y-auto rounded-2xl border border-secondary/20 bg-[#081629]/95 backdrop-blur-2xl shadow-[0_24px_70px_rgba(0,0,0,0.45)] p-4'
                                            : 'absolute z-30 mt-3 left-0 right-0 sm:right-auto sm:w-[560px] rounded-2xl border border-secondary/20 bg-[#081629]/95 backdrop-blur-2xl shadow-[0_24px_70px_rgba(0,0,0,0.45)] p-4 overflow-hidden'}
                                    >
                                        <div className="absolute -top-16 -right-10 h-32 w-32 rounded-full bg-secondary/15 blur-3xl pointer-events-none"></div>
                                        <div className="absolute -bottom-16 -left-8 h-28 w-28 rounded-full bg-primary/15 blur-3xl pointer-events-none"></div>

                                        <div className="relative flex flex-wrap items-center justify-between gap-2 mb-4">
                                            <div>
                                                <p className="text-[10px] uppercase tracking-[0.22em] text-gray-500">Filter Window</p>
                                                <p className="text-sm font-bold text-white">
                                                    Editing {activeDatePicker === 'from' ? 'Start Date' : 'End Date'}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => setPickerMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
                                                    className="p-2 rounded-lg bg-white/5 border border-white/10 text-gray-300 hover:text-white hover:border-secondary/50 transition-all"
                                                    aria-label="Previous month"
                                                >
                                                    <ChevronLeft size={16} />
                                                </button>
                                                <p className="min-w-[150px] text-center text-sm font-semibold text-white">
                                                    {MONTH_LABELS[pickerMonth.getMonth()]} {pickerMonth.getFullYear()}
                                                </p>
                                                <button
                                                    type="button"
                                                    onClick={() => setPickerMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
                                                    className="p-2 rounded-lg bg-white/5 border border-white/10 text-gray-300 hover:text-white hover:border-secondary/50 transition-all"
                                                    aria-label="Next month"
                                                >
                                                    <ChevronRight size={16} />
                                                </button>
                                            </div>
                                        </div>

                                        <div className="relative grid grid-cols-1 sm:grid-cols-[1fr_180px] gap-4">
                                            <div>
                                                <div className="grid grid-cols-7 gap-1 mb-2">
                                                    {DAY_LABELS.map((day) => (
                                                        <span key={day} className="text-[10px] text-gray-500 font-bold uppercase tracking-wider text-center py-1">
                                                            {day}
                                                        </span>
                                                    ))}
                                                </div>
                                                <div className="grid grid-cols-7 gap-1">
                                                    {pickerDays.map(({ date, key, inCurrentMonth }) => {
                                                        const dayStamp = getDayStamp(date);
                                                        const isSelectedFrom = fromParsed ? isSameCalendarDay(date, fromParsed) : false;
                                                        const isSelectedTo = toParsed ? isSameCalendarDay(date, toParsed) : false;
                                                        const isSelected = isSelectedFrom || isSelectedTo;
                                                        const isInRange = rangeStart !== null && rangeEnd !== null && dayStamp > rangeStart && dayStamp < rangeEnd;
                                                        const isActiveDay = activeParsed ? isSameCalendarDay(date, activeParsed) : false;

                                                        return (
                                                            <motion.button
                                                                key={key}
                                                                type="button"
                                                                onClick={() => updateActiveDay(date)}
                                                                whileHover={{ scale: 1.06, y: -1 }}
                                                                whileTap={{ scale: 0.97 }}
                                                                className={`h-9 rounded-xl text-xs font-semibold transition-all ${
                                                                    isSelected
                                                                        ? 'bg-secondary text-[#02101f] shadow-[0_8px_25px_rgba(0,243,255,0.28)]'
                                                                        : isInRange
                                                                            ? 'bg-secondary/20 text-secondary border border-secondary/20'
                                                                            : isActiveDay
                                                                                ? 'bg-white/10 border border-white/20 text-white'
                                                                                : inCurrentMonth
                                                                                    ? 'text-gray-200 hover:bg-white/10 border border-transparent'
                                                                                    : 'text-gray-600 hover:bg-white/5 border border-transparent'
                                                                }`}
                                                            >
                                                                {date.getDate()}
                                                            </motion.button>
                                                        );
                                                    })}
                                                </div>
                                            </div>

                                            <div className="rounded-xl border border-white/10 bg-black/25 p-3 space-y-3">
                                                <div>
                                                    <p className="text-[10px] uppercase tracking-[0.18em] text-gray-500 mb-1">Selected</p>
                                                    <p className="text-xs text-gray-200 leading-relaxed">{formatPickerLabel(activeDatePicker === 'from' ? fromDate : toDate)}</p>
                                                </div>
                                                <label className="block">
                                                    <span className="text-[10px] uppercase tracking-[0.18em] text-gray-500">Time</span>
                                                    <input
                                                        type="time"
                                                        step={60}
                                                        value={activeTimeValue}
                                                        onChange={(event) => updateActiveTime(event.target.value)}
                                                        className="mt-1 w-full bg-[#0a192f] border border-white/10 rounded-lg px-2 py-2 text-sm text-gray-200 focus:outline-none focus:border-secondary/60"
                                                    />
                                                </label>
                                                <div className="space-y-2">
                                                    <p className="text-[10px] uppercase tracking-[0.18em] text-gray-500">Quick Range</p>
                                                    <div className="grid grid-cols-2 gap-2">
                                                        {[
                                                            { key: '24h', label: 'Last 24h' },
                                                            { key: '7d', label: 'Last 7d' },
                                                            { key: 'today', label: 'Today' },
                                                            { key: 'month', label: 'This Month' }
                                                        ].map((preset) => (
                                                            <button
                                                                key={preset.key}
                                                                type="button"
                                                                onClick={() => applyPresetRange(preset.key)}
                                                                className="px-2 py-1.5 text-[11px] rounded-lg border border-white/10 bg-white/5 text-gray-300 hover:border-secondary/50 hover:text-secondary transition-all"
                                                            >
                                                                {preset.label}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                                <motion.button
                                                    type="button"
                                                    whileHover={{ y: -1, scale: 1.02 }}
                                                    whileTap={{ scale: 0.98 }}
                                                    onClick={() => setActiveDatePicker(null)}
                                                    className="w-full py-2 rounded-lg bg-secondary/15 border border-secondary/30 text-secondary text-xs font-bold hover:bg-secondary/25 transition-all"
                                                >
                                                    Apply & Close
                                                </motion.button>
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                        {(fromDate || toDate || searchInput) && (
                            <button
                                onClick={() => {
                                    setFromDate('');
                                    setToDate('');
                                    setSearchInput('');
                                }}
                                className="w-full sm:w-auto px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-gray-300 hover:text-white hover:border-white/30 transition-all text-sm"
                            >
                                Clear Filters
                            </button>
                        )}
                        <motion.button
                            whileHover={{ scale: 1.02, y: -1 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => setShowExportModal(true)}
                            className="flex-1 sm:flex-none px-5 py-3 bg-white/5 border border-white/10 rounded-xl text-gray-300 hover:text-white hover:border-white/30 transition-all flex items-center justify-center gap-2"
                        >
                            <Download size={16} />
                            Export Data
                        </motion.button>
                        <motion.button
                            whileHover={{ scale: 1.03, y: -1 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => fetchData()}
                            className="group flex-1 sm:flex-none px-5 py-3 bg-secondary/10 border border-secondary/20 rounded-xl text-secondary hover:bg-secondary/20 hover:border-secondary/50 transition-all flex items-center justify-center gap-2 shadow-[0_0_0_rgba(0,243,255,0)] hover:shadow-[0_0_20px_rgba(0,243,255,0.25)]"
                        >
                            <motion.span
                                animate={isRefreshing ? { rotate: 360 } : { rotate: 0 }}
                                transition={isRefreshing ? { repeat: Infinity, duration: 1, ease: 'linear' } : { duration: 0.2 }}
                                className="inline-flex"
                            >
                                <RefreshCw size={16} />
                            </motion.span>
                            Refresh
                        </motion.button>
                    </div>
                </div>
            </header>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                {[
                    { label: 'Total Visits', value: stats.total_visitors ?? visits.length, icon: Users, color: 'text-secondary' },
                    { label: 'Unique Visitors', value: stats.unique_visitors ?? new Set(visits.map((v) => v.ip)).size, icon: Globe, color: 'text-blue-400' },
                    { label: 'Today', value: stats.today ?? 0, icon: TrendingUp, color: 'text-green-400' },
                    { label: 'Avg Session', value: formatDuration(avgSession), icon: Clock, color: 'text-orange-400' }
                ].map((item, index) => (
                    <motion.div
                        key={item.label}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.06 }}
                        className="p-4 sm:p-5 bg-[#0d1b2a]/80 rounded-2xl border border-white/5 backdrop-blur-xl"
                    >
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] sm:text-xs uppercase tracking-widest text-gray-500 font-bold">{item.label}</span>
                            <item.icon className={item.color} size={16} />
                        </div>
                        <p className="text-lg sm:text-2xl font-display font-black text-white">{item.value}</p>
                    </motion.div>
                ))}
            </div>

            {ipSummary && (
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 sm:p-5 bg-gradient-to-r from-secondary/10 to-primary/5 border border-secondary/20 rounded-2xl backdrop-blur-xl"
                >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
                        <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                            <Sparkles size={16} className="text-secondary" />
                            IP Insight: <span className="font-mono text-secondary">{ipSummary.ip}</span>
                        </h3>
                        <p className="text-xs uppercase tracking-widest text-gray-400">Premium Search Result</p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 text-xs">
                        <div className="p-3 rounded-xl bg-black/20 border border-white/10">
                            <p className="text-gray-500 uppercase tracking-wide">Visits</p>
                            <p className="text-white font-bold text-sm mt-1">{ipSummary.visits}</p>
                        </div>
                        <div className="p-3 rounded-xl bg-black/20 border border-white/10">
                            <p className="text-gray-500 uppercase tracking-wide">Total Session</p>
                            <p className="text-white font-bold text-sm mt-1">{formatDuration(ipSummary.totalDuration)}</p>
                        </div>
                        <div className="p-3 rounded-xl bg-black/20 border border-white/10">
                            <p className="text-gray-500 uppercase tracking-wide">Avg Session</p>
                            <p className="text-white font-bold text-sm mt-1">{formatDuration(ipSummary.averageDuration)}</p>
                        </div>
                        <div className="p-3 rounded-xl bg-black/20 border border-white/10">
                            <p className="text-gray-500 uppercase tracking-wide">VPN Hits</p>
                            <p className="text-white font-bold text-sm mt-1">{ipSummary.vpnHits}</p>
                        </div>
                        <div className="p-3 rounded-xl bg-black/20 border border-white/10">
                            <p className="text-gray-500 uppercase tracking-wide">First Seen</p>
                            <p className="text-white font-bold text-sm mt-1">{ipSummary.firstSeen ? new Date(ipSummary.firstSeen).toLocaleString() : 'N/A'}</p>
                        </div>
                        <div className="p-3 rounded-xl bg-black/20 border border-white/10">
                            <p className="text-gray-500 uppercase tracking-wide">Last Seen</p>
                            <p className="text-white font-bold text-sm mt-1">{ipSummary.lastSeen ? new Date(ipSummary.lastSeen).toLocaleString() : 'N/A'}</p>
                        </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                        {(ipSummary.uniquePages || []).slice(0, 8).map((page) => (
                            <span key={page} className="px-2 py-1 rounded-lg text-xs bg-white/5 border border-white/10 text-gray-300 font-mono">
                                {page}
                            </span>
                        ))}
                    </div>
                </motion.div>
            )}

            <div className="flex items-center justify-between">
                <h3 className="text-xs uppercase tracking-widest text-gray-500 font-bold">Charts</h3>
                {isMobile && (
                    <button
                        onClick={() => toggleSection('charts')}
                        className="text-xs font-bold uppercase tracking-widest text-gray-400"
                    >
                        {mobileSections.charts ? 'Hide Charts' : 'Show Charts'}
                    </button>
                )}
            </div>

            {!isMobile || mobileSections.charts ? (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="p-4 sm:p-6 bg-[#0d1b2a]/80 rounded-[2rem] border border-white/5 backdrop-blur-xl"
                    >
                        <div className="flex items-center justify-between mb-4 sm:mb-6">
                            <h3 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
                                <TrendingUp className="text-secondary" size={18} />
                                Traffic Overview
                            </h3>
                        </div>
                        <div className="h-[220px] sm:h-[300px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={chartData}>
                                    <defs>
                                        <linearGradient id="colorVisits" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#64ffda" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#64ffda" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                                    <XAxis dataKey="name" stroke="#4a5568" fontSize={11} tickLine={false} axisLine={false} />
                                    <YAxis stroke="#4a5568" fontSize={11} tickLine={false} axisLine={false} />
                                    <RechartsTooltip
                                        contentStyle={{ backgroundColor: '#0a192f', borderColor: '#1e3a5f', borderRadius: '12px' }}
                                        itemStyle={{ color: '#64ffda' }}
                                    />
                                    <Area type="monotone" dataKey="visits" stroke="#64ffda" strokeWidth={3} fillOpacity={1} fill="url(#colorVisits)" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.05 }}
                        className="p-4 sm:p-6 bg-[#0d1b2a]/80 rounded-[2rem] border border-white/5 backdrop-blur-xl"
                    >
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
                                <Film className="text-orange-400" size={18} />
                                Top Reel Performance
                            </h3>
                        </div>
                        <div className="h-[240px] sm:h-[300px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={reelData} layout="vertical">
                                    <XAxis type="number" hide />
                                    <YAxis dataKey="name" type="category" stroke="#94a3b8" fontSize={11} width={120} tickLine={false} axisLine={false} />
                                    <RechartsTooltip
                                        cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                                        contentStyle={{ backgroundColor: '#0a192f', borderColor: '#1e3a5f', borderRadius: '12px' }}
                                    />
                                    <Bar dataKey="clicks" radius={[0, 8, 8, 0]} barSize={20}>
                                        {reelData.map((entry, index) => (
                                            <Cell key={`${entry.name}-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </motion.div>
                </div>
            ) : (
                <p className="text-xs text-gray-500">Charts hidden on mobile to keep the page compact.</p>
            )}

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="p-4 sm:p-6 bg-[#0d1b2a]/80 rounded-[2rem] border border-white/5 backdrop-blur-xl overflow-hidden relative"
            >
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-4 sm:mb-6">
                    <div>
                        <h3 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
                            <Globe className="text-blue-400" size={18} />
                            Global Visitor Reach
                        </h3>
                        <p className="text-sm text-gray-500">Drag to pan and use controls to zoom.</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 bg-black/40 p-1.5 rounded-2xl border border-white/10">
                        <button
                            onClick={() => updateZoom(0.25)}
                            className="p-2 hover:bg-white/10 rounded-xl transition-colors text-gray-400 hover:text-white disabled:opacity-50"
                            title="Zoom In"
                            disabled={mapZoom >= 8}
                        >
                            <ZoomIn size={18} />
                        </button>
                        <div className="w-[1px] h-4 bg-white/10"></div>
                        <button
                            onClick={() => updateZoom(-0.25)}
                            className="p-2 hover:bg-white/10 rounded-xl transition-colors text-gray-400 hover:text-white disabled:opacity-50"
                            title="Zoom Out"
                            disabled={mapZoom <= 1}
                        >
                            <ZoomOut size={18} />
                        </button>
                        <div className="w-[1px] h-4 bg-white/10"></div>
                        <button
                            onClick={resetMap}
                            className="p-2 hover:bg-white/10 rounded-xl transition-colors text-gray-400 hover:text-white"
                            title="Reset View"
                        >
                            <RotateCcw size={18} />
                        </button>
                    </div>
                </div>

                {isMobile && (
                    <button
                        onClick={() => toggleSection('map')}
                        className="mb-3 text-xs font-bold uppercase tracking-widest text-gray-400"
                    >
                        {mobileSections.map ? 'Hide Map' : 'Show Map'}
                    </button>
                )}

                {!isMobile || mobileSections.map ? (
                    <div
                        className="h-[260px] sm:h-[450px] bg-black/20 rounded-2xl relative overflow-hidden"
                        onWheel={(e) => {
                            e.preventDefault();
                            updateZoom(e.deltaY < 0 ? 0.2 : -0.2);
                        }}
                    >
                        <ComposableMap projectionConfig={{ scale: 185 }}>
                            <ZoomableGroup
                                zoom={mapZoom}
                                center={mapCenter}
                                minZoom={1}
                                maxZoom={8}
                                transitionDuration={450}
                                onMoveEnd={({ coordinates, zoom }) => {
                                    setMapCenter(coordinates);
                                    setMapZoom(clamp(zoom, 1, 8));
                                }}
                            >
                                <Geographies geography={geoUrl}>
                                    {({ geographies }) =>
                                        geographies.map((geo) => (
                                            <Geography
                                                key={geo.rsmKey}
                                                geography={geo}
                                                fill="#1e293b"
                                                stroke="#334155"
                                                strokeWidth={0.5}
                                                style={{
                                                    default: { outline: 'none' },
                                                    hover: { fill: '#2d3748', outline: 'none' },
                                                    pressed: { fill: '#4a5568', outline: 'none' }
                                                }}
                                            />
                                        ))
                                    }
                                </Geographies>
                                {visits
                                    .filter((v) => Number(v.latitude) && Number(v.longitude))
                                    .map((v, i) => (
                                        <Marker key={v.id || i} coordinates={[Number(v.longitude), Number(v.latitude)]}>
                                            <circle r={2.2} fill="#64ffda" />
                                        </Marker>
                                    ))}
                            </ZoomableGroup>
                        </ComposableMap>
                    </div>
                ) : (
                    <p className="text-xs text-gray-500">Map hidden on mobile to keep the page compact.</p>
                )}
            </motion.div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                {[
                    { label: 'Wifi/Ethernet', value: wifiCount, icon: Wifi, color: 'text-blue-400' },
                    { label: 'Cellular', value: cellularCount, icon: Radio, color: 'text-purple-400' },
                    { label: 'VPN/Proxy', value: vpnCount, icon: Shield, color: 'text-red-400' },
                    { label: 'Regular IP', value: regularCount, icon: ShieldOff, color: 'text-green-400' }
                ].map((item, i) => (
                    <motion.div
                        key={item.label}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.15 + (i * 0.06) }}
                        className="p-4 sm:p-5 bg-[#0d1b2a]/80 rounded-2xl border border-white/5 backdrop-blur-xl flex items-center justify-between"
                    >
                        <div>
                            <p className="text-[10px] sm:text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">{item.label}</p>
                            <p className="text-lg sm:text-2xl font-display font-black text-white">{item.value}</p>
                        </div>
                        <item.icon className={item.color} size={20} />
                    </motion.div>
                ))}
            </div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="p-4 sm:p-6 bg-[#0d1b2a]/80 rounded-[2rem] border border-white/5 backdrop-blur-xl"
            >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                    <h3 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
                        <Users className="text-secondary" size={18} />
                        Live Visitor Stream
                    </h3>

                    <div className="flex items-center gap-2 text-sm text-gray-400">
                        <button
                            onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                            className="p-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 disabled:opacity-40"
                            disabled={currentPage <= 1}
                        >
                            <ChevronLeft size={16} />
                        </button>
                        <span className="min-w-[72px] text-center">
                            Page {currentPage} / {totalPages}
                        </span>
                        <button
                            onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                            className="p-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 disabled:opacity-40"
                            disabled={currentPage >= totalPages}
                        >
                            <ChevronRight size={16} />
                        </button>
                    </div>
                </div>

                <p className="text-xs text-gray-500 mb-4">
                    Showing {deferredVisits.length} of {pagination.total || deferredVisits.length} matched sessions
                    {searchQuery ? ` for "${searchQuery}"` : ''}.
                </p>

                {isMobile && (
                    <button
                        onClick={() => toggleSection('visitors')}
                        className="mb-3 text-xs font-bold uppercase tracking-widest text-gray-400"
                    >
                        {mobileSections.visitors ? 'Hide Visitors' : 'Show Visitors'}
                    </button>
                )}

                {!isMobile || mobileSections.visitors ? (
                    <div className="hidden md:block overflow-x-auto" data-lenis-prevent>
                    <table className="w-full text-left">
                        <thead>
                            <tr className="text-gray-500 text-xs font-bold uppercase tracking-widest border-b border-white/5">
                                <th className="pb-4 pt-2">Visitor</th>
                                <th className="pb-4 pt-2">Location</th>
                                <th className="pb-4 pt-2">Device</th>
                                <th className="pb-4 pt-2">Duration</th>
                                <th className="pb-4 pt-2 text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {deferredVisits.map((v, index) => {
                                const rowKey = v.id || `${v.ip}-${index}`;
                                const identity = getVisitorIdentity(v);
                                const rowContent = (
                                    <>
                                        <td className="py-4">
                                            <div className="flex items-center gap-2">
                                                <span className="text-white font-bold">{v.ip}</span>
                                                <button
                                                    onClick={() => copyToClipboard(getVisitorKey(v, index, 'desktop'), v.ip)}
                                                    className="p-2 rounded-lg bg-white/5 hover:bg-secondary/20 border border-white/10 hover:border-secondary/50 transition-all duration-300"
                                                    title="Copy IP"
                                                >
                                                    {copiedVisitorKey === getVisitorKey(v, index, 'desktop') ? <Check size={14} className="text-secondary" /> : <Copy size={14} className="text-gray-400" />}
                                                </button>
                                                <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold tracking-wide ${identity.className}`}>
                                                    {identity.emoji} {identity.label}
                                                </span>
                                            </div>
                                            <span className="text-[10px] text-gray-500 font-mono mt-1 block truncate max-w-[220px]">{v.userAgent}</span>
                                            <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-gray-500">
                                                <span>{v.timestamp ? new Date(v.timestamp).toLocaleString() : 'Unknown time'}</span>
                                                <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-gray-400">{v.pageViewed || '/'}</span>
                                                <span className={`px-1.5 py-0.5 rounded border ${v.isVpn ? 'border-red-400/40 text-red-300 bg-red-500/10' : 'border-emerald-400/40 text-emerald-300 bg-emerald-500/10'}`}>
                                                    {v.isVpn ? 'VPN' : 'Direct'}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="py-4">
                                            <p className="text-white text-sm font-medium">{v.city || 'Unknown'}</p>
                                            <p className="text-[10px] text-gray-500 uppercase">{v.country || 'Unknown'}</p>
                                        </td>
                                        <td className="py-4">
                                            <div className="flex items-center gap-2">
                                                {v.deviceType === 'mobile' ? <Smartphone size={14} className="text-gray-400" /> : <Laptop size={14} className="text-gray-400" />}
                                                <span className="text-sm text-gray-300 capitalize">{v.deviceType || 'unknown'}</span>
                                            </div>
                                        </td>
                                        <td className="py-4">
                                            <div className="flex items-center gap-2 text-gray-300">
                                                <Clock size={14} className="text-secondary" />
                                                <span className="text-sm">{formatDuration(v.sessionDuration)}</span>
                                            </div>
                                        </td>
                                        <td className="py-4 text-right">
                                            <button
                                                onClick={() => setSelectedVisitor(v)}
                                                className="px-4 py-2 rounded-lg bg-white/5 hover:bg-secondary/20 text-gray-300 hover:text-white text-xs font-bold transition-all"
                                            >
                                                Details
                                            </button>
                                        </td>
                                    </>
                                );

                                if (!animateRows) {
                                    return <tr key={rowKey} className="group hover:bg-white/5 transition-colors">{rowContent}</tr>;
                                }

                                return (
                                    <motion.tr
                                        key={rowKey}
                                        layout
                                        initial={{ opacity: 0, y: 8 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ duration: 0.2, delay: Math.min(index * 0.015, 0.24) }}
                                        className="group hover:bg-white/5 transition-colors"
                                    >
                                        {rowContent}
                                    </motion.tr>
                                );
                            })}
                        </tbody>
                    </table>
                    </div>
                ) : null}

                {(!isMobile || mobileSections.visitors) && (
                    <div className="md:hidden space-y-3">
                        <AnimatePresence initial={false}>
                            {deferredVisits.map((v, index) => {
                                const identity = getVisitorIdentity(v);
                                return (
                                <motion.div
                                    key={v.id || `${v.ip}-${index}`}
                                    layout
                                    initial={animateRows ? { opacity: 0, y: 8 } : false}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={animateRows ? { opacity: 0, y: -8 } : undefined}
                                    transition={{ duration: 0.22, delay: animateRows ? Math.min(index * 0.02, 0.22) : 0 }}
                                    className="p-4 rounded-xl border border-white/10 bg-black/20"
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="text-white font-semibold truncate">{v.ip}</p>
                                            <p className="text-xs text-gray-500 truncate">{v.userAgent}</p>
                                            <span className={`mt-1 inline-flex px-2 py-0.5 rounded-full border text-[10px] font-bold tracking-wide ${identity.className}`}>
                                                {identity.emoji} {identity.label}
                                            </span>
                                        </div>
                                        <button
                                            onClick={() => copyToClipboard(getVisitorKey(v, index, 'mobile'), v.ip)}
                                            className="p-2 rounded-lg bg-white/5 border border-white/10"
                                            title="Copy IP"
                                        >
                                            {copiedVisitorKey === getVisitorKey(v, index, 'mobile') ? <Check size={14} className="text-secondary" /> : <Copy size={14} className="text-gray-400" />}
                                        </button>
                                    </div>
                                    <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                                        <div>
                                            <p className="text-gray-500 uppercase tracking-wide">Location</p>
                                            <p className="text-gray-300">{v.city || 'Unknown'}, {v.country || 'Unknown'}</p>
                                        </div>
                                        <div>
                                            <p className="text-gray-500 uppercase tracking-wide">Session</p>
                                            <p className="text-gray-300">{formatDuration(v.sessionDuration)}</p>
                                        </div>
                                    </div>
                                    <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-gray-500">
                                        <span className="truncate">{v.pageViewed || '/'}</span>
                                        <span>{v.timestamp ? new Date(v.timestamp).toLocaleString() : 'Unknown time'}</span>
                                    </div>
                                    <button
                                        onClick={() => setSelectedVisitor(v)}
                                        className="mt-3 w-full py-2 rounded-lg bg-white/5 border border-white/10 text-gray-300 text-xs font-bold"
                                    >
                                        View Details
                                    </button>
                                </motion.div>
                                );
                            })}
                        </AnimatePresence>
                    </div>
                )}
            </motion.div>

            <AnimatePresence>
                {selectedVisitor && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        data-lenis-prevent
                        className="fixed inset-0 z-[100] flex items-center justify-center p-4 backdrop-blur-sm bg-black/60"
                        onClick={() => setSelectedVisitor(null)}
                    >
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.95, opacity: 0, y: 20 }}
                            className="bg-[#0f172a] border border-white/10 p-4 sm:p-8 rounded-3xl w-full max-w-2xl shadow-2xl relative"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <button
                                onClick={() => setSelectedVisitor(null)}
                                className="absolute top-4 right-4 p-2 text-gray-500 hover:text-white transition-colors"
                            >
                                <X size={20} />
                            </button>

                            <div className="flex items-center gap-4 sm:gap-6 mb-6">
                                <div className="w-14 h-14 sm:w-20 sm:h-20 rounded-2xl bg-secondary/10 flex items-center justify-center">
                                    <Globe className="text-secondary" size={30} />
                                </div>
                                <div className="min-w-0">
                                    <h3 className="text-2xl sm:text-3xl font-display font-black text-white">Visitor Profile</h3>
                                    <p className="text-secondary font-mono text-sm truncate">{selectedVisitor.ip}</p>
                                    {selectedIdentity && (
                                        <span className={`mt-2 inline-flex px-2 py-0.5 rounded-full border text-[10px] font-bold tracking-wide ${selectedIdentity.className}`}>
                                            {selectedIdentity.emoji} {selectedIdentity.label}
                                        </span>
                                    )}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[420px] overflow-y-auto pr-1" data-lenis-prevent>
                                <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                                    <p className="text-xs text-gray-500 font-bold uppercase mb-2">Location</p>
                                    <div className="flex items-center gap-2">
                                        <MapPin size={16} className="text-secondary" />
                                        <span className="text-white font-medium">{selectedVisitor.city}, {selectedVisitor.country}</span>
                                    </div>
                                    <p className="text-[10px] text-gray-500 mt-1">{selectedVisitor.region}</p>
                                </div>
                                <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                                    <p className="text-xs text-gray-500 font-bold uppercase mb-2">Network</p>
                                    <span className="text-white font-medium block truncate">{selectedVisitor.isp || 'Unknown ISP'}</span>
                                    <p className="text-[10px] text-gray-500 mt-1 uppercase">{selectedVisitor.connectionType || 'unknown'}</p>
                                    <p className={`text-[10px] mt-1 uppercase ${selectedVisitor.isVpn ? 'text-red-300' : 'text-emerald-300'}`}>
                                        {selectedVisitor.isVpn ? 'VPN / Proxy Detected' : 'Direct Network'}
                                    </p>
                                </div>
                                <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                                    <p className="text-xs text-gray-500 font-bold uppercase mb-2">Identity Signal</p>
                                    <p className={`text-sm font-semibold ${selectedIdentity?.isBot ? 'text-amber-300' : 'text-emerald-300'}`}>
                                        {selectedIdentity ? `${selectedIdentity.emoji} ${selectedIdentity.label}` : 'Unknown'}
                                    </p>
                                    <p className="text-[10px] text-gray-500 mt-1 truncate">
                                        {(selectedVisitor.botName || selectedVisitor.botReason || 'No bot indicators detected')}
                                    </p>
                                    <p className="text-[10px] text-gray-500 mt-1 uppercase">
                                        Confidence: {Math.round((Number(selectedVisitor.botConfidence) || 0) * 100)}%
                                    </p>
                                    <p className="text-[10px] text-gray-500 mt-1 uppercase">
                                        Source: {selectedVisitor.profileSource || 'fallback'}
                                    </p>
                                </div>
                                <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                                    <p className="text-xs text-gray-500 font-bold uppercase mb-2">Session Duration</p>
                                    <div className="flex items-center gap-2 text-gray-300">
                                        <Clock size={16} className="text-purple-400" />
                                        <span className="text-sm">{formatDuration(selectedVisitor.sessionDuration)}</span>
                                    </div>
                                </div>
                                <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                                    <p className="text-xs text-gray-500 font-bold uppercase mb-2">Coordinates</p>
                                    <p className="text-sm text-gray-300 font-mono">{selectedVisitor.latitude}, {selectedVisitor.longitude}</p>
                                </div>
                                <div className="sm:col-span-2 p-4 bg-white/5 rounded-2xl border border-white/5">
                                    <p className="text-xs text-gray-500 font-bold uppercase mb-2">Visit Record</p>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                                        <p className="text-gray-300"><span className="text-gray-500">Visited Page:</span> {selectedVisitor.pageViewed || '/'}</p>
                                        <p className="text-gray-300"><span className="text-gray-500">Visited At:</span> {selectedVisitor.timestamp ? new Date(selectedVisitor.timestamp).toLocaleString() : 'Unknown'}</p>
                                    </div>
                                    <div className="mt-3">
                                        <p className="text-[11px] text-gray-500 uppercase tracking-wide mb-1">Page History</p>
                                        <div className="flex flex-wrap gap-2">
                                            {selectedPageHistory.length > 0 ? selectedPageHistory.map((pagePath) => (
                                                <span key={pagePath} className="px-2 py-1 rounded-lg bg-white/5 border border-white/10 text-[11px] text-gray-300">
                                                    {pagePath}
                                                </span>
                                            )) : <span className="text-xs text-gray-500">No page history available.</span>}
                                        </div>
                                    </div>
                                </div>
                                <div className="sm:col-span-2 p-4 bg-white/5 rounded-2xl border border-white/5">
                                    <p className="text-xs text-gray-500 font-bold uppercase mb-2">Browser Agent</p>
                                    <p className="text-xs text-gray-400 font-mono break-all leading-relaxed">{selectedVisitor.userAgent}</p>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {showExportModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        data-lenis-prevent
                        className="fixed inset-0 z-[100] flex items-center justify-center p-4 backdrop-blur-sm bg-black/60"
                    >
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="bg-[#0f172a] border border-white/10 p-5 sm:p-8 rounded-[2rem] w-full max-w-md shadow-2xl relative"
                        >
                            <h3 className="text-2xl font-display font-black text-white mb-2">Export Data</h3>
                            <p className="text-gray-400 text-sm mb-8">Export current page data from analytics.</p>

                            <div className="space-y-4">
                                <button
                                    onClick={exportToCSV}
                                    className="w-full p-4 bg-white/5 hover:bg-secondary/20 rounded-2xl border border-white/5 flex items-center justify-between transition-all group"
                                >
                                    <div className="flex items-center gap-3">
                                        <FileSpreadsheet className="text-secondary" />
                                        <span className="font-bold">CSV Spreadsheet</span>
                                    </div>
                                    <Download size={18} className="text-gray-500 group-hover:text-white" />
                                </button>
                                <button
                                    onClick={exportToJSON}
                                    className="w-full p-4 bg-white/5 hover:bg-primary/20 rounded-2xl border border-white/5 flex items-center justify-between transition-all group"
                                >
                                    <div className="flex items-center gap-3">
                                        <FileJson className="text-primary" />
                                        <span className="font-bold">JSON Raw Data</span>
                                    </div>
                                    <Download size={18} className="text-gray-500 group-hover:text-white" />
                                </button>
                            </div>

                            <button
                                onClick={() => setShowExportModal(false)}
                                className="w-full mt-6 py-3 text-gray-500 hover:text-white transition-colors text-sm font-bold"
                            >
                                Cancel
                            </button>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default Analytics;
