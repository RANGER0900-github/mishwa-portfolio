import { Link, useParams } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { useContent } from '../context/ContentContext';
import { SEO_HUB_CONFIG, getSeoHubEntryBySlug } from '../utils/seoHub';
import { resolveImageSources } from '../utils/imageUtils';

const SeoHubDetail = ({ typeKey }) => {
  const { slug } = useParams();
  const { content } = useContent();
  const config = SEO_HUB_CONFIG[typeKey];

  if (!content || !config) return null;

  const entry = getSeoHubEntryBySlug(content, typeKey, slug);

  if (!entry) {
    return (
      <div className="bg-background min-h-screen text-white relative overflow-hidden">
        <Navbar />
        <main className="pt-32 px-6 max-w-4xl mx-auto pb-24">
          <h1 className="text-4xl md:text-6xl font-display font-bold text-white mb-4">
            Content Not Found<span className="text-secondary">.</span>
          </h1>
          <p className="text-gray-400 text-lg mb-8">This page is not available. Browse other published content.</p>
          <div className="flex flex-wrap gap-3">
            <Link to={config.path} className="px-6 py-3 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 transition-colors font-bold uppercase tracking-widest text-xs">
              {config.label}
            </Link>
            <Link to="/" className="px-6 py-3 rounded-full bg-secondary/10 text-secondary border border-secondary/30 hover:bg-secondary hover:text-background transition-colors font-bold uppercase tracking-widest text-xs">
              Home
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const relatedProjects = (content.projects || []).filter((project) =>
    entry.relatedProjectSlugs?.includes(String(project.slug || '').trim())
  );
  const { optimizedSrc, webpSrc } = resolveImageSources(entry.heroImage || '');

  return (
    <div className="bg-background min-h-screen text-white relative overflow-hidden">
      <Navbar />

      <main className="pt-32 px-6 max-w-5xl mx-auto pb-24">
        <div className="flex flex-wrap gap-3 text-xs uppercase tracking-[0.2em] font-mono mb-6">
          <Link to="/" className="text-secondary hover:underline">Home</Link>
          <span className="text-white/30">/</span>
          <Link to={config.path} className="text-secondary hover:underline">{config.label}</Link>
        </div>

        <article className="rounded-3xl border border-white/10 bg-card-bg/70 p-6 md:p-10">
          <p className="text-[11px] uppercase tracking-[0.2em] text-secondary font-bold mb-4">{config.singular}</p>
          <h1 className="text-4xl md:text-6xl font-display font-bold text-white leading-tight">{entry.title}<span className="text-secondary">.</span></h1>

          {(optimizedSrc || webpSrc) && (
            <div className="mt-8 rounded-2xl overflow-hidden border border-white/10">
              {webpSrc ? (
                <picture>
                  <source srcSet={webpSrc} type="image/webp" />
                  <img src={optimizedSrc || entry.heroImage} alt={entry.title} className="w-full h-auto object-cover" loading="eager" decoding="async" fetchPriority="high" />
                </picture>
              ) : (
                <img src={optimizedSrc || entry.heroImage} alt={entry.title} className="w-full h-auto object-cover" loading="eager" decoding="async" fetchPriority="high" />
              )}
            </div>
          )}

          <p className="text-gray-300 text-lg leading-relaxed mt-8">{entry.intro || entry.excerpt}</p>

          {entry.sections?.length > 0 && (
            <div className="mt-10 space-y-8">
              {entry.sections.map((section, index) => (
                <section key={`${entry.slug}-section-${index}`}>
                  <h2 className="text-2xl font-display font-bold text-white mb-3">{section.heading}</h2>
                  <p className="text-gray-300 leading-relaxed whitespace-pre-line">{section.body}</p>
                </section>
              ))}
            </div>
          )}

          {entry.faqs?.length > 0 && (
            <section className="mt-12">
              <h2 className="text-2xl font-display font-bold text-white mb-4">FAQs<span className="text-secondary">.</span></h2>
              <div className="space-y-4">
                {entry.faqs.map((faq, index) => (
                  <div key={`${entry.slug}-faq-${index}`} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                    <h3 className="text-white font-semibold mb-2">{faq.q}</h3>
                    <p className="text-gray-400 text-sm leading-relaxed">{faq.a}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {relatedProjects.length > 0 && (
            <section className="mt-12">
              <h2 className="text-2xl font-display font-bold text-white mb-4">Related Projects<span className="text-secondary">.</span></h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {relatedProjects.map((project) => (
                  <Link key={project.id} to={`/project/${project.slug || project.id}`} className="rounded-xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] transition-colors px-5 py-4">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-secondary font-bold mb-1">Project</p>
                    <p className="text-white font-semibold">{project.title}</p>
                    {project.category && <p className="text-sm text-gray-400 mt-1">{project.category}</p>}
                  </Link>
                ))}
              </div>
            </section>
          )}
        </article>
      </main>

      <Footer />
    </div>
  );
};

export default SeoHubDetail;
