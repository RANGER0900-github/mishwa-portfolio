import { useState, useEffect } from 'react';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { LayoutDashboard, Film, Users, Settings, LogOut, Bell, Menu, X } from 'lucide-react';

const AdminLayout = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [isValidating, setIsValidating] = useState(true);

    useEffect(() => {
        const validateToken = async () => {
            const token = localStorage.getItem('adminToken');
            
            if (!token) {
                navigate('/admin/login');
                setIsValidating(false);
                return;
            }
            
            try {
                // Validate token with server
                const response = await fetch('/api/validate-token', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });
                
                if (!response.ok) {
                    // Token is invalid, remove it and redirect to login
                    localStorage.removeItem('adminToken');
                    navigate('/admin/login');
                } else {
                    // Token is valid, allow access
                    setIsValidating(false);
                }
            } catch (error) {
                console.error('Token validation failed:', error);
                localStorage.removeItem('adminToken');
                navigate('/admin/login');
            }
        };
        
        validateToken();
    }, [navigate]);

    const handleLogout = () => {
        localStorage.removeItem('adminToken');
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
        <div className="flex min-h-screen bg-black text-white selection:bg-secondary selection:text-black font-sans">
            {/* Background Ambience */}
            <div className="fixed inset-0 z-0 pointer-events-none">
                <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-primary/20 rounded-full blur-[120px] opacity-30"></div>
                <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-secondary/20 rounded-full blur-[120px] opacity-30"></div>
            </div>

            {/* Mobile Header */}
            <div className="md:hidden fixed top-0 left-0 right-0 z-[60] bg-black/80 backdrop-blur-xl border-b border-white/10 px-6 py-4 flex items-center justify-between">
                <h1 className="font-display font-black text-2xl tracking-tighter italic">
                    MISHWA<span className="text-secondary text-3xl">.</span>
                </h1>
                <button
                    onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                    className="p-2 text-white hover:bg-white/10 rounded-xl transition-colors"
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
                className="md:hidden fixed top-0 left-0 bottom-0 w-[80%] max-w-sm bg-[#0d1b2a] border-r border-white/10 z-[80] p-8 flex flex-col"
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
                                className={`flex items-center gap-4 px-6 py-4 rounded-2xl transition-all ${isActive ? 'bg-secondary text-black font-bold' : 'text-gray-400 hover:text-white hover:bg-white/5'}`}
                            >
                                <item.icon size={22} />
                                <span>{item.label}</span>
                            </Link>
                        );
                    })}
                </nav>

                <button
                    onClick={handleLogout}
                    className="flex items-center gap-4 px-6 py-4 text-red-500 hover:bg-red-500/10 rounded-2xl transition-all font-bold mt-auto"
                >
                    <LogOut size={22} />
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
                <main className="p-8 md:p-12 pt-24 md:pt-12 max-w-[1600px] mx-auto min-h-screen">
                    <Outlet />
                </main>
            </div>
        </div>
    );
};

export default AdminLayout;
