import { Link } from 'react-router-dom';
import { ArrowUpRight, Instagram, Mail } from 'lucide-react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { useContent } from '../context/ContentContext';
import { formatExternalLink } from '../utils/linkUtils';

const ContactPage = () => {
  const { content } = useContent();
  const social = content?.social || {};
  const email = social.email || 'mishwa@example.com';
  const instagramUrl = formatExternalLink(social.instagram || 'https://www.instagram.com/_thecoco_club/');

  return (
    <div className="bg-background min-h-screen text-white relative overflow-hidden">
      <Navbar />

      <main className="pt-32 px-6 max-w-6xl mx-auto pb-24" id="contact">
        <section className="rounded-[2rem] border border-primary/20 bg-gradient-to-b from-[#0a1f35] to-[#061425] p-8 md:p-12">
          <p className="text-xs uppercase tracking-[0.22em] text-secondary mb-4">Contact</p>
          <h1 className="text-4xl md:text-6xl font-display font-bold leading-[1.05] mb-5">Ready To Level Up Your Edits?</h1>
          <p className="text-gray-300 text-base md:text-lg leading-relaxed mb-8 max-w-3xl">
            If you need high-retention reels, cinematic short-form campaigns, or consistent post-production support,
            send your project brief and target posting schedule. Coco Club works with creators and brands across Surat,
            Gujarat, and remote clients across India.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 mb-10">
            <a
              href={`mailto:${email}`}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-secondary text-background font-semibold hover:brightness-110 transition"
            >
              <Mail className="w-4 h-4" />
              Email Project Brief
            </a>
            <a
              href={instagramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full border border-white/20 text-white hover:bg-white hover:text-background transition"
            >
              <Instagram className="w-4 h-4" />
              Instagram DM
            </a>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Link to="/services" className="rounded-xl border border-white/10 bg-white/[0.03] px-5 py-4 hover:border-secondary transition-colors">
              <p className="font-semibold text-white mb-1">Services</p>
              <p className="text-sm text-gray-400">Explore editing service packages.</p>
            </Link>
            <Link to="/case-studies" className="rounded-xl border border-white/10 bg-white/[0.03] px-5 py-4 hover:border-secondary transition-colors">
              <p className="font-semibold text-white mb-1">Case Studies</p>
              <p className="text-sm text-gray-400">See outcomes and strategy breakdowns.</p>
            </Link>
            <Link to="/reels" className="rounded-xl border border-white/10 bg-white/[0.03] px-5 py-4 hover:border-secondary transition-colors">
              <p className="font-semibold text-white mb-1">Reel Archives</p>
              <p className="text-sm text-gray-400">Review categories and finished edits.</p>
            </Link>
            <Link to="/guides" className="rounded-xl border border-white/10 bg-white/[0.03] px-5 py-4 hover:border-secondary transition-colors">
              <p className="font-semibold text-white mb-1">Guides</p>
              <p className="text-sm text-gray-400">Read retention and storytelling playbooks.</p>
            </Link>
          </div>

          <a
            href="https://www.instagram.com/_thecoco_club/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-secondary mt-8 hover:underline"
          >
            Follow Coco Club on Instagram
            <ArrowUpRight className="w-4 h-4" />
          </a>
        </section>
      </main>

      <Footer />
    </div>
  );
};

export default ContactPage;
