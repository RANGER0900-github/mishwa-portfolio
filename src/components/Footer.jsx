import { motion } from 'framer-motion';
import { Instagram, Youtube, Twitter, Mail, Linkedin, Facebook, MapPin } from 'lucide-react';
import { useContent } from '../context/ContentContext';
import { useDeviceProfile } from '../context/DeviceProfileContext';
import { formatExternalLink } from '../utils/linkUtils';

const Footer = () => {
    const { content } = useContent();
    const { perfMode } = useDeviceProfile();
    const isLite = perfMode === 'lite';

    if (!content) return null;
    const { footer, social } = content;

    if (!footer) return null;

    const currentYear = new Date().getFullYear();

    return (
        <footer id="contact" className="relative z-10 pt-20 pb-12" itemScope itemType="https://schema.org/WPFooter">
            <svg
                className="w-full h-20 -mb-1"
                viewBox="0 0 1200 100"
                preserveAspectRatio="none"
                xmlns="http://www.w3.org/2000/svg"
            >
                <defs>
                    <linearGradient id="footerGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="rgba(100,255,218,0.1)" />
                        <stop offset="100%" stopColor="rgba(100,255,218,0)" />
                    </linearGradient>
                </defs>
                <path
                    d="M0,50 Q300,0 600,50 T1200,50 L1200,100 L0,100 Z"
                    fill="url(#footerGradient)"
                />
                <path
                    d="M0,50 Q300,0 600,50 T1200,50"
                    stroke="rgba(100,255,218,0.2)"
                    strokeWidth="2"
                    fill="none"
                />
            </svg>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
                className={`px-6 border-t border-white/5 bg-gradient-to-b from-[#0a192f]/80 to-black ${isLite ? '' : 'backdrop-blur-md'}`}
            >
                <div className="max-w-7xl mx-auto py-12 flex flex-col gap-8">
                    {/* Location & Brand Info */}
                    <div className="flex flex-col md:flex-row justify-between items-center gap-6">
                        <div className="text-center md:text-left">
                            <p className="text-white font-display font-bold text-lg mb-1">Coco Club<span className="text-secondary">.</span></p>
                            <div className="flex items-center gap-2 text-gray-400 text-sm">
                                <MapPin size={14} className="text-secondary flex-shrink-0" />
                                <address className="not-italic" itemScope itemType="https://schema.org/PostalAddress">
                                    <span itemProp="addressLocality">Surat</span>,{' '}
                                    <span itemProp="addressRegion">Gujarat</span>,{' '}
                                    <span itemProp="addressCountry">India</span>
                                </address>
                            </div>
                            <p className="text-gray-500 text-xs mt-1">Freelance Video Editor • Instagram Reels • Cinematic Edits</p>
                        </div>

                        {/* Social Icons */}
                        {footer.showSocial && social && (
                            <motion.div
                                className="flex items-center gap-5"
                                initial={{ opacity: 0 }}
                                whileInView={{ opacity: 1 }}
                                transition={{ delay: 0.2 }}
                            >
                                {social.instagram && (
                                    <motion.a
                                        href={formatExternalLink(social.instagram)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        aria-label="Follow Coco Club on Instagram"
                                        className="text-gray-400 hover:text-secondary transition-all p-2 hover:bg-secondary/10 rounded-lg"
                                        whileHover={{ scale: 1.2 }}
                                        whileTap={{ scale: 0.95 }}
                                    >
                                        <Instagram size={20} />
                                    </motion.a>
                                )}
                                {social.youtube && (
                                    <motion.a
                                        href={formatExternalLink(social.youtube)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        aria-label="Watch Coco Club on YouTube"
                                        className="text-gray-400 hover:text-secondary transition-all p-2 hover:bg-secondary/10 rounded-lg"
                                        whileHover={{ scale: 1.2 }}
                                        whileTap={{ scale: 0.95 }}
                                    >
                                        <Youtube size={20} />
                                    </motion.a>
                                )}
                                {social.twitter && (
                                    <motion.a
                                        href={formatExternalLink(social.twitter)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        aria-label="Follow Coco Club on X (Twitter)"
                                        className="text-gray-400 hover:text-secondary transition-all p-2 hover:bg-secondary/10 rounded-lg"
                                        whileHover={{ scale: 1.2 }}
                                        whileTap={{ scale: 0.95 }}
                                    >
                                        <Twitter size={20} />
                                    </motion.a>
                                )}
                                <motion.a
                                    href="https://www.linkedin.com/"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    aria-label="Connect with Mishwa Zalavadiya on LinkedIn"
                                    className="text-gray-400 hover:text-secondary transition-all p-2 hover:bg-secondary/10 rounded-lg"
                                    whileHover={{ scale: 1.2 }}
                                    whileTap={{ scale: 0.95 }}
                                >
                                    <Linkedin size={20} />
                                </motion.a>
                                <motion.a
                                    href="https://www.facebook.com/"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    aria-label="Follow Coco Club on Facebook"
                                    className="text-gray-400 hover:text-secondary transition-all p-2 hover:bg-secondary/10 rounded-lg"
                                    whileHover={{ scale: 1.2 }}
                                    whileTap={{ scale: 0.95 }}
                                >
                                    <Facebook size={20} />
                                </motion.a>
                                {social.email && (
                                    <motion.a
                                        href={`mailto:${social.email}`}
                                        aria-label="Email Mishwa Zalavadiya"
                                        className="text-gray-400 hover:text-secondary transition-all p-2 hover:bg-secondary/10 rounded-lg"
                                        whileHover={{ scale: 1.2 }}
                                        whileTap={{ scale: 0.95 }}
                                    >
                                        <Mail size={20} />
                                    </motion.a>
                                )}
                            </motion.div>
                        )}
                    </div>

                    {/* Divider */}
                    <div className="h-px bg-white/5"></div>

                    {/* Copyright & SEO Text */}
                    <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                        <motion.p
                            className="text-gray-500 text-xs font-light tracking-wide"
                            whileHover={{ color: '#64ffda' }}
                            transition={{ duration: 0.3 }}
                        >
                            {footer.copyright || `© ${currentYear} Coco Club by Mishwa Zalavadiya. All rights reserved.`}
                        </motion.p>
                        <p className="text-gray-600 text-[10px] tracking-wide text-center md:text-right max-w-md">
                            Video Editor Surat • Instagram Reels Editor • Cinematic Editor • Color Grading • Motion Graphics • Gujarat, India
                        </p>
                    </div>
                </div>
            </motion.div>
        </footer>
    );
};

export default Footer;
