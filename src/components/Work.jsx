import { motion } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import { useContent } from '../context/ContentContext';
import { formatExternalLink } from '../utils/linkUtils';
import { resolveImageSources } from '../utils/imageUtils';

const Work = () => {
    const { content } = useContent();
    const navigate = useNavigate();

    if (!content) return null;
    const projects = (content.projects || []).slice(0, 4); // Show only first 4 projects

    const openExternal = (event, project) => {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        if (project.link) {
            try {
                // fire-and-forget tracking for reel click
                const visitId = sessionStorage.getItem('portfolioVisitId');
                fetch('/api/track/reel', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ reelId: project.id, visitId })
                }).catch(() => { });
            } catch { }
            window.open(formatExternalLink(project.link), '_blank', 'noopener,noreferrer');
        }
    };

    return (
        <section id="work" className="py-32 px-6 relative z-10">
            <div className="max-w-7xl mx-auto">
                <div className="flex flex-col md:flex-row items-end justify-between mb-20 gap-6">
                    <div>
                        <motion.span
                            initial={{ opacity: 0, x: -20 }}
                            whileInView={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.5 }}
                            className="text-primary font-bold tracking-widest uppercase text-sm mb-2 block"
                        >
                            Selected Works
                        </motion.span>
                        <motion.h2
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5, delay: 0.1 }}
                            className="text-5xl md:text-7xl font-bold font-display mb-4 text-white"
                        >
                            Latest Reels<span className="text-secondary">.</span>
                        </motion.h2>
                    </div>
                    <div className="hidden md:block w-32 h-[1px] bg-white/10"></div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                    {projects.map((project, index) => {
                        const { optimizedSrc, webpSrc } = resolveImageSources(project.image);
                        const shouldLazyLoad = index > 1;
                        return (
                        <motion.div
                            key={project.id}
                            initial={{ opacity: 0, y: 30 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5, delay: index * 0.1 }}
                            viewport={{ once: true }}
                            whileHover={{ y: -10 }}
                            onClick={() => navigate(`/project/${project.slug || project.id}`)}
                            className="group relative aspect-[9/16] bg-card-bg rounded-2xl overflow-hidden border border-white/5 cursor-pointer"
                        >
                            {webpSrc ? (
                                <picture>
                                    <source srcSet={webpSrc} type="image/webp" />
                                    <img
                                        src={optimizedSrc || project.image}
                                        alt={project.title}
                                        className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110 opacity-60 group-hover:opacity-100"
                                        loading={shouldLazyLoad ? 'lazy' : 'eager'}
                                        decoding="async"
                                        fetchPriority={shouldLazyLoad ? 'low' : 'high'}
                                    />
                                </picture>
                            ) : (
                                <img
                                    src={optimizedSrc || project.image}
                                    alt={project.title}
                                    className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110 opacity-60 group-hover:opacity-100"
                                    loading={shouldLazyLoad ? 'lazy' : 'eager'}
                                    decoding="async"
                                    fetchPriority={shouldLazyLoad ? 'low' : 'high'}
                                />
                            )}
                            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent"></div>

                            <div
                                className="absolute w-full z-10 transition-transform duration-300 pointer-events-none"
                                style={{
                                    left: project.textPosition ? `${project.textPosition.x}%` : '50%',
                                    top: project.textPosition ? `${project.textPosition.y}%` : '85%',
                                    transform: 'translate(-50%, -50%)',
                                    textAlign: 'center',
                                    color: project.textColor || '#ffffff',
                                    width: '90%'
                                }}
                            >
                                <span
                                    className="inline-block px-3 py-1 text-[10px] font-bold uppercase tracking-widest rounded-full mb-3 backdrop-blur-md"
                                    style={{
                                        backgroundColor: project.textColor ? `${project.textColor}20` : 'rgba(255,255,255,0.1)',
                                        border: `1px solid ${project.textColor ? `${project.textColor}30` : 'rgba(255,255,255,0.1)'}`,
                                        color: project.textColor || '#ffffff'
                                    }}
                                >
                                    {project.category?.split('&')[0]}
                                </span>
                                <h3 className="text-xl font-bold leading-tight mb-2 drop-shadow-lg">{project.title}</h3>
                            </div>

                            {/* Arrow Icon - Click to navigate */}
                            <button
                                onClick={(e) => openExternal(e, project)}
                                className="absolute bottom-6 right-6 z-20 p-3 rounded-full bg-white/10 border border-white/20 text-white opacity-0 group-hover:opacity-100 transition-all duration-300 hover:bg-secondary hover:text-black hover:scale-110"
                                aria-label="Open reel externally"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8l4 4m0 0l-4 4m4-4H3"></path>
                                </svg>
                            </button>

                            {/* Hover Glow */}
                            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
                                <div className="absolute inset-0 border-2 border-primary/50 rounded-2xl"></div>
                            </div>
                        </motion.div>
                        );
                    })}
                </div>

                <div className="mt-16 text-center">
                    <Link to="/reels" className="inline-flex items-center gap-2 px-8 py-4 bg-white/5 border border-white/10 rounded-full hover:bg-secondary hover:text-black hover:scale-105 transition-all font-bold text-sm uppercase tracking-widest text-white">
                        View All Archives
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 8l4 4m0 0l-4 4m4-4H3"></path></svg>
                    </Link>
                </div>
            </div>
        </section>
    );
};

export default Work;
