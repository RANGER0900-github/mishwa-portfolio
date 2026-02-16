import { useState, useEffect } from 'react';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { LayoutDashboard, Film, Users, Settings, LogOut, Bell, Menu, X } from 'lucide-react';
import { adminFetch } from '../utils/adminApi';
import { useDeviceProfile } from '../context/DeviceProfileContext';

const AdminLayout = () => {
    const { perfMode } = useDeviceProfile();
    const isLite = perfMode === 'lite';
    const navigate = useNavigate();
    const location = useLocation();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [isValidating, setIsValidating] = useState(true);
    const [isCompactScreen, setIsCompactScreen] = useState(false);

    useEffect(() => {
        const validateToken = async () => {
            try {
                const response = await adminFetch('/api/validate-token', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });
                if (!response.ok) {
                    navigate('/admin/login');
                } else {
                    setIsValidating(false);
                }
            } catch (error) {
                console.error('Token validation failed:', error);
                navigate('/admin/login');
            } finally {
                setIsValidating(false);
            }
        };
        
        validateToken();
    }, [navigate]);

    useEffect(() => {
        const updateScreenType = () => {
            setIsCompactScreen(window.innerWidth < 480);
        };

        updateScreenType();
        window.addEventListener('resize', updateScreenType);
        return () => window.removeEventListener('resize', updateScreenType);
    }, []);

    useEffect(() => {
        setIsMobileMenuOpen(false);
    }, [location.pathname]);

    useEffect(() => {
        if (!window.lenis) return undefined;
        if (isMobileMenuOpen) {
            window.lenis.stop();
        } else {
            window.lenis.start();
        }

        return () => {
            if (window.lenis) {
                window.lenis.start();
            }
        };
    }, [isMobileMenuOpen]);

    const handleLogout = async () => {
        try {
            await adminFetch('/api/logout', { method: 'POST' });
        } catch (error) {
            // Ignore logout API failures and continue redirect.
        }
        navigate('/admin/login');
    };

    const navItems = [
        { icon: LayoutDashboard, label: 'Dashboard', path: '/admin' },
        { icon: Film, label: 'Content CMS', path: '/admin/content' },
        { icon: Users, label: 'Analytics', path: '/admin/analytics' },
        { icon: Bell, label: 'Notifications', path: '/admin/notifications' },
        { icon: Settings, label: 'Settings', path: '/admin/settings' },
    ];

    // Show loading state while validating token
    if (isValidating) {
        return (
            <div className="flex min-h-screen bg-black text-white items-center justify-center">
                <div className="text-center">
                    <div className="inline-block animate-spin rounded-full h-12 w-12 border-2 border-secondary border-t-transparent mb-4"></div>
                    <p className="text-white/60">Validating session...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex min-h-screen bg-black text-white selection:bg-secondary selection:text-black font-sans overflow-x-clip">
            {/* Background Ambience */}
            {!isLite && (
                <div className="fixed inset-0 z-0 pointer-events-none">
                    <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-primary/20 rounded-full blur-[120px] opacity-30"></div>
                    <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-secondary/20 rounded-full blur-[120px] opacity-30"></div>
                </div>
            )}

            {/* Mobile Header */}
            <div className={`md:hidden fixed top-0 left-0 right-0 z-[60] bg-black/80 backdrop-blur-xl border-b border-white/10 flex items-center justify-between ${isCompactScreen ? 'px-4 pt-[calc(env(safe-area-inset-top,0)+0.65rem)] pb-3' : 'px-5 pt-[calc(env(safe-area-inset-top,0)+0.85rem)] pb-4'}`}>
                <h1 className="font-display font-black text-2xl tracking-tighter italic">
                    MISHWA<span className="text-secondary text-3xl">.</span>
                </h1>
                <button
                    onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                    className="p-2 text-white hover:bg-white/10 rounded-xl transition-colors"
                    aria-label={isMobileMenuOpen ? 'Close menu' : 'Open menu'}
                >
                    {isMobileMenuOpen ? <X /> : <Menu />}
                </button>
            </div>

            {/* Mobile Sidebar Overlay */}
            <AnimatePresence>
                {isMobileMenuOpen && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setIsMobileMenuOpen(false)}
                        className="md:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-[70]"
                    />
                )}
            </AnimatePresence>

            {/* Mobile Sidebar Content */}
            <motion.div
                initial={{ x: "-100%" }}
                animate={{ x: isMobileMenuOpen ? 0 : "-100%" }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                className="md:hidden fixed top-0 left-0 bottom-0 w-[88%] max-w-sm bg-[#0d1b2a] border-r border-white/10 z-[80] px-6 pt-[calc(env(safe-area-inset-top,0)+1rem)] pb-[calc(env(safe-area-inset-bottom,0)+1rem)] flex flex-col"
            >
                <div className="mb-12">
                    <h1 className="font-display font-black text-3xl tracking-tighter italic">
                        MISHWA<span className="text-secondary text-4xl">.</span>
                    </h1>
                </div>

                <nav className="flex-1 space-y-4">
                    {navItems.map((item) => {
                        const isActive = location.pathname === item.path;
                        return (
                            <Link
                                key={item.path}
                                to={item.path}
                                onClick={() => setIsMobileMenuOpen(false)}
                                className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${isActive ? 'bg-secondary text-black font-bold' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                            >
                                <item.icon size={20} />
                                <span>{item.label}</span>
                            </Link>
                        );
                    })}
                </nav>

                <button
                    onClick={handleLogout}
                    className="flex items-center gap-3 px-4 py-3 text-red-500 hover:bg-red-500/10 rounded-xl transition-all font-bold mt-auto"
                >
                    <LogOut size={20} />
                    Logout
                </button>
            </motion.div>

            {/* Sidebar (Desktop) */}
            <motion.div
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                className="hidden md:flex w-72 border-r border-white/10 p-6 flex-col z-20 backdrop-blur-xl bg-black/50 fixed h-full"
            >
                <div className="mb-12 pl-4">
                    <h1 className="font-display font-black text-3xl tracking-tighter italic">
                        MISHWA<span className="text-secondary text-4xl">.</span>
                    </h1>
                    <p className="text-xs font-bold text-gray-500 tracking-[0.3em] mt-1 uppercase">Admin Panel</p>
                </div>

                <nav className="flex-1 space-y-3">
                    {navItems.map((item) => {
                        const isActive = location.pathname === item.path;
                        return (
                            <Link
                                key={item.path}
                                to={item.path}
                                className={`group relative flex items-center gap-4 px-6 py-4 rounded-2xl transition-all duration-300 overflow-hidden ${isActive ? 'text-black' : 'text-gray-400 hover:text-white'
                                    }`}
                            >
                                {isActive && (
                                    <motion.div
                                        layoutId="adminNavHighlight"
                                        className="absolute inset-0 bg-gradient-to-r from-primary to-secondary"
                                        initial={false}
                                        transition={{ type: "spring", stiffness: 500, damping: 30 }}
                                    />
                                )}
                                <item.icon size={22} className="relative z-10" />
                                <span className={`relative z-10 font-bold tracking-wide ${isActive ? '' : 'group-hover:translate-x-1 transition-transform'}`}>{item.label}</span>
                            </Link>
                        );
                    })}
                </nav>

                <button
                    onClick={handleLogout}
                    className="flex items-center gap-4 px-6 py-4 text-red-500 hover:bg-red-500/10 rounded-2xl transition-all font-bold mt-auto group mb-4"
                >
                    <LogOut size={22} className="group-hover:-translate-x-1 transition-transform" />
                    Logout
                </button>
            </motion.div>

            {/* Main Content */}
            <div className="flex-1 relative z-10 md:ml-72">
                <main className="p-3 sm:p-6 md:p-10 lg:p-12 pt-24 sm:pt-24 md:pt-10 lg:pt-12 pb-[calc(env(safe-area-inset-bottom,0)+7.25rem)] sm:pb-[calc(env(safe-area-inset-bottom,0)+6.5rem)] md:pb-10 max-w-[1600px] mx-auto min-h-screen">
                    <Outlet />
                </main>
            </div>

            <div
                data-testid="admin-bottom-nav"
                className={`md:hidden fixed bottom-2 left-2 right-2 z-[40] bg-[#0d1b2a]/90 backdrop-blur-xl border border-white/10 rounded-2xl p-2 pb-[calc(env(safe-area-inset-bottom,0)+0.5rem)] transition-all duration-300 ${isMobileMenuOpen ? 'opacity-0 translate-y-8 pointer-events-none' : 'opacity-100 translate-y-0'}`}
            >
                <nav className="flex items-center justify-between gap-1">
                    {navItems.map((item) => {
                        const isActive = location.pathname === item.path;
                        return (
                            <Link
                                key={`mobile-${item.path}`}
                                to={item.path}
                                className={`min-w-0 flex-1 flex flex-col items-center justify-center gap-1 rounded-xl py-2 text-[10px] font-semibold transition-all ${isActive ? 'bg-secondary text-black' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                            >
                                <item.icon size={16} />
                                <span className="truncate max-w-full">{isCompactScreen ? item.label.split(' ')[0] : item.label}</span>
                            </Link>
                        );
                    })}
                </nav>
            </div>
        </div>
    );
};

export default AdminLayout;
