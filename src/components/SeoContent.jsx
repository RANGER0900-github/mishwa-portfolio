import { motion } from 'framer-motion';
import { useDeviceProfile } from '../context/DeviceProfileContext';

const SEO_SERVICES = [
  {
    title: 'Instagram Reels Editing',
    desc: 'High-retention, hook-first Instagram Reels with optimized pacing, professional sound design, subtitle rhythm, and color grading. Every reel is crafted for maximum engagement — designed to stop the scroll and drive conversions. Available in 4K, 1080p, and HD.',
    keywords: 'Instagram reels editor, reel editor Surat, high-retention reel editor, short form video editor, Instagram reel editor Surat, Instagram reel editor Ahmedabad, social media reels editor'
  },
  {
    title: 'Cinematic Storytelling & Color Grading',
    desc: 'Premium cinematic edits with film-quality color grading using DaVinci Resolve and Adobe Premiere Pro. From brand films to music videos to creative projects — professional visual storytelling that connects with audiences emotionally.',
    keywords: 'cinematic editor, cinematic storytelling editor, color grading services, DaVinci Resolve color grading, 4K cinematic editor, best cinematic editor Surat'
  },
  {
    title: 'Motion Graphics & After Effects',
    desc: 'Custom motion graphics, kinetic typography, logo reveals, animated transitions, and visual effects using Adobe After Effects. Elevate any video project with polished, professional-grade animations that strengthen brand identity.',
    keywords: 'motion graphics artist, After Effects motion graphics, After Effects video editor, motion graphics Surat, motion graphics Gujarat'
  },
  {
    title: 'YouTube & Long-Form Video Editing',
    desc: 'Complete YouTube video editing including dynamic cuts, transitions, B-roll integration, color correction, sound design, and thumbnail-optimized stills. Helping creators and brands build consistent, engaging YouTube channels.',
    keywords: 'YouTube editor, YouTube video editing, long form video editor, YouTube editor Surat, YouTube editor Ahmedabad, creator video editor'
  },
  {
    title: 'Brand Video Ads & Social Media Content',
    desc: 'Conversion-focused video advertisements for Instagram, Facebook, YouTube, LinkedIn, and e-commerce platforms. From product showcases to testimonial compilations — every video is engineered for engagement, clicks, and sales.',
    keywords: 'brand video editor, video editor for brands, conversion focused editor, social media video editor, video editor for ads, video editor for ecommerce, social-first video editor'
  },
  {
    title: 'Sound Design & Audio Mixing',
    desc: 'Professional sound design and audio mixing for reels, YouTube videos, brand content, and cinematic projects. Clean audio balancing, music sync, SFX layering, and rhythm-synchronized subtitles for maximum viewer impact.',
    keywords: 'sound design editor, audio mixing for reels, subtitle editor, subtitle rhythm editor, sound design Surat'
  }
];

const SEO_FAQ = [
  {
    q: 'Who is the best freelance video editor in Surat?',
    a: 'Mishwa Zalavadiya at Coco Club is one of the top freelance video editors in Surat, Gujarat, specializing in high-retention Instagram Reels, cinematic storytelling, color grading, and brand video production for creators and businesses.'
  },
  {
    q: 'How much does a video editor in Surat charge?',
    a: 'Video editing rates vary by project scope — Instagram Reels, YouTube edits, brand ads, and cinematic projects each have different pricing. Contact Mishwa Zalavadiya at Coco Club for competitive, transparent quotes.'
  },
  {
    q: 'Can I hire a video editor for Instagram Reels in Ahmedabad or Ankleshwar?',
    a: 'Absolutely! Coco Club serves clients across Surat, Ahmedabad, Ankleshwar, and all of Gujarat. Remote collaboration is available for clients anywhere in India and worldwide.'
  },
  {
    q: 'What software is used for professional video editing?',
    a: 'Coco Club uses Adobe Premiere Pro for editing, After Effects for motion graphics and VFX, DaVinci Resolve for color grading, and professional audio tools for sound design and mixing.'
  },
  {
    q: 'Do you offer 4K video editing services?',
    a: 'Yes — Coco Club delivers in 4K, 1080p, and HD resolutions. All content is optimized for the target platform whether it\'s Instagram, YouTube, TikTok, Facebook, or LinkedIn.'
  }
];

