import { useState } from 'react';
import { motion, AnimatePresence, useScroll, useMotionValueEvent } from 'framer-motion';
import { Menu, X } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useDeviceProfile } from '../context/DeviceProfileContext';

const LINKS = [
    { name: 'Work', href: '#work' },
    { name: 'Cinema', href: '#cinema' },
    { name: 'About', href: '#about' },
];

const scrollToSection = (href) => {
    const tryScroll = (attempt = 0) => {
        const element = document.querySelector(href);
        if (element) {
            if (window.lenis) {
                window.lenis.scrollTo(element, { offset: -24, duration: 1.1 });
            } else {
                element.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
            return;
        }

        if (attempt < 120) {
            requestAnimationFrame(() => tryScroll(attempt + 1));
        }
    };

    tryScroll();
};

const NavbarFull = () => {
    const [hidden, setHidden] = useState(false);
    const { scrollY } = useScroll();
    const [isOpen, setIsOpen] = useState(false);
    const location = useLocation();
    const navigate = useNavigate();

    useMotionValueEvent(scrollY, "change", (latest) => {
        const previous = scrollY.getPrevious();
        if (latest > previous && latest > 150) {
            setHidden(true);
        } else {
            setHidden(false);
        }
    });

    const handleNav = (e, href) => {
        e.preventDefault();
        if (location.pathname !== '/') {
            navigate('/');
            scrollToSection(href);
        } else {
            scrollToSection(href);
        }
        setIsOpen(false);
    };

    return (
        <motion.nav
            variants={{
                visible: { y: 0 },
                hidden: { y: "-100%" },
            }}
            animate={hidden ? "hidden" : "visible"}
            transition={{ duration: 0.35, ease: "easeInOut" }}
            className="fixed top-0 left-0 right-0 z-50 flex justify-center pt-6 px-6"
        >
            <div className="bg-background/80 backdrop-blur-xl border border-white/10 rounded-full px-6 py-3 flex items-center justify-between shadow-2xl w-full max-w-5xl">
                <Link to="/" className="font-display font-bold text-xl tracking-tighter text-white">
                    MISHWA<span className="text-secondary">.</span>
                </Link>

                {/* Desktop Links */}
                <div className="hidden md:flex items-center gap-8">
                    <Link to="/reels" className="text-sm font-medium hover:text-secondary transition-colors relative group">
                        <span className="relative z-10">All Reels</span>
                        <span className="absolute -bottom-1 left-0 w-0 h-[2px] bg-secondary transition-all group-hover:w-full"></span>
                    </Link>
                    {LINKS.map((link) => (
                        <a
                            key={link.name}
                            href={link.href}
                            onClick={(e) => handleNav(e, link.href)}
                            className="text-sm font-medium hover:text-secondary transition-colors relative group cursor-pointer"
                        >
                            <span className="relative z-10">{link.name}</span>
                            <span className="absolute -bottom-1 left-0 w-0 h-[2px] bg-secondary transition-all group-hover:w-full"></span>
                        </a>
                    ))}
                    <a
                        href="#contact"
                        onClick={(e) => handleNav(e, '#contact')}
                        className="bg-secondary/10 text-secondary border border-secondary px-5 py-2 rounded-full text-sm font-bold hover:bg-secondary hover:text-background transition-all"
                    >
                        Let's Talk
                    </a>
                </div>

                {/* Mobile Menu Button */}
                <button
                    className="md:hidden text-white"
                    onClick={() => setIsOpen(!isOpen)}
                    aria-label={isOpen ? 'Close menu' : 'Open menu'}
                >
                    {isOpen ? <X /> : <Menu />}
                </button>
            </div>

            {/* Mobile Menu */}
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="absolute top-24 left-6 right-6 bg-[#112240] border border-white/10 rounded-2xl p-6 flex flex-col gap-4 shadow-2xl md:hidden"
                >
                    <Link to="/reels" className="text-lg font-medium text-center py-2 hover:text-secondary" onClick={() => setIsOpen(false)}>
                        All Reels
                    </Link>
                    {LINKS.map((link) => (
                        <a
                            key={link.name}
                            href={link.href}
                            className="text-lg font-medium text-center py-2 hover:text-secondary"
                            onClick={(e) => handleNav(e, link.href)}
                        >
                            {link.name}
                        </a>
                    ))}
                </motion.div>
            )}
        </motion.nav>
    );
};

const NavbarLite = () => {
    const [isOpen, setIsOpen] = useState(false);
    const location = useLocation();
    const navigate = useNavigate();

    const handleNav = (e, href) => {
        e.preventDefault();
        if (location.pathname !== '/') {
            navigate('/');
            scrollToSection(href);
        } else {
            scrollToSection(href);
        }
        setIsOpen(false);
    };

    return (
        <nav className="fixed top-0 left-0 right-0 z-50 flex justify-center pt-4 px-4">
            <div className="bg-[#0a192f]/95 border border-white/10 rounded-full px-5 py-3 flex items-center justify-between shadow-xl w-full max-w-5xl">
                <Link to="/" className="font-display font-bold text-xl tracking-tighter text-white">
                    MISHWA<span className="text-secondary">.</span>
                </Link>

                <div className="hidden md:flex items-center gap-8">
                    <Link to="/reels" className="text-sm font-medium hover:text-secondary transition-colors">
                        All Reels
                    </Link>
                    {LINKS.map((link) => (
                        <a
                            key={link.name}
                            href={link.href}
                            onClick={(e) => handleNav(e, link.href)}
                            className="text-sm font-medium hover:text-secondary transition-colors cursor-pointer"
                        >
                            {link.name}
                        </a>
                    ))}
                    <a
                        href="#contact"
                        onClick={(e) => handleNav(e, '#contact')}
                        className="bg-secondary/10 text-secondary border border-secondary px-5 py-2 rounded-full text-sm font-bold hover:bg-secondary hover:text-background transition-all"
                    >
                        Let's Talk
                    </a>
                </div>

                <button
                    className="md:hidden text-white"
                    onClick={() => setIsOpen((v) => !v)}
                    aria-label={isOpen ? 'Close menu' : 'Open menu'}
                >
                    {isOpen ? <X /> : <Menu />}
                </button>
            </div>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: -14 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -14 }}
                        transition={{ duration: 0.18, ease: 'easeOut' }}
                        className="absolute top-20 left-4 right-4 bg-[#112240] border border-white/10 rounded-2xl p-6 flex flex-col gap-4 shadow-2xl md:hidden"
                    >
                        <Link to="/reels" className="text-lg font-medium text-center py-2 hover:text-secondary" onClick={() => setIsOpen(false)}>
                            All Reels
                        </Link>
                        {LINKS.map((link) => (
                            <a
                                key={link.name}
                                href={link.href}
                                className="text-lg font-medium text-center py-2 hover:text-secondary"
                                onClick={(e) => handleNav(e, link.href)}
                            >
                                {link.name}
                            </a>
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>
        </nav>
    );
};

const Navbar = () => {
    const { perfMode } = useDeviceProfile();
    return perfMode === 'lite' ? <NavbarLite /> : <NavbarFull />;
};

export default Navbar;
