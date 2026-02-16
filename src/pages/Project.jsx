import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { useContent } from '../context/ContentContext';
import { useDeviceProfile } from '../context/DeviceProfileContext';
import { formatExternalLink } from '../utils/linkUtils';
import { resolveImageSources } from '../utils/imageUtils';
import { getSeoHubSummary } from '../utils/seoHub';

const Project = () => {
  const { slug } = useParams();
  const { content } = useContent();
  const { perfMode } = useDeviceProfile();
  const isLite = perfMode === 'lite';

  const project = useMemo(() => {
    const projects = content?.projects || [];
    const normalized = String(slug || '').toLowerCase();
    return (
      projects.find((p) => String(p?.slug || '').toLowerCase() === normalized) ||
      projects.find((p) => String(p?.id || '') === normalized) ||
      null
    );
  }, [content?.projects, slug]);

  const related = useMemo(() => {
    const projects = content?.projects || [];
    if (!project) return [];
    const sameCategory = projects.filter((p) => p?.id !== project.id && p?.category && p.category === project.category);
    const rest = projects.filter((p) => p?.id !== project.id && (!p?.category || p.category !== project.category));
    return [...sameCategory, ...rest].slice(0, 6);
  }, [content?.projects, project]);

  const relatedHubEntries = useMemo(() => {
    if (!project) return [];
    const normalizedSlug = String(project.slug || '').trim();
    if (!normalizedSlug) return [];
    return getSeoHubSummary(content)
      .flatMap((group) =>
        group.entries
          .filter((entry) => Array.isArray(entry.relatedProjectSlugs) && entry.relatedProjectSlugs.includes(normalizedSlug))
          .slice(0, 4)
          .map((entry) => ({
            ...entry,
            groupLabel: group.label,
            path: `${group.path}/${entry.slug}`
          }))
      )
      .slice(0, 6);
  }, [content, project]);

  if (!content) return null;
  const { optimizedSrc: projectImageSrc, webpSrc: projectImageWebp } = resolveImageSources(project?.image || '');

  if (!project) {
    return (
      <div className="bg-background min-h-screen text-white relative overflow-hidden">
        <Navbar />
        <main className="pt-32 px-6 max-w-4xl mx-auto pb-24">
          <h1 className="text-4xl md:text-6xl font-display font-bold text-white mb-4">Project Not Found<span className="text-secondary">.</span></h1>
          <p className="text-gray-400 text-lg mb-8">This project link is invalid or was removed. Browse the archives instead.</p>
          <div className="flex flex-wrap gap-3">
            <Link to="/reels" className="px-6 py-3 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 transition-colors font-bold uppercase tracking-widest text-xs">
              View Archives
            </Link>
            <Link to="/" className="px-6 py-3 rounded-full bg-secondary/10 text-secondary border border-secondary/30 hover:bg-secondary hover:text-background transition-colors font-bold uppercase tracking-widest text-xs">
              Back Home
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const description =
    project.seoDescription ||
    `A high-retention ${project.category ? `${project.category} ` : ''}edit crafted by Mishwa. Scroll for more projects and open the reel link.`;

  const openExternal = () => {
    if (!project.link) return;
    try {
      const visitId = sessionStorage.getItem('portfolioVisitId');
      fetch('/api/track/reel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reelId: project.id, visitId })
      }).catch(() => { });
    } catch { }
    window.open(formatExternalLink(project.link), '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="bg-background min-h-screen text-white relative overflow-hidden">
      <Navbar />

      <main className="pt-32 px-6 max-w-6xl mx-auto pb-24">
        <Link to="/reels" className="text-secondary font-mono text-xs tracking-[0.2em] hover:underline">
          ← BACK TO ARCHIVES
        </Link>

        <article className="mt-10 grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
          <div className={`relative rounded-3xl overflow-hidden border border-white/10 bg-card-bg ${isLite ? '' : 'shadow-[0_24px_80px_rgba(0,0,0,0.35)]'}`}>
            {projectImageWebp ? (
              <picture>
                <source srcSet={projectImageWebp} type="image/webp" />
                <img
                  src={projectImageSrc || project.image}
                  alt={`${project.title}${project.category ? ` - ${project.category}` : ''}`}
                  className="w-full h-auto object-cover"
                  loading="eager"
                  decoding="async"
                  fetchPriority="high"
                />
              </picture>
            ) : (
              <img
                src={projectImageSrc || project.image}
                alt={`${project.title}${project.category ? ` - ${project.category}` : ''}`}
                className="w-full h-auto object-cover"
                loading="eager"
                decoding="async"
                fetchPriority="high"
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/10 to-transparent opacity-80 pointer-events-none" />
          </div>

          <div className="pt-2">
            {project.category && (
              <span className={`inline-flex items-center px-4 py-2 rounded-full text-[11px] font-bold uppercase tracking-widest mb-6 border border-white/10 ${isLite ? 'bg-white/5' : 'bg-white/5 backdrop-blur-md'}`}>
                {project.category}
              </span>
            )}

            <h1 className="text-5xl md:text-7xl font-display font-bold text-white leading-[0.95]">
              {project.title}<span className="text-secondary">.</span>
            </h1>

            <p className="text-gray-400 text-lg leading-relaxed mt-6 max-w-xl">
              {description}
            </p>

            <div className="flex flex-wrap gap-3 mt-10">
              {project.link && (
                <button
                  type="button"
                  onClick={openExternal}
                  className="group inline-flex items-center gap-3 px-7 py-4 rounded-full bg-secondary text-black font-bold uppercase tracking-widest text-xs hover:bg-secondary/90 transition-transform active:scale-95"
                >
                  Open Reel
                  <ArrowUpRight className="w-4 h-4 group-hover:rotate-45 transition-transform" />
                </button>
              )}

              <Link
                to="/"
                className="inline-flex items-center gap-3 px-7 py-4 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 transition-colors font-bold uppercase tracking-widest text-xs"
              >
                Home
              </Link>
            </div>
          </div>
        </article>

        {related.length > 0 && (
          <section className="mt-20">
            <h2 className="text-2xl md:text-3xl font-display font-bold text-white mb-6">More Edits<span className="text-secondary">.</span></h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {related.map((item) => {
                const { optimizedSrc, webpSrc } = resolveImageSources(item.image);
                return (
                <Link
                  key={item.id}
                  to={`/project/${item.slug || item.id}`}
                  className={`group block rounded-3xl overflow-hidden border border-white/10 bg-card-bg hover:border-white/20 transition-colors`}
                >
                  <div className="relative">
                    {webpSrc ? (
                      <picture>
                        <source srcSet={webpSrc} type="image/webp" />
                        <img src={optimizedSrc || item.image} alt={item.title} className="w-full aspect-[16/10] object-cover opacity-80 group-hover:opacity-100 transition-opacity" loading="lazy" decoding="async" />
                      </picture>
                    ) : (
                      <img src={optimizedSrc || item.image} alt={item.title} className="w-full aspect-[16/10] object-cover opacity-80 group-hover:opacity-100 transition-opacity" loading="lazy" decoding="async" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/10 to-transparent opacity-90" />
                    <div className="absolute bottom-0 left-0 right-0 p-5">
                      {item.category && (
                        <div className="text-[10px] uppercase tracking-[0.25em] text-secondary font-bold mb-2">
                          {item.category}
                        </div>
                      )}
                      <div className="text-xl font-bold text-white">{item.title}</div>
                    </div>
                  </div>
                </Link>
                );
              })}
            </div>
          </section>
        )}

        {relatedHubEntries.length > 0 && (
          <section className="mt-14">
            <h2 className="text-2xl md:text-3xl font-display font-bold text-white mb-6">Related Insights<span className="text-secondary">.</span></h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {relatedHubEntries.map((entry) => (
                <Link
                  key={`${entry.path}`}
                  to={entry.path}
                  className="rounded-2xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] transition-colors px-5 py-4"
                >
                  <p className="text-[10px] uppercase tracking-[0.2em] text-secondary font-bold mb-2">{entry.groupLabel}</p>
                  <p className="text-lg font-semibold text-white leading-tight">{entry.title}</p>
                  {(entry.excerpt || entry.primaryKeyword) && (
                    <p className="text-sm text-gray-400 mt-2">{entry.excerpt || entry.primaryKeyword}</p>
                  )}
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>

      <Footer />
    </div>
  );
};

export default Project;
