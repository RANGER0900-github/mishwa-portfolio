import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowUpRight, Instagram, Mail } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useContent } from '../context/ContentContext';
import { formatExternalLink } from '../utils/linkUtils';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

const AllReels = () => {
    const { content } = useContent();
    const [activeCategory, setActiveCategory] = useState("All");

    // Ensure the archive page always opens at the top
    useEffect(() => {
        try { window.scrollTo({ top: 0, behavior: 'auto' }); } catch (e) { window.scrollTo(0, 0); }
    }, []);

    if (!content) return null;
    const allReels = content.projects || [];
    const { social } = content;

    const categories = [
        "All",
        "Beauty & Personal Care",
        "Food & Beverage",
        "Fitness & Wellness",
        "Fashion & Apparel",
        "Travel & Local experience"
    ];

    const filteredReels = activeCategory === "All"
        ? allReels
        : allReels.filter(reel => reel.category === activeCategory);

    return (
        <div className="bg-background min-h-screen text-white relative overflow-hidden">
            <Navbar />

            <main className="pt-32 px-6 max-w-[1920px] mx-auto pb-0">
                {/* Header */}
                <div className="flex flex-col items-center justify-center mb-16 text-center">
                    <Link to="/" className="text-secondary font-mono text-xs tracking-[0.2em] mb-4 hover:underline">← BACK TO HOME</Link>
                    <h1 className="text-6xl md:text-8xl font-display font-bold text-white mb-6">Archives<span className="text-secondary">.</span></h1>

                    {/* Premium Filters */}
                    <div className="flex flex-wrap gap-3 justify-center max-w-5xl mx-auto">
                        {categories.map((cat) => (
                            <button
                                key={cat}
                                onClick={() => setActiveCategory(cat)}
                                className={`px-6 py-2 rounded-full text-xs md:text-sm font-bold uppercase tracking-wider transition-all duration-300 relative overflow-hidden group ${activeCategory === cat
                                    ? 'bg-white text-black shadow-[0_0_20px_rgba(255,255,255,0.4)] scale-105'
                                    : 'bg-white/5 text-gray-400 border border-white/10 hover:border-white hover:text-white hover:bg-white/10'
                                    }`}
                            >
                                <span className="relative z-10">{cat}</span>
                                {activeCategory === cat && (
                                    <motion.div
                                        layoutId="activeTab"
                                        className="absolute inset-0 bg-white"
                                        initial={false}
                                        transition={{ type: "spring", stiffness: 500, damping: 30 }}
                                    />
                                )}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Big Masonry Grid (Fewer columns for bigger images) */}
                <motion.div layout className="columns-1 md:columns-2 xl:columns-3 gap-8 space-y-8 mb-32 px-4 md:px-12">
                    <AnimatePresence mode='popLayout'>
                        {filteredReels.map((reel) => (
                            <motion.div
                                layout
                                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                                transition={{ duration: 0.4 }}
                                key={reel.id}
                                onClick={() => {
                                    if (reel.link) {
                                        try {
                                            fetch('/api/track/reel', {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ reelId: reel.id })
                                            }).catch(() => { });
                                        } catch (e) { }
                                        window.open(formatExternalLink(reel.link), '_blank');
                                    }
                                }}
                                className={`group relative break-inside-avoid rounded-3xl overflow-hidden cursor-pointer border border-white/5 bg-card-bg mb-8`}
                            >
                                <img
                                    src={reel.image}
                                    alt={reel.title}
                                    className="w-full h-auto object-cover transition-transform duration-700 group-hover:scale-105"
                                    loading="lazy"
                                />

                                {/* Dark Gradient Overlay - Always visible slightly, darker on bottom */}
                                <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/20 to-transparent opacity-80 group-hover:opacity-100 transition-opacity duration-300"></div>

                                {/* Content similar to Home Page Work Cards */}
                                {/* Content with Dynamic Styling */}
                                <div
                                    className="absolute w-full z-10 p-6 transition-transform duration-300 pointer-events-none"
                                    style={{
                                        left: reel.textPosition ? `${reel.textPosition.x}%` : '50%',
                                        top: reel.textPosition ? `${reel.textPosition.y}%` : '85%',
                                        transform: 'translate(-50%, -50%)',
                                        textAlign: 'center',
                                        color: reel.textColor || '#ffffff',
                                    }}
                                >
                                    <span
                                        className="inline-block px-3 py-1 text-[10px] font-bold uppercase tracking-widest rounded-full mb-3 backdrop-blur-md"
                                        style={{
                                            backgroundColor: reel.textColor ? `${reel.textColor}20` : 'rgba(255,255,255,0.1)',
                                            border: `1px solid ${reel.textColor ? `${reel.textColor}30` : 'rgba(255,255,255,0.1)'}`,
                                            color: reel.textColor || '#ffffff'
                                        }}
                                    >
                                        {reel.category?.split('&')[0].trim()}
                                    </span>
                                    <h3 className="text-3xl font-display font-bold leading-tight drop-shadow-lg">{reel.title}</h3>
                                </div>

                                {/* Hover Arrow Button */}
                                <div className="absolute top-6 right-6 w-12 h-12 bg-white/10 backdrop-blur-md border border-white/20 rounded-full flex items-center justify-center group-hover:bg-white group-hover:text-black transition-all duration-300">
                                    <ArrowUpRight className="w-5 h-5" />
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>
                </motion.div>

                {/* Shared Footer */}
                <Footer />

            </main>
        </div>
    );
};

export default AllReels;
