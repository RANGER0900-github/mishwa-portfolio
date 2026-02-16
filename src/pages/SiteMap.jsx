import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { useContent } from '../context/ContentContext';
import { getSeoHubSummary } from '../utils/seoHub';

const SiteMap = () => {
  const { content } = useContent();
  if (!content) return null;

  const coreLinks = [
    { label: 'Home', to: '/' },
    { label: 'Reels', to: '/reels' },
    { label: 'Video Editor Portfolio', to: '/mishwa-zalavadiya-video-editor-portfolio' },
    { label: 'Mishwa Portfolio', to: '/mishwa-zalavadiya-portfolio' },
    { label: 'Surat Portfolio', to: '/surat-video-editor-portfolio' }
  ];

  const projects = (content.projects || []).slice(0, 30);
  const hubs = getSeoHubSummary(content);

  return (
    <div className="bg-background min-h-screen text-white relative overflow-hidden">
      <Navbar />

      <main className="pt-32 px-6 max-w-6xl mx-auto pb-24">
        <h1 className="text-4xl md:text-6xl font-display font-bold text-white mb-6">Site Map<span className="text-secondary">.</span></h1>
        <p className="text-gray-400 text-lg mb-10">Browse all major pages and content hubs.</p>

        <section className="mb-10 rounded-2xl border border-white/10 bg-card-bg/60 p-6">
          <h2 className="text-2xl font-display font-bold text-white mb-4">Core Pages</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {coreLinks.map((item) => (
              <Link key={item.to} to={item.to} className="rounded-lg border border-white/10 bg-white/[0.03] hover:bg-white/[0.07] transition-colors px-4 py-3 text-gray-200">
                {item.label}
              </Link>
            ))}
          </div>
        </section>

        <section className="mb-10 rounded-2xl border border-white/10 bg-card-bg/60 p-6">
          <h2 className="text-2xl font-display font-bold text-white mb-4">Projects</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {projects.map((project) => (
              <Link key={project.id} to={`/project/${project.slug || project.id}`} className="rounded-lg border border-white/10 bg-white/[0.03] hover:bg-white/[0.07] transition-colors px-4 py-3">
                <p className="text-white font-semibold">{project.title}</p>
                {project.category && <p className="text-xs text-gray-400 mt-1">{project.category}</p>}
              </Link>
            ))}
          </div>
        </section>

        {hubs.map((hub) => (
          <section key={hub.key} className="mb-10 rounded-2xl border border-white/10 bg-card-bg/60 p-6">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h2 className="text-2xl font-display font-bold text-white">{hub.label}</h2>
              <Link to={hub.path} className="text-xs uppercase tracking-[0.2em] text-secondary hover:underline">View All</Link>
            </div>
            {hub.entries.length === 0 ? (
              <p className="text-gray-400">No published entries yet.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {hub.entries.map((entry) => (
                  <Link key={`${hub.key}-${entry.slug}`} to={`${hub.path}/${entry.slug}`} className="rounded-lg border border-white/10 bg-white/[0.03] hover:bg-white/[0.07] transition-colors px-4 py-3">
                    <p className="text-white font-semibold">{entry.title}</p>
                    {(entry.excerpt || entry.primaryKeyword) && (
                      <p className="text-xs text-gray-400 mt-1">{entry.excerpt || entry.primaryKeyword}</p>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </section>
        ))}
      </main>

      <Footer />
    </div>
  );
};

export default SiteMap;
