import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { useContent } from '../context/ContentContext';
import { SEO_HUB_CONFIG, getSeoHubEntries } from '../utils/seoHub';
import { resolveImageSources } from '../utils/imageUtils';

const SeoHubIndex = ({ typeKey }) => {
  const { content } = useContent();
  const config = SEO_HUB_CONFIG[typeKey];

  if (!config || !content) return null;

  const items = getSeoHubEntries(content, typeKey);

  return (
    <div className="bg-background min-h-screen text-white relative overflow-hidden">
      <Navbar />

      <main className="pt-32 px-6 max-w-6xl mx-auto pb-24">
        <Link to="/" className="text-secondary font-mono text-xs tracking-[0.2em] hover:underline">
          {'\u2190'} BACK TO HOME
        </Link>

        <header className="mt-6 mb-10">
          <p className="text-xs uppercase tracking-[0.2em] text-secondary/90 mb-3">SEO Hub</p>
          <h1 className="text-4xl md:text-6xl font-display font-bold text-white leading-tight">
            {config.label}<span className="text-secondary">.</span>
          </h1>
          <p className="text-gray-400 text-lg max-w-3xl mt-5">{config.description}</p>
        </header>

        {items.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-card-bg/60 p-8 text-gray-300">
            No published {config.label.toLowerCase()} yet. Check back soon.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {items.map((item) => {
              const { optimizedSrc, webpSrc } = resolveImageSources(item.heroImage || '');
              return (
                <Link
                  key={`${typeKey}-${item.slug}`}
                  to={`${config.path}/${item.slug}`}
                  className="rounded-2xl overflow-hidden border border-white/10 bg-card-bg group hover:border-secondary/50 transition-colors"
                >
                  {(optimizedSrc || webpSrc) && (
                    <div className="relative">
                      {webpSrc ? (
                        <picture>
                          <source srcSet={webpSrc} type="image/webp" />
                          <img src={optimizedSrc || item.heroImage} alt={item.title} className="w-full aspect-[16/9] object-cover opacity-80 group-hover:opacity-100 transition-opacity" loading="lazy" decoding="async" />
                        </picture>
                      ) : (
                        <img src={optimizedSrc || item.heroImage} alt={item.title} className="w-full aspect-[16/9] object-cover opacity-80 group-hover:opacity-100 transition-opacity" loading="lazy" decoding="async" />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/20 to-transparent" />
                    </div>
                  )}

                  <div className="p-6">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-secondary font-bold mb-2">{config.singular}</p>
                    <h2 className="text-2xl font-display font-bold text-white mb-3 leading-tight">{item.title}</h2>
                    <p className="text-gray-400 text-sm leading-relaxed">{item.excerpt || item.intro || 'Read full details.'}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
};

export default SeoHubIndex;
