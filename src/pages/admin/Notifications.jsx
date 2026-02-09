import { useState, useEffect } from 'react';
import {
    Bell, Shield, AlertTriangle, CheckCircle, XCircle, RefreshCw,
    Trash2, Filter, Clock, Globe, User, AlertOctagon, Info, ChevronDown, MessageSquare
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { adminFetch, adminJsonFetch } from '../../utils/adminApi';

const Notifications = () => {
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [filter, setFilter] = useState('all');
    const [showFilterMenu, setShowFilterMenu] = useState(false);
    const [appealActionState, setAppealActionState] = useState({});

    useEffect(() => {
        fetchNotifications({ silent: true });
        const interval = setInterval(() => fetchNotifications({ silent: true }), 30000);
        return () => clearInterval(interval);
    }, []);

    const fetchNotifications = async ({ silent = false } = {}) => {
        if (!silent) setIsRefreshing(true);
        try {
            const res = await adminFetch('/api/notifications');
            const data = await res.json();
            setNotifications(data.notifications || []);
        } catch (err) {
            console.error('Notifications fetch error:', err);
        } finally {
            setLoading(false);
            setIsRefreshing(false);
        }
    };

    const clearNotification = async (id) => {
        try {
            await adminFetch(`/api/notifications/${id}`, {
                method: 'DELETE'
            });
            setNotifications(prev => prev.filter(n => n.id !== id));
        } catch (err) {
            console.error('Clear notification error:', err);
        }
    };

    const clearAll = async () => {
        try {
            await adminFetch('/api/notifications/clear', {
                method: 'POST'
            });
            setNotifications([]);
        } catch (err) {
            console.error('Clear all error:', err);
        }
    };

    const markAsRead = async (id) => {
        try {
            await adminFetch(`/api/notifications/${id}/read`, {
                method: 'POST'
            });
            setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
        } catch (err) {
            console.error('Mark read error:', err);
        }
    };

    const handleAppealDecision = async (notification, decision) => {
        const appealId = notification?.metadata?.appealId;
        if (!appealId) return;

        setAppealActionState(prev => ({
            ...prev,
            [notification.id]: {
                loading: true,
                error: '',
                decision
            }
        }));

        try {
            const { response, data } = await adminJsonFetch(`/api/security/appeals/${appealId}/decision`, {
                method: 'POST',
                body: { decision }
            });

            if (!response.ok || !data?.success) {
                throw new Error(data?.error || 'Failed to process appeal decision');
            }

            setNotifications(prev => prev.map((item) => {
                if (item.id !== notification.id) return item;
                return {
                    ...item,
                    read: true,
                    metadata: {
                        ...(item.metadata || {}),
                        status: 'resolved',
                        decision
                    }
                };
            }));

            setAppealActionState(prev => ({
                ...prev,
                [notification.id]: {
                    loading: false,
                    error: '',
                    decision
                }
            }));
            fetchNotifications({ silent: true });
        } catch (err) {
            setAppealActionState(prev => ({
                ...prev,
                [notification.id]: {
                    loading: false,
                    error: err?.message || 'Failed to process appeal decision',
                    decision: ''
                }
            }));
        }
    };

    const getIcon = (type) => {
        const icons = {
            'security': Shield,
            'attack_blocked': CheckCircle,
            'attack_failed': XCircle,
            'error': AlertTriangle,
            'warning': AlertOctagon,
            'info': Info,
            'visitor': User,
            'appeal': MessageSquare
        };
        return icons[type] || Bell;
    };

    const getColor = (type) => {
        const colors = {
            'security': 'text-blue-400 bg-blue-500/10',
            'attack_blocked': 'text-green-400 bg-green-500/10',
            'attack_failed': 'text-red-400 bg-red-500/10',
            'error': 'text-orange-400 bg-orange-500/10',
            'warning': 'text-yellow-400 bg-yellow-500/10',
            'info': 'text-cyan-400 bg-cyan-500/10',
            'visitor': 'text-purple-400 bg-purple-500/10',
            'appeal': 'text-teal-300 bg-teal-500/10'
        };
        return colors[type] || 'text-gray-400 bg-gray-500/10';
    };

    const getBorderColor = (type, read) => {
        if (read) return 'border-white/5';
        const borders = {
            'security': 'border-blue-500/30',
            'attack_blocked': 'border-green-500/30',
            'attack_failed': 'border-red-500/30',
            'error': 'border-orange-500/30',
            'warning': 'border-yellow-500/30',
            'info': 'border-cyan-500/30',
            'visitor': 'border-purple-500/30',
            'appeal': 'border-teal-500/30'
        };
        return borders[type] || 'border-white/10';
    };

    const filteredNotifications = notifications.filter(n => {
        if (filter === 'all') return true;
        if (filter === 'unread') return !n.read;
        return n.type === filter;
    });

    const unreadCount = notifications.filter(n => !n.read).length;

    const filterOptions = [
        { value: 'all', label: 'All Notifications' },
        { value: 'unread', label: 'Unread Only' },
        { value: 'security', label: 'Security' },
        { value: 'attack_blocked', label: 'Attacks Blocked' },
        { value: 'attack_failed', label: 'Security Breaches' },
        { value: 'appeal', label: 'Appeals' },
        { value: 'error', label: 'Errors' },
        { value: 'warning', label: 'Warnings' }
    ];

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="text-white flex items-center gap-3">
                    <RefreshCw className="animate-spin" size={24} />
                    <span>Loading Notifications...</span>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 pb-12">
            {/* Header */}
            <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl sm:text-4xl md:text-5xl font-display font-black text-white mb-2 flex flex-wrap items-center gap-3">
                        Notifications
                        {unreadCount > 0 && (
                            <motion.span
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                className="text-lg px-3 py-1 bg-red-500 text-white rounded-full"
                            >
                                {unreadCount}
                            </motion.span>
                        )}
                    </h1>
                    <p className="text-gray-400 flex items-center gap-2">
                        <Bell size={16} />
                        Security alerts, system events, and important updates
                    </p>
                </div>
                <div className="flex flex-wrap gap-3 w-full md:w-auto">
                    {/* Filter Dropdown */}
                    <div className="relative w-full sm:w-auto">
                        <motion.button
                            onClick={() => setShowFilterMenu(!showFilterMenu)}
                            className="w-full flex items-center justify-between sm:justify-start gap-2 px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-gray-300 hover:text-white hover:border-white/30 transition-all"
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                        >
                            <Filter size={16} />
                            {filterOptions.find(f => f.value === filter)?.label}
                            <ChevronDown size={14} className={`transition-transform ${showFilterMenu ? 'rotate-180' : ''}`} />
                        </motion.button>
                        <AnimatePresence>
                            {showFilterMenu && (
                                <motion.div
                                    initial={{ opacity: 0, y: -10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    className="absolute top-full mt-2 right-0 w-full sm:w-56 bg-[#0d1b2a] border border-white/10 rounded-xl overflow-hidden z-50 shadow-xl"
                                >
                                    {filterOptions.map(opt => (
                                        <button
                                            key={opt.value}
                                            onClick={() => { setFilter(opt.value); setShowFilterMenu(false); }}
                                            className={`w-full px-4 py-3 text-left hover:bg-white/5 transition-colors ${filter === opt.value ? 'bg-secondary/10 text-secondary' : 'text-gray-300'}`}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>

                    {/* Clear All */}
                    {notifications.length > 0 && (
                        <motion.button
                            onClick={clearAll}
                            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 hover:bg-red-500/20 transition-all"
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                        >
                            <Trash2 size={16} />
                            Clear All
                        </motion.button>
                    )}

                    {/* Refresh */}
                    <motion.button
                        onClick={() => fetchNotifications()}
                        className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-3 bg-secondary/10 border border-secondary/30 rounded-xl text-secondary hover:bg-secondary/20 hover:border-secondary/50 transition-all shadow-[0_0_0_rgba(0,243,255,0)] hover:shadow-[0_0_18px_rgba(0,243,255,0.22)]"
                        whileHover={{ scale: 1.03, y: -1 }}
                        whileTap={{ scale: 0.98 }}
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
            </header>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                {[
                    { label: 'Total', value: notifications.length, icon: Bell, color: 'from-cyan-500 to-blue-500' },
                    { label: 'Unread', value: unreadCount, icon: AlertTriangle, color: 'from-red-500 to-orange-500' },
                    { label: 'Blocked Attacks', value: notifications.filter(n => n.type === 'attack_blocked').length, icon: Shield, color: 'from-green-500 to-emerald-500' },
                    { label: 'Errors', value: notifications.filter(n => n.type === 'error').length, icon: XCircle, color: 'from-orange-500 to-red-500' }
                ].map((stat, i) => (
                    <motion.div
                        key={stat.label}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1 }}
                        className="relative overflow-hidden p-4 sm:p-5 rounded-2xl border border-white/5 bg-[#0d1b2a]/80 backdrop-blur-sm"
                    >
                        <div className={`absolute -top-4 -right-4 w-20 h-20 bg-gradient-to-br ${stat.color} opacity-20 rounded-full blur-xl`}></div>
                        <stat.icon size={18} className="text-gray-500 mb-2" />
                        <p className="text-2xl md:text-3xl font-display font-black text-white">{stat.value}</p>
                        <span className="text-xs font-bold uppercase tracking-wider text-gray-500">{stat.label}</span>
                    </motion.div>
                ))}
            </div>

            {/* Notifications List */}
            <div className="space-y-3">
                {filteredNotifications.length === 0 ? (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-center py-20 bg-[#0d1b2a]/50 rounded-2xl border border-white/5"
                    >
                        <Bell size={48} className="mx-auto text-gray-600 mb-4" />
                        <p className="text-gray-400 text-lg">No notifications to display</p>
                        <p className="text-gray-600 text-sm mt-2">Security events and alerts will appear here</p>
                    </motion.div>
                ) : (
                    filteredNotifications.map((notification, idx) => {
                        const Icon = getIcon(notification.type);
                        const colorClass = getColor(notification.type);
                        const borderClass = getBorderColor(notification.type, notification.read);
                        const isAppeal = notification.type === 'appeal' && notification?.metadata?.appealId;
                        const appealStatus = notification?.metadata?.status || 'pending';
                        const appealDecision = notification?.metadata?.decision || null;
                        const appealState = appealActionState[notification.id] || { loading: false, error: '', decision: '' };

                        return (
                            <motion.div
                                key={notification.id}
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: idx * 0.05 }}
                                className={`p-4 bg-[#0d1b2a]/80 rounded-xl border ${borderClass} hover:bg-[#0d1b2a] transition-all group ${!notification.read ? 'ring-1 ring-white/5' : ''}`}
                            >
                                <div className="flex flex-col sm:flex-row items-start gap-4">
                                    <div className={`p-3 rounded-lg ${colorClass}`}>
                                        <Icon size={20} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <h4 className={`font-bold ${notification.read ? 'text-gray-300' : 'text-white'}`}>
                                                {notification.title}
                                            </h4>
                                            {isAppeal && (
                                                <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                                                    appealStatus === 'resolved'
                                                        ? 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10'
                                                        : 'text-amber-300 border-amber-500/40 bg-amber-500/10'
                                                }`}>
                                                    {appealStatus === 'resolved' ? `resolved${appealDecision ? `: ${appealDecision}` : ''}` : 'pending review'}
                                                </span>
                                            )}
                                            {!notification.read && (
                                                <span className="w-2 h-2 bg-secondary rounded-full"></span>
                                            )}
                                        </div>
                                        <p className="text-gray-400 text-sm mb-2">{notification.message}</p>
                                        <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
                                            <span className="flex items-center gap-1">
                                                <Clock size={12} />
                                                {new Date(notification.timestamp).toLocaleString()}
                                            </span>
                                            {notification.ip && (
                                                <span className="flex items-center gap-1">
                                                    <Globe size={12} />
                                                    {notification.ip}
                                                </span>
                                            )}
                                        </div>
                                        {isAppeal && appealStatus !== 'resolved' && (
                                            <div className="mt-3 flex flex-col gap-2">
                                                <div className="flex flex-wrap gap-2">
                                                    <motion.button
                                                        onClick={() => handleAppealDecision(notification, 'unblock')}
                                                        disabled={appealState.loading}
                                                        className="px-3 py-2 text-sm font-semibold rounded-lg bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-60 disabled:cursor-not-allowed"
                                                        whileHover={{ scale: appealState.loading ? 1 : 1.02 }}
                                                        whileTap={{ scale: appealState.loading ? 1 : 0.98 }}
                                                    >
                                                        {appealState.loading && appealState.decision === 'unblock' ? 'Processing...' : 'Unblock IP'}
                                                    </motion.button>
                                                    <motion.button
                                                        onClick={() => handleAppealDecision(notification, 'keep')}
                                                        disabled={appealState.loading}
                                                        className="px-3 py-2 text-sm font-semibold rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-300 hover:bg-amber-500/25 disabled:opacity-60 disabled:cursor-not-allowed"
                                                        whileHover={{ scale: appealState.loading ? 1 : 1.02 }}
                                                        whileTap={{ scale: appealState.loading ? 1 : 0.98 }}
                                                    >
                                                        {appealState.loading && appealState.decision === 'keep' ? 'Processing...' : 'Keep Blocked'}
                                                    </motion.button>
                                                </div>
                                                {appealState.error && (
                                                    <p className="text-xs text-red-300">{appealState.error}</p>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                    <div className="self-end sm:self-auto flex items-center gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                        {!notification.read && (
                                            <motion.button
                                                onClick={() => markAsRead(notification.id)}
                                                className="p-2 bg-white/5 hover:bg-secondary/20 rounded-lg transition-colors"
                                                whileHover={{ scale: 1.1 }}
                                                whileTap={{ scale: 0.9 }}
                                                title="Mark as read"
                                            >
                                                <CheckCircle size={16} className="text-gray-400 hover:text-secondary" />
                                            </motion.button>
                                        )}
                                        <motion.button
                                            onClick={() => clearNotification(notification.id)}
                                            className="p-2 bg-white/5 hover:bg-red-500/20 rounded-lg transition-colors"
                                            whileHover={{ scale: 1.1 }}
                                            whileTap={{ scale: 0.9 }}
                                            title="Delete"
                                        >
                                            <Trash2 size={16} className="text-gray-400 hover:text-red-400" />
                                        </motion.button>
                                    </div>
                                </div>
                            </motion.div>
                        );
                    })
                )}
            </div>
        </div>
    );
};

export default Notifications;
