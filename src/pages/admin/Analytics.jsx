import { useState, useEffect, useMemo, useCallback } from 'react';
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
    ChevronRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ComposableMap, Geographies, Geography, Marker, ZoomableGroup } from 'react-simple-maps';
import { useContent } from '../../context/ContentContext';
import { adminFetch } from '../../utils/adminApi';

const geoUrl = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';
const COLORS = ['#64ffda', '#0070f3', '#f59e0b', '#ef4444', '#8b5cf6', '#10b981'];

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const formatDuration = (seconds) => {
    const safeSeconds = Math.max(0, Number(seconds) || 0);
    return `${Math.floor(safeSeconds / 60)}m ${safeSeconds % 60}s`;
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
    const isMobile = pageSize === 20;
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

    const fetchData = useCallback(async () => {
        try {
            const query = new URLSearchParams({
                page: String(currentPage),
                limit: String(pageSize)
            });
            if (fromDate) query.set('from', fromDate);
            if (toDate) query.set('to', toDate);
            const res = await adminFetch(`/api/analytics?${query.toString()}`);
            const apiData = await res.json();
            setData(apiData);
        } catch (err) {
            console.error('Analytics Error:', err);
        } finally {
            setLoading(false);
        }
    }, [currentPage, pageSize, fromDate, toDate]);

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 30000);
        return () => clearInterval(interval);
    }, [fetchData]);

    useEffect(() => {
        const updatePageSize = () => setPageSize(window.innerWidth < 768 ? 20 : 50);
        window.addEventListener('resize', updatePageSize);
        return () => window.removeEventListener('resize', updatePageSize);
    }, []);

    useEffect(() => {
        setCurrentPage(1);
    }, [fromDate, toDate]);

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
    const stats = data?.stats || {};
    const reelClicks = data?.reelClicks || {};
    const pagination = data?.pagination || { page: currentPage, limit: pageSize, total: visits.length };
    const totalPages = Math.max(1, Math.ceil((pagination.total || 0) / (pagination.limit || 1)));

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
                <div className="flex flex-wrap gap-3 w-full sm:w-auto">
                    <input
                        type="date"
                        value={fromDate}
                        onChange={(e) => setFromDate(e.target.value)}
                        className="flex-1 sm:flex-none px-3 py-3 bg-black/20 border border-white/10 rounded-xl text-gray-300 text-sm focus:outline-none focus:border-secondary"
                        title="From date"
                    />
                    <input
                        type="date"
                        value={toDate}
                        onChange={(e) => setToDate(e.target.value)}
                        className="flex-1 sm:flex-none px-3 py-3 bg-black/20 border border-white/10 rounded-xl text-gray-300 text-sm focus:outline-none focus:border-secondary"
                        title="To date"
                    />
                    {(fromDate || toDate) && (
                        <button
                            onClick={() => {
                                setFromDate('');
                                setToDate('');
                            }}
                            className="px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-gray-300 hover:text-white hover:border-white/30 transition-all text-sm"
                        >
                            Clear Dates
                        </button>
                    )}
                    <button
                        onClick={() => setShowExportModal(true)}
                        className="flex-1 sm:flex-none px-5 py-3 bg-white/5 border border-white/10 rounded-xl text-gray-300 hover:text-white hover:border-white/30 transition-all flex items-center justify-center gap-2"
                    >
                        <Download size={16} />
                        Export Data
                    </button>
                    <button
                        onClick={fetchData}
                        className="flex-1 sm:flex-none px-5 py-3 bg-secondary/10 border border-secondary/20 rounded-xl text-secondary hover:bg-secondary/20 transition-all flex items-center justify-center gap-2"
                    >
                        <RefreshCw size={16} />
                        Refresh
                    </button>
                </div>
            </header>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
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

                    <div className="flex items-center gap-2 bg-black/40 p-1.5 rounded-2xl border border-white/10">
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

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
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

                {isMobile && (
                    <button
                        onClick={() => toggleSection('visitors')}
                        className="mb-3 text-xs font-bold uppercase tracking-widest text-gray-400"
                    >
                        {mobileSections.visitors ? 'Hide Visitors' : 'Show Visitors'}
                    </button>
                )}

                {!isMobile || mobileSections.visitors ? (
                    <div className="hidden md:block overflow-x-auto">
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
                            {visits.map((v, index) => (
                                <tr key={v.id || `${v.ip}-${index}`} className="group hover:bg-white/5 transition-colors">
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
                                        </div>
                                        <span className="text-[10px] text-gray-500 font-mono mt-1 block truncate max-w-[220px]">{v.userAgent}</span>
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
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    </div>
                ) : null}

                {(!isMobile || mobileSections.visitors) && (
                    <div className="md:hidden space-y-3">
                    {visits.map((v, index) => (
                        <div key={v.id || `${v.ip}-${index}`} className="p-4 rounded-xl border border-white/10 bg-black/20">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="text-white font-semibold truncate">{v.ip}</p>
                                    <p className="text-xs text-gray-500 truncate">{v.userAgent}</p>
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
                            <button
                                onClick={() => setSelectedVisitor(v)}
                                className="mt-3 w-full py-2 rounded-lg bg-white/5 border border-white/10 text-gray-300 text-xs font-bold"
                            >
                                View Details
                            </button>
                        </div>
                    ))}
                    </div>
                )}
            </motion.div>

            <AnimatePresence>
                {selectedVisitor && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
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
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-[420px] overflow-y-auto pr-1">
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
