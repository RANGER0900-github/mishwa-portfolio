import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import About from '../components/About';
import Footer from '../components/Footer';

const AboutPage = () => {
  return (
    <div className="bg-background min-h-screen text-white relative overflow-hidden">
      <Navbar />

      <main className="pt-32 px-6 max-w-6xl mx-auto pb-24">
        <section className="rounded-3xl border border-white/10 bg-card-bg/60 p-8 md:p-10 mb-12">
          <p className="text-xs uppercase tracking-[0.22em] text-secondary mb-4">About</p>
          <h1 className="text-4xl md:text-6xl font-display font-bold mb-5">Mishwa Zalavadiya & Coco Club.</h1>
          <p className="text-gray-300 leading-relaxed text-base md:text-lg mb-4">
            Mishwa Zalavadiya is a Surat-based video editor and visual artist creating short-form edits focused on retention, pacing, and story clarity.
            Through Coco Club, the work spans Instagram Reels, cinematic brand narratives, and creator-led campaigns for clients across Surat, Ankleshwar,
            Gujarat, and remote projects across India.
          </p>
          <p className="text-gray-400 leading-relaxed mb-6">
            Every edit is built around watch-time behavior: stronger hooks in the first seconds, cleaner visual transitions, sound design that supports emotion,
            and structure that improves completion rate. Browse archives, projects, and strategy guides to see the editing process and outcomes.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link to="/work" className="px-4 py-2 rounded-full border border-white/15 hover:border-secondary hover:text-secondary transition-colors">Work</Link>
            <Link to="/cinema" className="px-4 py-2 rounded-full border border-white/15 hover:border-secondary hover:text-secondary transition-colors">Cinema</Link>
            <Link to="/contact" className="px-4 py-2 rounded-full border border-white/15 hover:border-secondary hover:text-secondary transition-colors">Contact</Link>
            <Link to="/reels" className="px-4 py-2 rounded-full border border-white/15 hover:border-secondary hover:text-secondary transition-colors">Archives</Link>
            <Link to="/services" className="px-4 py-2 rounded-full border border-white/15 hover:border-secondary hover:text-secondary transition-colors">Services</Link>
            <Link to="/guides" className="px-4 py-2 rounded-full border border-white/15 hover:border-secondary hover:text-secondary transition-colors">Guides</Link>
          </div>
        </section>

        <About />

        <section className="mt-12 rounded-3xl border border-white/10 bg-card-bg/60 p-8 md:p-10">
          <h2 className="text-2xl md:text-3xl font-display font-bold mb-4">Editing Standards and References</h2>
          <p className="text-gray-400 mb-4">
            Coco Club follows modern short-form workflows and platform publishing recommendations.
          </p>
          <ul className="space-y-2 text-gray-300">
            <li><a href="https://www.adobe.com/products/premiere.html" target="_blank" rel="noopener noreferrer" className="text-secondary hover:underline">Adobe Premiere Pro Workflow Reference</a></li>
            <li><a href="https://www.facebook.com/business/instagram/reels" target="_blank" rel="noopener noreferrer" className="text-secondary hover:underline">Instagram Reels Best Practices (Meta)</a></li>
            <li><a href="https://www.youtube.com/creators/" target="_blank" rel="noopener noreferrer" className="text-secondary hover:underline">YouTube Creator Guidance</a></li>
          </ul>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default AboutPage;
