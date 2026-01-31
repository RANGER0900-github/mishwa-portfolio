import { useState, useEffect, useCallback } from 'react';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
    ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, LineChart, Line
} from 'recharts';
import {
    Map, Laptop, Smartphone, RefreshCw, Copy, Check,
    Shield, ShieldOff, Wifi, Radio, Clock, Eye, Users, Globe,
    TrendingUp, Film, Maximize2, X, MapPin, Download, FileJson, FileSpreadsheet,
    ZoomIn, ZoomOut, RotateCcw, ChevronLeft, ChevronRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { ComposableMap, Geographies, Geography, Marker, ZoomableGroup } from 'react-simple-maps';
import { useContent } from '../../context/ContentContext';

const geoUrl = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

const Analytics = () => {
    const { content } = useContent();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [selectedVisitor, setSelectedVisitor] = useState(null);
    const [showExportModal, setShowExportModal] = useState(false);
    const [mapZoom, setMapZoom] = useState(1);
    const [mapCenter, setMapCenter] = useState([0, 20]);
    const [copiedIP, setCopiedIP] = useState(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize] = useState(50);

    const fetchData = useCallback(async () => {
        try {
            const res = await fetch(`/api/analytics?page=${currentPage}&limit=${pageSize}`);
            const apiData = await res.json();
            setData(apiData);
            setLoading(false);
        } catch (err) {
            console.error("Analytics Error:", err);
        }
    }, [currentPage, pageSize]);

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 30000);
        return () => clearInterval(interval);
    }, [fetchData]);

    const copyToClipboard = (text) => {
        navigator.clipboard.writeText(text);
        setCopiedIP(text);
        setTimeout(() => setCopiedIP(null), 2000);
    };

    const downloadFile = (content, fileName, contentType) => {
        const a = document.createElement("a");
        const file = new Blob([content], { type: contentType });
        a.href = URL.createObjectURL(file);
        a.download = fileName;
        a.click();
    };

    const exportToCSV = () => {
        const visits = data?.visits || [];
        const headers = ['Timestamp', 'IP Address', 'Country', 'City', 'Device', 'Connection', 'Duration (s)', 'Page'];
        const rows = visits.map(v => [
            new Date(v.timestamp).toLocaleString(),
            v.ip,
            v.country,
            v.city,
            v.deviceType,
            v.connectionType,
            v.sessionDuration,
            v.pageViewed
        ]);

        const csvContent = [headers, ...rows].map(row => row.join(',')).join('\n');
        downloadFile(csvContent, 'analytics_export.csv', 'text/csv');
        setShowExportModal(false);
    };

    const exportToJSON = () => {
        const exportData = {
            exportedAt: new Date().toISOString(),
            stats: data?.stats,
            visits: data?.visits || []
        };
        downloadFile(JSON.stringify(exportData, null, 2), 'analytics_export.json', 'application/json');
        setShowExportModal(false);
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

    const visits = data?.visits || [];
    const stats = data?.stats || {};
    const reelClicks = data?.reelClicks || {};

    // Chart Data
    const getLast7Days = () => {
        const days = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            days.push(d.toISOString().slice(0, 10));
        }
        return days;
    };

    const chartData = getLast7Days().map(date => ({
        name: new Date(date).toLocaleDateString('en', { weekday: 'short' }),
        visits: visits.filter(v => v.timestamp?.startsWith(date)).length
    }));

    const mobileCount = visits.filter(v => v.deviceType === 'mobile').length;
    const desktopCount = visits.filter(v => v.deviceType === 'desktop').length;

    const deviceData = [
        { name: 'Mobile', value: mobileCount, color: '#64ffda' },
        { name: 'Desktop', value: desktopCount, color: '#0070f3' }
    ];

    const countryStats = {};
    visits.forEach(v => {
        if (v.country) countryStats[v.country] = (countryStats[v.country] || 0) + 1;
    });
    const countryData = Object.entries(countryStats)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([country, count]) => ({ name: country, value: count }));

    const vpnCount = visits.filter(v => v.isVpn).length;
    const regularCount = visits.length - vpnCount;
    const wifiCount = visits.filter(v => v.connectionType === 'wifi' || v.connectionType === 'ethernet').length;
    const cellularCount = visits.filter(v => v.connectionType === 'cellular').length;

    // Improved Reel Clicks mapping to Titles
    const reelData = Object.entries(reelClicks)
        .map(([id, clicks]) => {
            const project = (content?.projects || []).find(p => p.id === parseInt(id));
            return {
                name: project ? project.title : `Reel ${id}`,
                clicks
            };
        })
        .sort((a, b) => b.clicks - a.clicks)
        .slice(0, 5);

    const hourlyData = [];
    for (let h = 0; h < 24; h++) {
        const count = visits.filter(v => v.timestamp && new Date(v.timestamp).getHours() === h).length;
        hourlyData.push({ hour: `${h}:00`, visits: count });
    }

    const COLORS = ['#64ffda', '#0070f3', '#f59e0b', '#ef4444', '#8b5cf6', '#10b981'];

    // Animated Button Component
    const AnimatedButton = ({ onClick, children, className = '', icon: Icon, loading: isLoading }) => (
        <motion.button
            onClick={onClick}
            className={`group relative overflow-hidden ${className}`}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
        >
            <motion.div
                className="absolute inset-0 bg-gradient-to-r from-secondary/20 to-primary/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                initial={false}
            />
            <span className="relative z-10 flex items-center gap-2">
                {Icon && (
                    <motion.span
                        animate={isLoading ? { rotate: 360 } : { rotate: 0 }}
                        transition={isLoading ? { duration: 1, repeat: Infinity, ease: "linear" } : {}}
                    >
                        <Icon size={16} className={isLoading ? "text-secondary" : ""} />
                    </motion.span>
                )}
                {children}
            </span>
            <motion.div
                className="absolute bottom-0 left-0 h-0.5 bg-gradient-to-r from-secondary to-primary"
                initial={{ width: 0 }}
                whileHover={{ width: "100%" }}
                transition={{ duration: 0.3 }}
            />
        </motion.button>
    );

    // Copy Button Component
    const CopyButton = ({ text, label }) => (
        <motion.button
            onClick={() => copyToClipboard(text)}
            className="p-2 rounded-lg bg-white/5 hover:bg-secondary/20 border border-white/10 hover:border-secondary/50 transition-all duration-300 group"
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            title={`Copy ${label}`}
        >
            <AnimatePresence mode="wait">
                {copiedIP === text ? (
                    <motion.div
                        key="check"
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        exit={{ scale: 0 }}
                        transition={{ duration: 0.2 }}
                    >
                        <Check size={14} className="text-secondary" />
                    </motion.div>
                ) : (
                    <motion.div
                        key="copy"
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        exit={{ scale: 0 }}
                        transition={{ duration: 0.2 }}
                    >
                        <Copy size={14} className="text-gray-400 group-hover:text-secondary transition-colors" />
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.button>
    );

    return (
        <div className="space-y-8 pb-12">
            {/* Header */}
            <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-4xl md:text-5xl font-display font-black text-white mb-2">
                        Analytics<span className="text-secondary">.</span>
                    </h1>
                    <div className="flex items-center gap-4">
                        <p className="text-gray-400 flex items-center gap-2">
                            <span className="w-2 h-2 bg-secondary rounded-full animate-pulse"></span>
                            {visits.length} sessions recorded
                        </p>
                    </div>
                </div>
                <div className="flex gap-3 w-full md:w-auto">
                    <AnimatedButton
                        onClick={() => setShowExportModal(true)}
                        icon={Download}
                        className="px-6 py-3 bg-white/5 border border-white/10 rounded-xl text-gray-400 hover:text-white"
                    >
                        Export Data
                    </AnimatedButton>
                    <AnimatedButton
                        onClick={fetchData}
                        icon={RefreshCw}
                        className="px-6 py-3 bg-secondary/10 border border-secondary/20 rounded-xl text-secondary hover:bg-secondary/20"
                    >
                        Refresh
                    </AnimatedButton>
                </div>
            </header>

            {/* Main Stats Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Traffic Overview */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-8 bg-[#0d1b2a]/80 rounded-[2rem] border border-white/5 backdrop-blur-xl"
                >
                    <div className="flex items-center justify-between mb-8">
                        <h3 className="text-xl font-bold text-white flex items-center gap-2">
                            <TrendingUp className="text-secondary" />
                            Traffic Overview
                        </h3>
                    </div>
                    <div className="h-[300px]">
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

                {/* Reel Performance */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                    className="p-8 bg-[#0d1b2a]/80 rounded-[2rem] border border-white/5 backdrop-blur-xl"
                >
                    <div className="flex items-center justify-between mb-8">
                        <h3 className="text-xl font-bold text-white flex items-center gap-2">
                            <Film className="text-orange-400" />
                            Top Reel Performance
                        </h3>
                    </div>
                    <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={reelData} layout="vertical">
                                <XAxis type="number" hide />
                                <YAxis dataKey="name" type="category" stroke="#94a3b8" fontSize={11} width={100} tickLine={false} axisLine={false} />
                                <RechartsTooltip
                                    cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                                    contentStyle={{ backgroundColor: '#0a192f', borderColor: '#1e3a5f', borderRadius: '12px' }}
                                />
                                <Bar dataKey="clicks" radius={[0, 8, 8, 0]} barSize={20}>
                                    {reelData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </motion.div>
            </div>

            {/* Interactive World Map */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35 }}
                className="p-8 bg-[#0d1b2a]/80 rounded-[2rem] border border-white/5 backdrop-blur-xl overflow-hidden relative"
            >
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
                    <div>
                        <h3 className="text-xl font-bold text-white flex items-center gap-2">
                            <Globe className="text-blue-400" />
                            Global Visitor Reach
                        </h3>
                        <p className="text-sm text-gray-500">Live geographic distribution of your audience</p>
                    </div>

                    {/* Map Controls */}
                    <div className="flex items-center gap-2 bg-black/40 p-1.5 rounded-2xl border border-white/10">
                        <button
                            onClick={() => setMapZoom(prev => Math.min(prev * 1.5, 8))}
                            className="p-2 hover:bg-white/10 rounded-xl transition-colors text-gray-400 hover:text-white"
                            title="Zoom In"
                        >
                            <ZoomIn size={18} />
                        </button>
                        <div className="w-[1px] h-4 bg-white/10"></div>
                        <button
                            onClick={() => setMapZoom(prev => Math.max(prev / 1.5, 1))}
                            className="p-2 hover:bg-white/10 rounded-xl transition-colors text-gray-400 hover:text-white"
                            title="Zoom Out"
                        >
                            <ZoomOut size={18} />
                        </button>
                        <div className="w-[1px] h-4 bg-white/10"></div>
                        <button
                            onClick={() => { setMapZoom(1); setMapCenter([0, 20]); }}
                            className="p-2 hover:bg-white/10 rounded-xl transition-colors text-gray-400 hover:text-white"
                            title="Reset View"
                        >
                            <RotateCcw size={18} />
                        </button>
                    </div>
                </div>

                <div className="h-[450px] bg-black/20 rounded-2xl relative overflow-hidden group" onWheel={(e) => {
                    // allow ctrl/shift wheel for zoom
                    e.preventDefault();
                    const delta = e.deltaY > 0 ? -0.15 : 0.15;
                    setMapZoom(prev => Math.min(8, Math.max(1, +(prev + delta).toFixed(2))));
                }}>
                    <ComposableMap projectionConfig={{ scale: 190 }}>
                        <ZoomableGroup
                            zoom={mapZoom}
                            center={mapCenter}
                            onMoveEnd={({ coordinates, zoom }) => {
                                setMapCenter(coordinates);
                                setMapZoom(zoom);
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
                                                default: { outline: "none" },
                                                hover: { fill: "#2d3748", outline: "none" },
                                                pressed: { fill: "#4a5568", outline: "none" },
                                            }}
                                        />
                                    ))
                                }
                            </Geographies>
                            {visits.filter(v => v.latitude && v.longitude).map((v, i) => (
                                <Marker key={v.id || i} coordinates={[v.longitude, v.latitude]}>
                                    <circle r={2} fill="#64ffda" />
                                    <circle r={4} fill="#64ffda" opacity={0.3} className="animate-ping" />
                                </Marker>
                            ))}
                        </ZoomableGroup>
                    </ComposableMap>

                    {/* Mini Stats Legend */}
                    <div className="absolute bottom-6 left-6 space-y-2 pointer-events-none">
                        <div className="bg-black/80 backdrop-blur-md px-4 py-2 rounded-xl border border-white/10 flex items-center gap-3">
                            <div className="w-2 h-2 rounded-full bg-secondary"></div>
                            <span className="text-xs font-bold text-white uppercase tracking-wider">Active Region</span>
                        </div>
                    </div>
                </div>
            </motion.div>

            {/* Connection & VPN Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                    { label: 'Wifi/Ethernet', value: wifiCount, icon: Wifi, color: 'text-blue-400' },
                    { label: 'Cellular', value: cellularCount, icon: Radio, color: 'text-purple-400' },
                    { label: 'VPN/Proxy', value: vpnCount, icon: Shield, color: 'text-red-400' },
                    { label: 'Regular IP', value: regularCount, icon: ShieldOff, color: 'text-green-400' },
                ].map((item, i) => (
                    <motion.div
                        key={item.label}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.4 + (i * 0.1) }}
                        className="p-6 bg-[#0d1b2a]/80 rounded-2xl border border-white/5 backdrop-blur-xl flex items-center justify-between"
                    >
                        <div>
                            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1">{item.label}</p>
                            <p className="text-2xl font-display font-black text-white">{item.value}</p>
                        </div>
                        <item.icon className={item.color} size={24} />
                    </motion.div>
                ))}
            </div>

            {/* Detailed Visitors Table */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
                className="p-8 bg-[#0d1b2a]/80 rounded-[2rem] border border-white/5 backdrop-blur-xl"
            >
                <div className="flex items-center justify-between mb-8">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        <Users className="text-secondary" />
                        Live Visitor Stream
                    </h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="text-gray-500 text-xs font-bold uppercase tracking-widest border-b border-white/5">
                                <th className="pb-4 pt-2">Visitor</th>
                                <th className="pb-4 pt-2">Location</th>
                                <th className="pb-4 pt-2">Device</th>
                                <th className="pb-4 pt-2">Duration</th>
                                <th className="pb-4 pt-2">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {visits.slice(0, 10).map((v) => (
                                <tr key={v.id} className="group hover:bg-white/5 transition-colors">
                                    <td className="py-4">
                                        <div className="flex flex-col">
                                            <div className="flex items-center gap-2">
                                                <span className="text-white font-bold">{v.ip}</span>
                                                <CopyButton text={v.ip} label="IP" />
                                            </div>
                                            <span className="text-[10px] text-gray-500 font-mono mt-1 truncate max-w-[150px]">{v.userAgent}</span>
                                        </div>
                                    </td>
                                    <td className="py-4">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xl">{v.country === 'United States' ? '🇺🇸' : v.country === 'India' ? '🇮🇳' : '🌐'}</span>
                                            <div>
                                                <p className="text-white text-sm font-medium">{v.city || 'Unknown'}</p>
                                                <p className="text-[10px] text-gray-500 uppercase">{v.country}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="py-4">
                                        <div className="flex items-center gap-2">
                                            {v.deviceType === 'mobile' ? <Laptop size={14} className="text-gray-500" /> : <Smartphone size={14} className="text-gray-500" />}
                                            <span className="text-sm text-gray-300 capitalize">{v.deviceType}</span>
                                        </div>
                                    </td>
                                    <td className="py-4">
                                        <div className="flex items-center gap-2 text-gray-300">
                                            <Clock size={14} className="text-secondary" />
                                            <span className="text-sm">{Math.floor(v.sessionDuration / 60)}m {v.sessionDuration % 60}s</span>
                                        </div>
                                    </td>
                                    <td className="py-4 text-right">
                                        <button
                                            onClick={() => setSelectedVisitor(v)}
                                            className="px-4 py-2 rounded-lg bg-white/5 hover:bg-secondary/20 text-gray-400 hover:text-white text-xs font-bold transition-all"
                                        >
                                            Details
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </motion.div>

            {/* Visitor Detail Modal */}
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
                            initial={{ scale: 0.9, opacity: 0, y: 20 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            exit={{ scale: 0.9, opacity: 0, y: 20 }}
                            className="bg-[#0f172a] border border-white/10 p-8 rounded-[2.5rem] w-full max-w-2xl shadow-2xl relative"
                            onClick={e => e.stopPropagation()}
                        >
                            <button
                                onClick={() => setSelectedVisitor(null)}
                                className="absolute top-6 right-6 p-2 text-gray-500 hover:text-white transition-colors"
                            >
                                <X size={24} />
                            </button>

                            <div className="flex items-center gap-6 mb-8">
                                <div className="w-20 h-20 rounded-3xl bg-secondary/10 flex items-center justify-center">
                                    <Globe className="text-secondary" size={40} />
                                </div>
                                <div>
                                    <h3 className="text-3xl font-display font-black text-white">Visitor Profile</h3>
                                    <p className="text-secondary font-mono text-sm">{selectedVisitor.ip}</p>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-6 max-h-[400px] overflow-y-auto pr-4 custom-scrollbar">
                                <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                                    <p className="text-xs text-gray-500 font-bold uppercase mb-2">Location</p>
                                    <div className="flex items-center gap-2">
                                        <MapPin size={16} className="text-secondary" />
                                        <span className="text-white font-medium">{selectedVisitor.city}, {selectedVisitor.country}</span>
                                    </div>
                                    <p className="text-[10px] text-gray-500 mt-1">{selectedVisitor.region}</p>
                                </div>
                                <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                                    <p className="text-xs text-gray-500 font-bold uppercase mb-2">ISP / Network</p>
                                    <div className="flex items-center gap-2">
                                        <Wifi size={16} className="text-blue-400" />
                                        <span className="text-white font-medium truncate">{selectedVisitor.isp}</span>
                                    </div>
                                    <p className="text-[10px] text-gray-500 mt-1 uppercase">{selectedVisitor.connectionType}</p>
                                </div>
                                <div className="col-span-2 p-4 bg-white/5 rounded-2xl border border-white/5">
                                    <p className="text-xs text-gray-500 font-bold uppercase mb-2">Browser Agent</p>
                                    <p className="text-xs text-gray-400 font-mono italic break-all leading-relaxed">{selectedVisitor.userAgent}</p>
                                </div>
                                <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                                    <p className="text-xs text-gray-500 font-bold uppercase mb-2">Geolocation</p>
                                    <div className="flex items-center gap-2 text-gray-300">
                                        <Map size={16} className="text-orange-400" />
                                        <span className="text-sm font-mono">{selectedVisitor.latitude}°N, {selectedVisitor.longitude}°E</span>
                                    </div>
                                </div>
                                <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                                    <p className="text-xs text-gray-500 font-bold uppercase mb-2">Session Insights</p>
                                    <div className="flex items-center gap-2 text-gray-300">
                                        <Clock size={16} className="text-purple-400" />
                                        <span className="text-sm">Page views: {selectedVisitor.pageViewed}</span>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Export Modal */}
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
                            className="bg-[#0f172a] border border-white/10 p-8 rounded-[2rem] w-full max-w-md shadow-2xl relative"
                        >
                            <h3 className="text-2xl font-display font-black text-white mb-2">Export Data</h3>
                            <p className="text-gray-400 text-sm mb-8">Choose your preferred format for analytics export</p>

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
