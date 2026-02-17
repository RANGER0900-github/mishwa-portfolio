import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Work from '../components/Work';
import Footer from '../components/Footer';

const WorkPage = () => {
  return (
    <div className="bg-background min-h-screen text-white relative overflow-hidden">
      <Navbar />

      <main className="pt-32 px-6 max-w-7xl mx-auto pb-24">
        <section className="rounded-3xl border border-white/10 bg-card-bg/60 p-8 md:p-10 mb-12">
          <p className="text-xs uppercase tracking-[0.22em] text-secondary mb-4">Work</p>
          <h1 className="text-4xl md:text-6xl font-display font-bold mb-5">Video Editing Work for Reels and Brands.</h1>
          <p className="text-gray-300 leading-relaxed text-base md:text-lg mb-4">
            Explore recent edits from Coco Club, including retention-focused Instagram Reels, creator campaigns, beauty and lifestyle content, and cinematic brand cuts.
            Each project page shows category context, visit flow, and direct reel access.
          </p>
          <p className="text-gray-400 leading-relaxed mb-6">
            For deeper breakdowns, move from project pages into case studies and guides. This internal flow helps both visitors and search crawlers understand project context.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link to="/reels" className="px-4 py-2 rounded-full border border-white/15 hover:border-secondary hover:text-secondary transition-colors">All Archives</Link>
            <Link to="/case-studies" className="px-4 py-2 rounded-full border border-white/15 hover:border-secondary hover:text-secondary transition-colors">Case Studies</Link>
            <Link to="/services" className="px-4 py-2 rounded-full border border-white/15 hover:border-secondary hover:text-secondary transition-colors">Services</Link>
            <Link to="/guides" className="px-4 py-2 rounded-full border border-white/15 hover:border-secondary hover:text-secondary transition-colors">Guides</Link>
            <Link to="/contact" className="px-4 py-2 rounded-full border border-white/15 hover:border-secondary hover:text-secondary transition-colors">Contact</Link>
          </div>
        </section>

        <Work />
      </main>

      <Footer />
    </div>
  );
};

export default WorkPage;
