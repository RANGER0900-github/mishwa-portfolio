import { motion } from 'framer-motion';
import { useContent } from '../context/ContentContext';
import { useDeviceProfile } from '../context/DeviceProfileContext';

const Hero = () => {
    const { content } = useContent();
    const { perfMode } = useDeviceProfile();
    const isLite = perfMode === 'lite';

    // Guard clause in case content isn't loaded yet (though Preloader should handle this)
    if (!content) return null;

    const { hero } = content;

    return (
        <section className="relative h-screen flex items-center justify-center overflow-hidden">
            {/* Background Elements */}
            <div className="absolute inset-0 bg-background z-0">
                {!isLite && (
                    <>
                        <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] bg-primary/10 rounded-full blur-[120px] animate-pulse-glow"></div>
                        <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] bg-secondary/10 rounded-full blur-[120px] animate-pulse-glow delay-1000"></div>
                    </>
                )}
            </div>

            <div className="relative z-10 text-center px-4">
                <h1 className="sr-only">Mishwa Zalavadiya Video Editor Portfolio in Surat</h1>
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                >
                    <h2 className="text-secondary font-mono text-sm md:text-base tracking-[0.2em] mb-4">{hero.subtitle}</h2>
                    <p className="text-white/70 text-sm md:text-base font-semibold tracking-wide mb-4">Mishwa Zalavadiya</p>
                </motion.div>

                <motion.p
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 1, delay: 0.2, ease: "easeOut" }}
                    className="font-display text-6xl md:text-8xl lg:text-9xl font-bold tracking-tighter text-white mb-6 will-change-transform"
                    dangerouslySetInnerHTML={{ __html: hero.title.replace('.', '<span class="text-secondary">.</span>') }} // Hack to keep the dot colored if it exists
                >
                </motion.p>

                <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 1, delay: 0.6 }}
                    className="text-gray-400 max-w-lg mx-auto text-lg md:text-xl leading-relaxed"
                >
                    {hero.description}
                </motion.p>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.8, delay: 1 }}
                    className="mt-12"
                >
                    <a href="#work" className="group relative inline-flex items-center gap-3 px-8 py-4 bg-transparent border border-secondary/30 rounded-full overflow-hidden transition-all hover:border-secondary hover:shadow-[0_0_20px_rgba(0,243,255,0.3)]">
                        <div className="absolute inset-0 bg-secondary/10 translate-y-full transition-transform group-hover:translate-y-0 duration-300"></div>
                        <span className="relative font-bold text-white tracking-widest text-sm uppercase">{hero.buttonText}</span>
                    </a>
                </motion.div>
            </div>

            {/* Scroll Indicator */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 2, duration: 1 }}
                className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 z-20"
            >
                <span className="text-xs text-gray-500 uppercase tracking-widest text-[10px]">Scroll</span>
                <div className="w-[1px] h-8 md:h-12 bg-gradient-to-b from-secondary to-transparent"></div>
            </motion.div>
        </section>
    );
};

export default Hero;
