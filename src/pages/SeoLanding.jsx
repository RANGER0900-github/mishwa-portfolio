import { Link, useLocation } from 'react-router-dom';
import { ArrowUpRight, Sparkles } from 'lucide-react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { useContent } from '../context/ContentContext';
import { formatExternalLink } from '../utils/linkUtils';
import { resolveImageSources } from '../utils/imageUtils';

const LANDING_CONTENT = {
  '/mishwa-zalavadiya-video-editor-portfolio': {
    badge: 'Video Editor Portfolio',
    title: 'Mishwa Zalavadiya Video Editor Portfolio',
    intro: 'Surat-based reel editor focused on retention-first short-form storytelling, premium pacing, and ad-ready cinematic cuts.',
    focus: ['Instagram Reels Editing', 'High-Retention Hook + Payoff Structure', 'Brand & Personal Portfolio Edits']
  },
  '/mishwa-zalavadiya-portfolio': {
    badge: 'Official Portfolio',
    title: 'Mishwa Zalavadiya Portfolio',
    intro: 'A curated showcase of social-first edits, cinematic projects, and conversion-oriented video storytelling.',
    focus: ['Portfolio Curation', 'Creator & Brand Edit Systems', 'Visual Storytelling Direction']
  },
  '/surat-video-editor-portfolio': {
    badge: 'Surat Video Editor',
    title: 'Surat Video Editor Portfolio',
    intro: 'For creators and brands looking for a Surat video editor with strong creative direction, clear pacing, and polished final delivery.',
    focus: ['Social Media Retention Editing', 'Local + Remote Brand Collaboration', 'Premium Color and Sound Balance']
  }
};

const SeoLanding = () => {
  const { content } = useContent();
  const location = useLocation();

  const config = LANDING_CONTENT[location.pathname] || LANDING_CONTENT['/mishwa-zalavadiya-portfolio'];
  const projects = (content?.projects || []).slice(0, 6);
  const preferredInstagram = 'https://www.instagram.com/_thecoco_club/';
  const instagramUrl = (content?.social?.instagram || '').includes('_thecoco_club')
    ? content.social.instagram
    : preferredInstagram;

  return (
    <div className="bg-background min-h-screen text-white relative overflow-hidden">
      <Navbar />

      <main className="pt-32 px-6 max-w-6xl mx-auto pb-20">
        <article className="rounded-3xl border border-white/10 bg-card-bg/80 p-8 md:p-12">
          <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-secondary/10 border border-secondary/30 text-secondary text-xs tracking-[0.2em] uppercase font-bold">
            <Sparkles className="w-4 h-4" />
            {config.badge}
          </span>

          <h1 className="mt-6 text-4xl md:text-6xl font-display font-bold leading-tight">
            {config.title}<span className="text-secondary">.</span>
          </h1>

          <p className="mt-6 text-lg text-gray-300 max-w-3xl leading-relaxed">
            {config.intro}
          </p>

          <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-4">
            {config.focus.map((item) => (
              <div key={item} className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4 text-sm text-gray-200">
                {item}
              </div>
            ))}
          </div>

          <div className="mt-10 flex flex-wrap gap-3">
            <Link
              to="/reels"
              className="inline-flex items-center gap-2 px-7 py-3 rounded-full bg-secondary text-black font-bold uppercase tracking-widest text-xs"
            >
              View Archive
            </Link>
            <a
              href={formatExternalLink(instagramUrl)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-7 py-3 rounded-full bg-white/5 border border-white/15 hover:bg-white/10 transition-colors font-bold uppercase tracking-widest text-xs"
            >
              Instagram
              <ArrowUpRight className="w-4 h-4" />
            </a>
          </div>
        </article>

        {projects.length > 0 && (
          <section className="mt-14">
            <h2 className="text-2xl md:text-3xl font-display font-bold mb-5">Featured Portfolio Projects<span className="text-secondary">.</span></h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {projects.map((project) => {
                const { optimizedSrc, webpSrc } = resolveImageSources(project.image);
                return (
                <Link
                  key={project.id}
                  to={`/project/${project.slug || project.id}`}
                  className="rounded-2xl overflow-hidden border border-white/10 bg-card-bg group"
                >
                  <div className="relative">
                    {webpSrc ? (
                      <picture>
                        <source srcSet={webpSrc} type="image/webp" />
                        <img src={optimizedSrc || project.image} alt={project.title} className="w-full aspect-[16/10] object-cover opacity-80 group-hover:opacity-100 transition-opacity" loading="lazy" decoding="async" />
                      </picture>
                    ) : (
                      <img src={optimizedSrc || project.image} alt={project.title} className="w-full aspect-[16/10] object-cover opacity-80 group-hover:opacity-100 transition-opacity" loading="lazy" decoding="async" />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/10 to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 p-4">
                      <div className="text-[11px] uppercase tracking-[0.2em] text-secondary font-bold mb-1">{project.category || 'Portfolio'}</div>
                      <h3 className="text-lg font-bold">{project.title}</h3>
                    </div>
                  </div>
                </Link>
                );
              })}
            </div>
          </section>
        )}
      </main>

      <Footer />
    </div>
  );
};

export default SeoLanding;