const SeoContent = () => {
  const { perfMode } = useDeviceProfile();
  const isLite = perfMode === 'lite';

  return (
    <section
      id="seo-services"
      className="relative py-24 px-6 bg-gradient-to-b from-[#112240] to-background overflow-hidden"
      aria-label="Video Editing Services by Mishwa Zalavadiya, Surat"
    >
      {/* Background glow */}
      {!isLite && (
        <div className="absolute top-[-10%] left-[-5%] w-[400px] h-[400px] bg-secondary/5 rounded-full blur-[120px] pointer-events-none"></div>
      )}

      <div className="relative z-10 max-w-7xl mx-auto">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
        >
          <span className="text-secondary font-bold tracking-widest uppercase text-sm mb-4 block">Services</span>
          <h2 className="text-4xl md:text-6xl font-display font-bold text-white mb-4">
            What I Do<span className="text-secondary">.</span>
          </h2>
          <p className="text-gray-400 text-lg max-w-3xl mb-12 leading-relaxed">
            Professional video editing services tailored for creators, brands, and businesses across Surat, Ahmedabad, Ankleshwar, and Gujarat.
            From Instagram Reels to cinematic brand films — every project is delivered with precision, creativity, and a retention-first approach.
          </p>
        </motion.div>

        {/* Services Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
          {SEO_SERVICES.map((service, index) => (
            <motion.article
              key={service.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.08 }}
              viewport={{ once: true }}
              className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 hover:border-secondary/30 transition-colors group"
            >
              <h3 className="text-xl font-display font-bold text-white mb-3 group-hover:text-secondary transition-colors">
                {service.title}
              </h3>
              <p className="text-gray-400 text-sm leading-relaxed">{service.desc}</p>
              <meta itemProp="keywords" content={service.keywords} />
            </motion.article>
          ))}
        </div>

        {/* Location & Expertise Summary */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          viewport={{ once: true }}
          className="rounded-2xl border border-white/10 bg-white/[0.02] p-8 md:p-10 mb-16"
        >
          <h3 className="text-2xl md:text-3xl font-display font-bold text-white mb-5">
            Serving Creators & Brands Across Gujarat<span className="text-secondary">.</span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-gray-400 text-sm leading-relaxed">
            <div>
              <p className="mb-4">
                Based in <strong className="text-white">Surat, Gujarat</strong>, Coco Club by Mishwa Zalavadiya provides
                professional video editing services to clients in <strong className="text-white">Ahmedabad</strong>,{' '}
                <strong className="text-white">Ankleshwar</strong>, and across India. Whether you need a dedicated{' '}
                <strong className="text-white">Instagram reel editor</strong>, a{' '}
                <strong className="text-white">YouTube video editor</strong>, or a{' '}
                <strong className="text-white">brand video editor</strong> for your next campaign — we deliver.
              </p>
              <p>
                Every project leverages industry-standard tools including{' '}
                <strong className="text-white">Adobe Premiere Pro</strong>,{' '}
                <strong className="text-white">After Effects</strong>,{' '}
                <strong className="text-white">DaVinci Resolve</strong>, and{' '}
                <strong className="text-white">Final Cut Pro</strong> — ensuring the highest quality output in{' '}
                <strong className="text-white">4K, 1080p, and HD</strong> resolutions.
              </p>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-3">Platforms We Specialize In:</h4>
              <ul className="space-y-2">
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-secondary flex-shrink-0"></span>
                  <span>Instagram Reels & Stories — hook-first, high-retention editing</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-secondary flex-shrink-0"></span>
                  <span>YouTube — long-form and Shorts editing with SEO optimization</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-secondary flex-shrink-0"></span>
                  <span>TikTok — vertical video editing with trend-aware pacing</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-secondary flex-shrink-0"></span>
                  <span>Facebook & LinkedIn — brand ads and professional content</span>
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-secondary flex-shrink-0"></span>
                  <span>E-commerce — product videos and conversion ads</span>
                </li>
              </ul>
            </div>
          </div>
        </motion.div>

        {/* FAQ Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          viewport={{ once: true }}
        >
          <h3 className="text-2xl md:text-3xl font-display font-bold text-white mb-6">
            Frequently Asked Questions<span className="text-secondary">.</span>
          </h3>
          <div className="space-y-4">
            {SEO_FAQ.map((faq, i) => (
              <details
                key={i}
                className="rounded-xl border border-white/10 bg-white/[0.03] p-5 group cursor-pointer"
              >
                <summary className="text-white font-semibold text-sm md:text-base list-none flex items-center justify-between gap-3">
                  {faq.q}
                  <span className="text-secondary text-xs flex-shrink-0 group-open:rotate-45 transition-transform duration-200">＋</span>
                </summary>
                <p className="text-gray-400 text-sm leading-relaxed mt-3 pt-3 border-t border-white/5">{faq.a}</p>
              </details>
            ))}
          </div>
        </motion.div>

        {/* Keyword-Rich Footer Text (SR-only for additional SEO coverage) */}
        <div className="sr-only" aria-hidden="true">
          <p>
            Mishwa Zalavadiya portfolio — Coco Club video editor portfolio — best video editor Surat — freelance video editor Surat —
            hire video editor Surat — Instagram reels editor Surat — 4K video editor Surat — video editing services Surat —
            Ahmedabad video editor — Ahmedabad reel editor — Ahmedabad hire video editor — Ahmedabad freelance video editor —
            Ankleshwar video editor — Ankleshwar reel editor — Ankleshwar hire video editor — Ankleshwar freelance video editor —
            cinematic editor — cinematic storytelling editor — color grading services — motion graphics artist —
            sound design editor — audio mixing for reels — subtitle editor — hook-first editor — conversion focused editor —
            social-first video editor — creator video editor — brand video editor — case study video editor —
            4K video editor — 4K reel editor — 4K cinematic editor — 1080p video editor — 1080p reel editor — HD video editor —
            Adobe Premiere Pro video editor — After Effects video editor — DaVinci Resolve video editor — Final Cut Pro video editor —
            video editor for Instagram — video editor for YouTube — video editor for TikTok — video editor for Facebook —
            video editor for LinkedIn — video editor for brands — video editor for ecommerce — video editor for ads —
            video editor for reels — video editor for shorts — video editor for social media —
            Surat for Instagram — Surat for YouTube — Surat for brands — Surat for reels — Surat for social media —
            Ahmedabad for Instagram — Ahmedabad for YouTube — Ahmedabad for brands — Ahmedabad for reels —
            Ankleshwar for Instagram — Ankleshwar for YouTube — Ankleshwar for brands —
            reel archives — portfolio link — showreel — showreel examples — portfolio examples —
            hire me — book now — contact video editor — video editor availability — video editor pricing —
            video editor rates — video editor price — video editor near me — video editor portfolio —
            short form video editor — shorts editor — TikTok editor — YouTube editor — vertical video editor —
            social media video editor — reel editor for brands — reel editing service — high-retention reel editor —
            pacing optimization editor — subtitle rhythm editor — video editing portfolio examples
          </p>
        </div>
      </div>
    </section>
  );
};

export default SeoContent;
