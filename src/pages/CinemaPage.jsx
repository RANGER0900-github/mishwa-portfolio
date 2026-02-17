import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Cinema from '../components/Cinema';
import Footer from '../components/Footer';

const CinemaPage = () => {
  return (
    <div className="bg-background min-h-screen text-white relative overflow-hidden">
      <Navbar />

      <main className="pt-32 px-6 max-w-7xl mx-auto pb-24">
        <section className="rounded-3xl border border-white/10 bg-card-bg/60 p-8 md:p-10 mb-12">
          <p className="text-xs uppercase tracking-[0.22em] text-secondary mb-4">Cinema</p>
          <h1 className="text-4xl md:text-6xl font-display font-bold mb-5">Cinematic Work and Long-Form Storytelling.</h1>
          <p className="text-gray-300 leading-relaxed text-base md:text-lg mb-4">
            Beyond short-form reels, Coco Club also ships long-form creative pieces with stronger narrative structure, dramatic pacing,
            and visual cohesion for commercial and documentary styles.
          </p>
          <p className="text-gray-400 leading-relaxed mb-6">
            This page is built as an indexable cinema endpoint so search engines can discover long-form work without changing the main website design.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link to="/work" className="px-4 py-2 rounded-full border border-white/15 hover:border-secondary hover:text-secondary transition-colors">Work</Link>
            <Link to="/reels" className="px-4 py-2 rounded-full border border-white/15 hover:border-secondary hover:text-secondary transition-colors">Archives</Link>
            <Link to="/case-studies" className="px-4 py-2 rounded-full border border-white/15 hover:border-secondary hover:text-secondary transition-colors">Case Studies</Link>
            <Link to="/guides" className="px-4 py-2 rounded-full border border-white/15 hover:border-secondary hover:text-secondary transition-colors">Guides</Link>
            <Link to="/contact" className="px-4 py-2 rounded-full border border-white/15 hover:border-secondary hover:text-secondary transition-colors">Contact</Link>
          </div>
        </section>

        <Cinema />
      </main>

      <Footer />
    </div>
  );
};

export default CinemaPage;
