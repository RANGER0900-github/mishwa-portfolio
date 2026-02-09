import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Save, Trash2, Shield, AlertTriangle } from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import { adminFetch } from '../../utils/adminApi';

const Settings = () => {
    const [passwords, setPasswords] = useState({
        new: '',
        confirm: ''
    });
    const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
    const [isClearingAnalytics, setIsClearingAnalytics] = useState(false);
    const [analyticsCount, setAnalyticsCount] = useState(0);
    const [countLoading, setCountLoading] = useState(true);

    const fetchAnalyticsCount = async () => {
        setCountLoading(true);
        try {
            const res = await adminFetch('/api/settings/analytics-count');
            const data = await res.json();
            if (res.ok && data.success) {
                setAnalyticsCount(Number(data.total || 0));
                return;
            }
            setAnalyticsCount(0);
        } catch {
            setAnalyticsCount(0);
        } finally {
            setCountLoading(false);
        }
    };

    useEffect(() => {
        fetchAnalyticsCount();
    }, []);

    const handlePasswordChange = async (e) => {
        e.preventDefault();
        if (!passwords.new || passwords.new.length < 8) {
            toast.error('Use at least 8 characters for better security.');
            return;
        }

        if (passwords.new !== passwords.confirm) {
            toast.error("New passwords don't match!");
            return;
        }

        setIsUpdatingPassword(true);

        try {
            const res = await adminFetch('/api/settings/password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: 'admin',
                    newPassword: passwords.new
                })
            });

            const data = await res.json();
            if (res.ok && data.success) {
                toast.success('Password updated successfully.');
                setPasswords({ new: '', confirm: '' });
                return;
            }

            toast.error(data?.message || data?.error || 'Failed to update password.');
        } catch (error) {
            toast.error('Password update failed. Please retry.');
        } finally {
            setIsUpdatingPassword(false);
        }
    };

    const handleClearAnalytics = async () => {
        if (!window.confirm(`Delete ${analyticsCount} analytics records? This cannot be undone.`)) return;

        setIsClearingAnalytics(true);

        try {
            const res = await adminFetch('/api/settings/clear-analytics', {
                method: 'POST'
            });
            const data = await res.json();

            if (res.status === 401) {
                toast.error('Session expired. Please login again.');
                window.location.href = '/admin/login';
                return;
            }

            if (res.ok && data.success) {
                toast.success(data.message || 'Analytics data cleared.');
                fetchAnalyticsCount();
                return;
            }

            toast.error(data?.error || 'Failed to clear analytics.');
        } catch (error) {
            toast.error('Failed to clear analytics.');
        } finally {
            setIsClearingAnalytics(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto space-y-6 sm:space-y-8 pb-4">
            <Toaster position="top-center" toastOptions={{
                style: {
                    background: '#112240',
                    color: '#fff',
                    border: '1px solid rgba(100,255,218,0.2)'
                }
            }} />

            <header className="mb-8">
                <h1 className="text-3xl sm:text-4xl font-display font-bold text-white mb-2">Settings<span className="text-primary">.</span></h1>
                <p className="text-gray-400">Manage security and system data.</p>
            </header>

            {/* Security Section */}
            <motion.section
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-[#112240]/50 backdrop-blur-md border border-white/5 p-4 sm:p-8 rounded-3xl"
            >
                <div className="flex items-center gap-4 mb-6">
                    <div className="p-3 bg-primary/10 rounded-xl text-primary">
                        <Shield size={24} />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-white">Security</h2>
                        <p className="text-sm text-gray-400">Update your admin access credentials</p>
                    </div>
                </div>

                <form onSubmit={handlePasswordChange} className="space-y-4 max-w-md">
                    <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">New Password</label>
                        <input
                            type="password"
                            value={passwords.new}
                            onChange={e => setPasswords({ ...passwords, new: e.target.value })}
                            className="w-full bg-[#0a192f] border border-white/10 rounded-lg px-4 py-3 text-white focus:border-primary focus:outline-none transition-colors"
                            placeholder="••••••••"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1">Confirm Password</label>
                        <input
                            type="password"
                            value={passwords.confirm}
                            onChange={e => setPasswords({ ...passwords, confirm: e.target.value })}
                            className="w-full bg-[#0a192f] border border-white/10 rounded-lg px-4 py-3 text-white focus:border-primary focus:outline-none transition-colors"
                            placeholder="••••••••"
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={isUpdatingPassword}
                        className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-primary text-black font-bold rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-60"
                    >
                        <Save size={18} />
                        {isUpdatingPassword ? 'Updating...' : 'Update Password'}
                    </button>
                </form>
            </motion.section>

            {/* Danger Zone */}
            <motion.section
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="bg-red-500/5 backdrop-blur-md border border-red-500/20 p-4 sm:p-8 rounded-3xl"
            >
                <div className="flex items-center gap-4 mb-6">
                    <div className="p-3 bg-red-500/10 rounded-xl text-red-500">
                        <AlertTriangle size={24} />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-white">Danger Zone</h2>
                        <p className="text-sm text-gray-400">Irreversible actions</p>
                    </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <h3 className="text-white font-bold">Clear Analytics Data</h3>
                        <p className="text-sm text-gray-400">
                            {countLoading ? 'Checking data size...' : `This will remove ${analyticsCount} analytics records.`}
                        </p>
                    </div>
                    <button
                        onClick={handleClearAnalytics}
                        disabled={isClearingAnalytics || countLoading}
                        className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-red-500/10 text-red-500 border border-red-500/20 font-bold rounded-lg hover:bg-red-500 hover:text-white transition-all disabled:opacity-60"
                    >
                        <Trash2 size={18} />
                        {isClearingAnalytics ? 'Clearing...' : 'Clear Data'}
                    </button>
                </div>
            </motion.section>
        </div>
    );
};

export default Settings;
