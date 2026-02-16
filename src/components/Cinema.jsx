import { motion } from 'framer-motion';
import { useContent } from '../context/ContentContext';
import { resolveImageSources } from '../utils/imageUtils';

const Cinema = () => {
    const { content } = useContent();

    if (!content?.cinema) return null;
    const { cinema } = content;

    return (
        <section id="cinema" className="py-20 px-6 relative z-10 bg-background">
            <div className="max-w-7xl mx-auto">
                <div className="flex items-end justify-between mb-12">
                    <div>
                        <span className="text-secondary font-bold tracking-widest uppercase text-sm mb-2 block">{cinema.subtitle || 'Cinematic'}</span>
                        <h2 className="text-4xl md:text-5xl font-bold font-display mb-2 text-white">{cinema.title || 'Long Form Works'}<span className="text-secondary">.</span></h2>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {cinema.items && cinema.items.map((item, index) => {
                        const { optimizedSrc, webpSrc } = resolveImageSources(item.image);
                        const isLazy = index > 0;
                        return (
                        <motion.div
                            key={index}
                            initial={{ opacity: 0, scale: 0.95 }}
                            whileInView={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 0.6, delay: index * 0.2 }}
                            viewport={{ once: true }}
                            className="group relative aspect-video bg-card-bg rounded-2xl overflow-hidden border border-white/5 cursor-pointer"
                        >
                            {webpSrc ? (
                                <picture>
                                    <source srcSet={webpSrc} type="image/webp" />
                                    <img
                                        src={optimizedSrc || item.image}
                                        alt={item.title}
                                        className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105 opacity-70 group-hover:opacity-100"
                                        loading={isLazy ? 'lazy' : 'eager'}
                                        decoding="async"
                                        fetchPriority={isLazy ? 'low' : 'high'}
                                    />
                                </picture>
                            ) : (
                                <img
                                    src={optimizedSrc || item.image}
                                    alt={item.title}
                                    className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105 opacity-70 group-hover:opacity-100"
                                    loading={isLazy ? 'lazy' : 'eager'}
                                    decoding="async"
                                    fetchPriority={isLazy ? 'low' : 'high'}
                                />
                            )}
                            <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent"></div>
                            <div className="absolute bottom-0 left-0 p-8">
                                <span className="text-secondary text-xs font-bold uppercase tracking-widest mb-2 block">{item.category}</span>
                                <h3 className="text-3xl font-bold mb-2 text-white">{item.title}</h3>
                                <p className="text-gray-400 text-sm max-w-sm">{item.description}</p>
                            </div>
                        </motion.div>
                        );
                    })}
                </div>
            </div>
        </section>
    );
};

export default Cinema;
