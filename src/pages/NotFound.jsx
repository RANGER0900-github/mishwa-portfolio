import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

const NotFound = () => (
  <div className="bg-background min-h-screen text-white relative overflow-hidden">
    <Navbar />

    <main className="pt-32 px-6 max-w-4xl mx-auto pb-24">
      <h1 className="text-4xl md:text-6xl font-display font-bold text-white mb-4">
        Page Not Found<span className="text-secondary">.</span>
      </h1>
      <p className="text-gray-400 text-lg mb-10">
        This page doesn&apos;t exist. Use the links below to get back to the portfolio.
      </p>

      <div className="flex flex-wrap gap-3">
        <Link
          to="/"
          className="px-7 py-4 rounded-full bg-secondary text-black font-bold uppercase tracking-widest text-xs hover:bg-secondary/90 transition-transform active:scale-95"
        >
          Home
        </Link>
        <Link
          to="/reels"
          className="px-7 py-4 rounded-full bg-white/5 border border-white/10 hover:bg-white/10 transition-colors font-bold uppercase tracking-widest text-xs"
        >
          View Archives
        </Link>
      </div>
    </main>

    <Footer />
  </div>
);

export default NotFound;

