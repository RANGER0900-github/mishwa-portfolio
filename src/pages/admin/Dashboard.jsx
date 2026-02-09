import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
    Users, Eye, Clock, Globe, TrendingUp,
    RefreshCw, ArrowUpRight, Smartphone, Monitor, Zap
} from 'lucide-react';
import {
    AreaChart, Area, XAxis, YAxis, Tooltip as RechartsTooltip,
    ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';
import { Link } from 'react-router-dom';
import { adminFetch } from '../../utils/adminApi';

const Dashboard = () => {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);

    useEffect(() => {
        fetchData({ silent: true });
        const interval = setInterval(() => fetchData({ silent: true }), 15000); // Refresh every 15s
        return () => clearInterval(interval);
    }, []);

    const fetchData = async ({ silent = false } = {}) => {
        if (!silent) setIsRefreshing(true);
        try {
            const res = await adminFetch('/api/analytics');
            const apiData = await res.json();
            setData(apiData);
        } catch (err) {
            console.error("Dashboard Error:", err);
        } finally {
            setLoading(false);
            setIsRefreshing(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="flex items-center gap-3 text-gray-400">
                    <RefreshCw className="animate-spin" size={24} />
                    <span className="font-medium">Loading Dashboard...</span>
                </div>
            </div>
        );
    }

    const visits = data?.visits || [];
    const stats = data?.stats || {};

    // Calculate real stats
    const totalVisits = stats.total_visitors ?? visits.length;
    const uniqueVisitors = stats.unique_visitors ?? new Set(visits.map(v => v.ip)).size;
    const today = new Date().toISOString().slice(0, 10);
    const todayVisits = stats.today ?? visits.filter(v => v.timestamp?.startsWith(today)).length;

    // Average session duration
    const sessionsWithDuration = visits.filter(v => (Number(v.sessionDuration) || 0) >= 0);
    const avgDuration = typeof stats.average_session_seconds === 'number'
        ? Math.max(0, Math.round(stats.average_session_seconds))
        : (sessionsWithDuration.length > 0
            ? Math.round(sessionsWithDuration.reduce((sum, v) => sum + (Number(v.sessionDuration) || 0), 0) / sessionsWithDuration.length)
            : 0);

    // Device breakdown
    const mobileCount = stats.devices?.mobile ?? visits.filter(v => v.deviceType === 'mobile').length;
    const desktopCount = stats.devices?.desktop ?? visits.filter(v => v.deviceType === 'desktop').length;

    // Top countries
    const topCountries = Object.entries(stats.countries || {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

    // Last 7 days chart
    const getLast7Days = () => {
        const days = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            days.push(d.toISOString().slice(0, 10));
        }
        return days;
    };

    const chartData = Array.isArray(stats.daily_visits) && stats.daily_visits.length > 0
        ? stats.daily_visits.map((row) => ({
            name: new Date(row.date).toLocaleDateString('en', { weekday: 'short' }),
            visits: row.count
        }))
        : getLast7Days().map((date) => ({
            name: new Date(date).toLocaleDateString('en', { weekday: 'short' }),
            visits: visits.filter((v) => v.timestamp?.startsWith(date)).length
        }));

    // Device pie chart data
    const deviceData = [
        { name: 'Mobile', value: mobileCount, color: '#64ffda' },
        { name: 'Desktop', value: desktopCount, color: '#0070f3' }
    ];

    const statCards = [
        {
            label: 'Total Visits',
            value: totalVisits,
            icon: Eye,
            color: 'from-cyan-500 to-blue-500',
            bg: 'bg-cyan-500/10'
        },
        {
            label: 'Unique Visitors',
            value: uniqueVisitors,
            icon: Users,
            color: 'from-purple-500 to-pink-500',
            bg: 'bg-purple-500/10'
        },
        {
            label: 'Today',
            value: todayVisits,
            icon: TrendingUp,
            color: 'from-green-400 to-emerald-500',
            bg: 'bg-green-500/10'
        },
        {
            label: 'Avg. Session',
            value: `${Math.floor(avgDuration / 60)}m ${avgDuration % 60}s`,
            icon: Clock,
            color: 'from-orange-400 to-amber-500',
            bg: 'bg-orange-500/10'
        }
    ];

    return (
        <div className="space-y-8">
            {/* Header */}
            <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl sm:text-4xl md:text-5xl font-display font-black text-white mb-2">
                        Dashboard<span className="text-secondary">.</span>
                    </h1>
                    <p className="text-gray-400 flex items-center gap-2">
                        <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
                        Real-time analytics overview
                    </p>
                </div>
                <motion.button
                    whileHover={{ scale: 1.03, y: -1 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => fetchData()}
                    className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-xl text-gray-400 hover:text-white hover:border-secondary/40 hover:bg-secondary/10 transition-all shadow-[0_0_0_rgba(0,243,255,0)] hover:shadow-[0_0_18px_rgba(0,243,255,0.22)]"
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
            </header>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {statCards.map((stat, i) => (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1 }}
                        key={stat.label}
                        className={`relative overflow-hidden p-6 rounded-2xl border border-white/5 ${stat.bg} backdrop-blur-sm group hover:border-white/20 transition-all`}
                    >
                        <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${stat.color} opacity-10 rounded-full blur-2xl group-hover:opacity-20 transition-opacity`}></div>
                        <div className="relative z-10">
                            <div className="flex items-center justify-between mb-4">
                                <span className="text-xs font-bold uppercase tracking-wider text-gray-400">{stat.label}</span>
                                <stat.icon size={18} className="text-gray-500" />
                            </div>
                            <p className="text-2xl sm:text-3xl font-display font-black text-white">{stat.value}</p>
                        </div>
                    </motion.div>
                ))}
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Traffic Trend */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="lg:col-span-2 p-6 bg-[#0d1b2a]/80 rounded-2xl border border-white/5 backdrop-blur-sm"
                >
                    <div className="flex items-center justify-between mb-6">
                        <h3 className="text-lg font-bold text-white">Traffic Trend</h3>
                        <span className="text-xs text-gray-500">Last 7 days</span>
                    </div>
                    <div className="h-[200px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={chartData}>
                                <defs>
                                    <linearGradient id="colorVisits" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#64ffda" stopOpacity={0.3} />
                                        <stop offset="95%" stopColor="#64ffda" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <XAxis dataKey="name" stroke="#4a5568" fontSize={11} tickLine={false} axisLine={false} />
                                <YAxis stroke="#4a5568" fontSize={11} tickLine={false} axisLine={false} />
                                <RechartsTooltip
                                    contentStyle={{ backgroundColor: '#0a192f', borderColor: '#1e3a5f', borderRadius: '8px' }}
                                    itemStyle={{ color: '#64ffda' }}
                                />
                                <Area type="monotone" dataKey="visits" stroke="#64ffda" strokeWidth={2} fillOpacity={1} fill="url(#colorVisits)" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </motion.div>

                {/* Device Breakdown */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.1 }}
                    className="p-6 bg-[#0d1b2a]/80 rounded-2xl border border-white/5 backdrop-blur-sm"
                >
                    <h3 className="text-lg font-bold text-white mb-4">Devices</h3>
                    <div className="h-[160px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={deviceData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={40}
                                    outerRadius={60}
                                    paddingAngle={5}
                                    dataKey="value"
                                >
                                    {deviceData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Pie>
                                <RechartsTooltip />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="flex justify-center gap-6 mt-2">
                        <div className="flex items-center gap-2">
                            <Smartphone size={14} className="text-secondary" />
                            <span className="text-sm text-gray-400">{mobileCount}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Monitor size={14} className="text-[#0070f3]" />
                            <span className="text-sm text-gray-400">{desktopCount}</span>
                        </div>
                    </div>
                </motion.div>
            </div>

            {/* Bottom Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Top Countries */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="p-6 bg-[#0d1b2a]/80 rounded-2xl border border-white/5 backdrop-blur-sm"
                >
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-bold text-white flex items-center gap-2">
                            <Globe size={18} />
                            Top Countries
                        </h3>
                    </div>
                    <div className="space-y-3">
                        {topCountries.length > 0 ? topCountries.map(([country, count], i) => (
                            <div key={country} className="flex items-center justify-between gap-3 min-w-0">
                                <span className="text-gray-300 truncate">{country}</span>
                                <div className="flex items-center gap-2 sm:gap-3">
                                    <div className="w-20 sm:w-24 h-2 bg-white/5 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-gradient-to-r from-secondary to-primary rounded-full"
                                            style={{ width: `${(count / (topCountries[0]?.[1] || 1)) * 100}%` }}
                                        ></div>
                                    </div>
                                    <span className="text-sm text-gray-500 w-8 text-right">{count}</span>
                                </div>
                            </div>
                        )) : (
                            <p className="text-gray-500 text-sm">No country data yet</p>
                        )}
                    </div>
                </motion.div>

                {/* Quick Actions */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="p-6 bg-[#0d1b2a]/80 rounded-2xl border border-white/5 backdrop-blur-sm"
                >
                    <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                        <Zap size={18} />
                        Quick Actions
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Link
                            to="/admin/analytics"
                            className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5 hover:border-secondary/50 hover:bg-secondary/5 transition-all group"
                        >
                            <span className="text-gray-300 group-hover:text-white">Full Analytics</span>
                            <ArrowUpRight size={16} className="text-gray-500 group-hover:text-secondary" />
                        </Link>
                        <Link
                            to="/admin/content"
                            className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5 hover:border-primary/50 hover:bg-primary/5 transition-all group"
                        >
                            <span className="text-gray-300 group-hover:text-white">Manage Content</span>
                            <ArrowUpRight size={16} className="text-gray-500 group-hover:text-primary" />
                        </Link>
                        <Link
                            to="/admin/settings"
                            className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5 hover:border-purple-500/50 hover:bg-purple-500/5 transition-all group"
                        >
                            <span className="text-gray-300 group-hover:text-white">Settings</span>
                            <ArrowUpRight size={16} className="text-gray-500 group-hover:text-purple-400" />
                        </Link>
                        <a
                            href="/"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-between p-4 bg-white/5 rounded-xl border border-white/5 hover:border-orange-500/50 hover:bg-orange-500/5 transition-all group"
                        >
                            <span className="text-gray-300 group-hover:text-white">View Site</span>
                            <ArrowUpRight size={16} className="text-gray-500 group-hover:text-orange-400" />
                        </a>
                    </div>
                </motion.div>
            </div>
        </div>
    );
};

export default Dashboard;
