import { motion } from 'framer-motion';
import { useContent } from '../context/ContentContext';
import { useDeviceProfile } from '../context/DeviceProfileContext';
import { resolveImageSources } from '../utils/imageUtils';

const About = () => {
    const { content } = useContent();
    const { perfMode } = useDeviceProfile();
    const isLite = perfMode === 'lite';

    if (!content) return null;

    const aboutText = content.about?.text || "I'm Mishwa Zalavadiya, a Surat-based video editor and visual artist who understands the psychology of attention. With a focus on pacing, sound design, and visual storytelling, I help brands convert viewers into followers.";
    const { optimizedSrc: aboutImageSrc, webpSrc: aboutImageWebp } = resolveImageSources(content.about?.image || '/images/mishwa_portrait.png');

    return (
        <section id="about" className={`py-32 px-6 bg-gradient-to-b from-background to-[#112240] relative overflow-hidden ${isLite ? '' : 'will-change-transform'}`}>

            {/* Decorative Elements */}
            {!isLite && (
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-accent/5 rounded-full blur-[100px] pointer-events-none"></div>
            )}

            <div className="max-w-7xl mx-auto">
                {/* About & Stats */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-16 items-center">
                    <motion.div
                        initial={{ opacity: 0, x: -50 }}
                        whileInView={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.8 }}
                    >
                        <div className="relative aspect-[4/5] rounded-2xl overflow-hidden border border-white/10 group">
                            {aboutImageWebp ? (
                                <picture>
                                    <source srcSet={aboutImageWebp} type="image/webp" />
                                    <img
                                        src={aboutImageSrc || content.about?.image || '/images/mishwa_portrait.png'}
                                        alt="Mishwa"
                                        className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-700"
                                        loading="lazy"
                                        decoding="async"
                                    />
                                </picture>
                            ) : (
                                <img
                                    src={aboutImageSrc || content.about?.image || '/images/mishwa_portrait.png'}
                                    alt="Mishwa"
                                    className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-700"
                                    loading="lazy"
                                    decoding="async"
                                />
                            )}
                            <div className="absolute inset-0 bg-primary/10 mix-blend-overlay"></div>
                        </div>
                    </motion.div>

                    <div>
                        <span className="text-secondary font-bold tracking-widest uppercase text-sm mb-4 block">About Me</span>
                        <h2 className="text-5xl md:text-6xl font-display font-bold text-white mb-6">More Than Just Cuts.</h2>
                        <p className="text-gray-400 text-lg leading-relaxed mb-8">
                            {aboutText}
                        </p>

                        <div className="grid grid-cols-3 gap-6 border-t border-white/10 pt-8">
                            {(() => {
                                const metrics = content.about?.metrics || [0,0,0];
                                const labels = content.about?.metricLabels || ['Polished','Years','Views'];
                                const format = (n) => {
                                    if (typeof n !== 'number') return '0+';
                                    if (n >= 1000000) return `${(n / 1000000).toFixed(0)}M+`;
                                    if (n >= 1000) return `${(n / 1000).toFixed(0)}K+`;
                                    return `${n}+`;
                                };

                                return metrics.map((m, i) => (
                                    <div key={i}>
                                        <h4 className="text-3xl font-bold text-white">{format(m)}</h4>
                                        <p className="text-xs text-gray-500 uppercase tracking-widest mt-1">{labels[i] || 'Metric'}</p>
                                    </div>
                                ));
                            })()}
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
};

export default About;
