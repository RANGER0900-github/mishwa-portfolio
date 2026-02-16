import { motion } from 'framer-motion';
import { useLoading } from '../context/LoadingContext';

const Preloader = () => {
    const { loadingLabel, loadedAssets, totalAssets } = useLoading();
    const progress = totalAssets > 0 ? Math.min(100, Math.round((loadedAssets / totalAssets) * 100)) : 0;

    return (
        <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8, ease: "easeInOut" }}
            className="fixed inset-0 z-[100] bg-background flex flex-col items-center justify-center"
            data-testid="preloader"
        >
            <div className="flex flex-col items-center gap-4">
                <motion.div
                    animate={{
                        scale: [1, 1.2, 1],
                        opacity: [0.5, 1, 0.5]
                    }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                    className="w-16 h-16 border-2 border-secondary rounded-full flex items-center justify-center"
                >
                    <div className="w-8 h-8 bg-primary rounded-full blur-md"></div>
                </motion.div>
                <span className="font-display font-bold text-xl tracking-widest text-white animate-pulse">
                    {loadingLabel || 'Preparing portfolio experience'}
                </span>
                <div className="w-56 h-1.5 rounded-full bg-white/10 overflow-hidden">
                    <motion.div
                        className="h-full bg-gradient-to-r from-primary to-secondary"
                        animate={{ width: `${progress}%` }}
                        transition={{ ease: 'easeOut', duration: 0.25 }}
                    />
                </div>
                <span className="text-xs text-gray-400 tracking-[0.2em] uppercase">
                    {totalAssets > 0 ? `${loadedAssets} / ${totalAssets}` : 'Preparing'}
                </span>
            </div>
        </motion.div>
    );
};

export default Preloader;
