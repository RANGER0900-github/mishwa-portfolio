import { useState, useRef, useEffect } from 'react';
import { useContent } from '../../context/ContentContext';
import {
    Save, Plus, Trash, Image as ImageIcon, Link as LinkIcon, Upload, Loader2,
    Eye, EyeOff, Palette, Move, Star, Instagram, Mail, Youtube, Twitter,
    GripVertical, ExternalLink, User, MessageSquare
} from 'lucide-react';
import toast, { Toaster } from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import SmoothColorPicker from '../../components/SmoothColorPicker';

const ContentCMS = () => {
    const { content, updateContent } = useContent();
    const [localContent, setLocalContent] = useState(null);
    const [saving, setSaving] = useState(false);
    const [activeTab, setActiveTab] = useState('projects');
    const [uploading, setUploading] = useState(null);
    const [previewProject, setPreviewProject] = useState(null);
    const [draggedText, setDraggedText] = useState({ x: 50, y: 50 });
    const [hasChanges, setHasChanges] = useState(false);
    const [showSaveButton, setShowSaveButton] = useState(false);
    const [colorPickerOpen, setColorPickerOpen] = useState(null);
    const fileInputRef = useRef(null);
    const [currentUploadTarget, setCurrentUploadTarget] = useState({ type: null, id: null });
    const saveButtonRef = useRef(null);

    useEffect(() => {
        if (content && !localContent) {
            setLocalContent({
                ...content,
                projects: content.projects || [],
                social: content.social || { email: '', instagram: '', youtube: '', twitter: '' },
                reviews: content.reviews || [],
                footer: content.footer || { copyright: '', showSocial: true }
            });
            setHasChanges(false);
            setShowSaveButton(false);
        }
    }, [content, localContent]);

    if (!localContent) return (
        <div className="flex items-center justify-center min-h-[400px]">
            <Loader2 className="animate-spin text-secondary" size={32} />
            <span className="ml-3 text-white">Loading Content Manager...</span>
        </div>
    );

    const handleSave = async () => {
        setSaving(true);
        try {
            await updateContent(localContent);
            toast.success('Content updated successfully!');
            setHasChanges(false);
            setShowSaveButton(false);
        } catch (err) {
            toast.error('Failed to update content');
        }
        setSaving(false);
    };

    const trackChange = (newContent) => {
        setLocalContent(newContent);
        setHasChanges(true);
        setShowSaveButton(true);
    };

    const handleProjectChange = (id, field, value) => {
        const updatedProjects = localContent.projects.map(p =>
            p.id === id ? { ...p, [field]: value } : p
        );
        const newContent = { ...localContent, projects: updatedProjects };
        trackChange(newContent);

        // If preview for this project is open, keep it in sync with edits
        if (previewProject?.id === id) {
            const updated = updatedProjects.find(p => p.id === id);
            setPreviewProject(updated);
        }
    };

    const addProject = () => {
        const newProject = {
            id: Date.now(),
            title: "New Project",
            category: "Fashion & Apparel",
            image: "https://images.unsplash.com/photo-1549557613-21c6020586a0",
            link: "",
            orientation: "portrait",
            textColor: "#ffffff",
            textPosition: { x: 50, y: 85 }
        };
        trackChange({
            ...localContent,
            projects: [newProject, ...(localContent.projects || [])]
        });
        toast.success("New Project Added!");
    };

    const removeProject = (id) => {
        if (!window.confirm("Delete this project?")) return;
        const updatedProjects = localContent.projects.filter(p => p.id !== id);
        trackChange({ ...localContent, projects: updatedProjects });
        toast.success("Project Deleted");
    };

    const handleReviewChange = (id, field, value) => {
        const updatedReviews = localContent.reviews.map(r =>
            r.id === id ? { ...r, [field]: value } : r
        );
        trackChange({ ...localContent, reviews: updatedReviews });
    };

    const addReview = () => {
        const newReview = {
            id: Date.now(),
            name: "New Review",
            role: "Client",
            text: "Amazing work!",
            image: "https://randomuser.me/api/portraits/lego/1.jpg"
        };
        trackChange({
            ...localContent,
            reviews: [newReview, ...(localContent.reviews || [])]
        });
        toast.success("New Review Added!");
    };

    const removeReview = (id) => {
        if (!window.confirm("Delete this review?")) return;
        const updatedReviews = localContent.reviews.filter(r => r.id !== id);
        trackChange({ ...localContent, reviews: updatedReviews });
        toast.success("Review Deleted");
    };

    const handleImageUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setUploading(currentUploadTarget.id || 'global');

        try {
            const reader = new FileReader();
            reader.onload = async (event) => {
                const base64 = event.target?.result;
                const endpoint = currentUploadTarget.type === 'headerIcon' ? '/api/upload/header-icon' : '/api/upload';

                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        file: base64,
                        filename: file.name,
                        type: file.type
                    })
                });

                const data = await response.json();

                if (currentUploadTarget.type === 'project' && data.url) {
                    handleProjectChange(currentUploadTarget.id, 'image', data.url);
                    toast.success('Image uploaded!');
                } else if (currentUploadTarget.type === 'review' && data.url) {
                    handleReviewChange(currentUploadTarget.id, 'image', data.url);
                    toast.success('Image uploaded!');
                } else if (currentUploadTarget.type === 'aboutImage') {
                    const aboutUrl = data.url || data.defaultUrl || (data.variants && data.variants['180px']) || (data.variants && Object.values(data.variants)[0]);
                    trackChange({ ...localContent, about: { ...localContent.about, image: aboutUrl } });
                    toast.success('About image uploaded!');
                } else if (currentUploadTarget.type === 'headerIcon') {
                    const defaultUrl = data.defaultUrl || (data.variants && data.variants['180px']) || (data.variants && Object.values(data.variants)[0]);
                    trackChange({ ...localContent, headerIcon: defaultUrl, headerIconVariants: data.variants || {} });
                    toast.success('Header icon uploaded!');
                } else if (data.url) {
                    // Generic fallback
                    toast.success('Image uploaded!');
                } else {
                    toast.error('Upload failed');
                }
            };
            reader.readAsDataURL(file);
        } catch (error) {
            toast.error('Upload failed');
        } finally {
            setUploading(null);
        }
    };

    const triggerUpload = (type, id) => {
        setCurrentUploadTarget({ type, id });
        fileInputRef.current?.click();
    };

    const categories = [
        "Beauty & Personal Care", "Food & Beverage", "Fitness & Wellness",
        "Fashion & Apparel", "Travel & Local experience", "Tech & Gadgets",
        "Real Estate", "Other"
    ];

    const colorPresets = ['#ffffff', '#64ffda', '#0070f3', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#000000'];

    const ProjectPreview = ({ project, onClose }) => {
        const [textPos, setTextPos] = useState(project.textPosition || { x: 50, y: 85 });
        const [isDragging, setIsDragging] = useState(false);
        const previewRef = useRef(null);

        const handleMouseMove = (e) => {
            if (!isDragging || !previewRef.current) return;
            const rect = previewRef.current.getBoundingClientRect();
            const x = Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100));
            const y = Math.min(100, Math.max(0, ((e.clientY - rect.top) / rect.height) * 100));
            setTextPos({ x, y });
        };

        const handleMouseUp = () => {
            if (isDragging) {
                handleProjectChange(project.id, 'textPosition', textPos);
                setIsDragging(false);
            }
        };

        return (
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4 overflow-y-auto"
                onClick={onClose}
            >
                <motion.div
                    initial={{ scale: 0.9, y: 20 }}
                    animate={{ scale: 1, y: 0 }}
                    exit={{ scale: 0.9, y: 20 }}
                    className="relative w-full max-w-sm my-6"
                    onClick={e => e.stopPropagation()}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                    onWheel={(e) => e.stopPropagation()}
                >
                    <motion.button
                        onClick={onClose}
                        className="absolute -top-3 -right-3 z-60 w-10 h-10 bg-primary text-black rounded-full flex items-center justify-center font-bold hover:scale-110 transition-transform"
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.95 }}
                    >
                        ✕
                    </motion.button>
                    <div
                        ref={previewRef}
                        className="relative rounded-3xl overflow-hidden border-8 border-primary/40 shadow-2xl bg-gradient-to-br from-primary/5 to-secondary/5"
                        style={{ aspectRatio: '9/16' }}
                    >
                        <img src={project.image} alt={project.title} className="w-full h-full object-cover" />
                        
                        <motion.div
                            className="absolute cursor-move select-none"
                            style={{
                                left: `${textPos.x}%`,
                                top: `${textPos.y}%`,
                                transform: 'translate(-50%, -50%)',
                                color: project.textColor || '#ffffff'
                            }}
                            onMouseDown={() => setIsDragging(true)}
                            animate={{ scale: isDragging ? 1.05 : 1 }}
                            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                        >
                            <motion.div 
                                className="flex items-center gap-2 opacity-50 text-xs mb-2"
                                animate={{ opacity: isDragging ? 0.8 : 0.5 }}
                            >
                                <GripVertical size={14} /> {isDragging ? 'Moving...' : 'Drag text'}
                            </motion.div>
                            <motion.h3 
                                className="text-2xl font-bold drop-shadow-lg whitespace-nowrap"
                                animate={{ textShadow: isDragging ? '0px 0px 15px rgba(100,255,218,0.6)' : '0px 0px 5px rgba(0,0,0,0.8)' }}
                            >
                                {project.title}
                            </motion.h3>
                            <p className="text-sm opacity-80 drop-shadow-md">{project.category}</p>
                        </motion.div>
                    </div>

                    <motion.div 
                        className="mt-6 space-y-3"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                    >
                        <div className="grid grid-cols-3 gap-3">
                            <div className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-md border border-primary/30 rounded-xl p-3">
                                <p className="text-gray-300 text-xs mb-1 font-bold uppercase">Position X</p>
                                <p className="text-primary font-mono font-bold text-sm">{textPos.x.toFixed(1)}%</p>
                            </div>
                            <div className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-md border border-primary/30 rounded-xl p-3">
                                <p className="text-gray-300 text-xs mb-1 font-bold uppercase">Position Y</p>
                                <p className="text-primary font-mono font-bold text-sm">{textPos.y.toFixed(1)}%</p>
                            </div>
                            <div className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-md border border-primary/30 rounded-xl p-3">
                                <p className="text-gray-300 text-xs mb-1 font-bold uppercase">Ratio</p>
                                <p className="text-primary font-mono font-bold text-sm">9:16</p>
                            </div>
                        </div>

                        <div className="bg-gradient-to-r from-primary/10 to-secondary/10 backdrop-blur-md border border-primary/30 rounded-xl p-4">
                            <p className="text-xs text-gray-300 leading-relaxed">
                                <span className="text-primary font-bold">✓ Website Preview:</span> This shows your project exactly as it appears on your portfolio (9:16 aspect ratio). Drag the text to position it perfectly!
                            </p>
                        </div>
                    </motion.div>

                    <motion.div 
                        className="mt-6 flex gap-3"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.3 }}
                    >
                        <motion.button 
                            onClick={onClose}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            className="flex-1 px-6 py-3 bg-gradient-to-r from-primary to-secondary text-black font-bold rounded-xl hover:shadow-lg shadow-primary/30 transition-all uppercase text-sm tracking-wider"
                        >
                            Done & Close
                        </motion.button>
                        <motion.button 
                            onClick={() => {
                                setTextPos({ x: 50, y: 85 });
                                handleProjectChange(project.id, 'textPosition', { x: 50, y: 85 });
                            }}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            className="px-6 py-3 bg-white/5 border border-white/20 rounded-xl text-white hover:bg-white/10 transition-all text-sm font-bold"
                        >
                            Reset Position
                        </motion.button>
                    </motion.div>
                </motion.div>
            </motion.div>
        );
    };

    return (
        <div className="max-w-7xl mx-auto pb-20">
            <Toaster position="bottom-right" toastOptions={{
                style: { background: '#112240', color: '#64ffda', border: '1px solid rgba(100,255,218,0.2)' }
            }} />

            <input
                type="file"
                ref={fileInputRef}
                onChange={handleImageUpload}
                accept="image/svg+xml,image/jpeg,image/png,image/gif,image/webp"
                className="hidden"
            />

            <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-4">
                <div>
                    <h1 className="text-5xl font-display font-black text-white mb-2">Content CMS<span className="text-primary">.</span></h1>
                    <p className="text-gray-400">Manage your portfolio content, projects, and reviews.</p>
                </div>
            </header>

            <AnimatePresence>
                {showSaveButton && (
                    <motion.div
                        ref={saveButtonRef}
                        initial={{ opacity: 0, y: 20, scale: 0.9 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 20, scale: 0.9 }}
                        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                        className="fixed bottom-8 right-8 z-40"
                    >
                        <motion.button
                            onClick={() => {
                                handleSave();
                                setShowSaveButton(false);
                            }}
                            disabled={saving}
                            whileHover={{ scale: 1.08, boxShadow: '0 0 30px rgba(100,255,218,0.5)' }}
                            whileTap={{ scale: 0.95 }}
                            className="flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-primary to-secondary text-black font-bold rounded-2xl hover:shadow-2xl transition-all disabled:opacity-50 shadow-[0_0_25px_rgba(100,255,218,0.4)] uppercase text-sm tracking-wider"
                        >
                            <motion.div
                                animate={{ rotate: saving ? 360 : 0 }}
                                transition={{ duration: 2, repeat: saving ? Infinity : 0 }}
                            >
                                <Save size={20} />
                            </motion.div>
                            {saving ? 'Saving...' : '✓ Save Changes'}
                        </motion.button>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="flex gap-3 mb-8 overflow-x-auto pb-2 flex-wrap">
                {['projects', 'reviews', 'hero', 'cinema', 'about', 'branding', 'social', 'footer'].map(tab => (
                    <motion.button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`px-5 py-3 rounded-xl font-bold uppercase tracking-wider transition-all border text-sm ${activeTab === tab
                            ? 'bg-white/10 border-primary text-primary shadow-[0_0_15px_rgba(100,255,218,0.2)]'
                            : 'bg-transparent border-white/10 text-gray-500 hover:text-white'
                            }`}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                    >
                        {tab}
                    </motion.button>
                ))}
            </div>

            <AnimatePresence mode='wait'>
                {activeTab === 'projects' && (
                    <motion.div key="projects" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
                        <motion.button onClick={addProject} className="w-full py-6 border-2 border-dashed border-white/10 rounded-3xl text-gray-400 hover:border-primary hover:text-primary hover:bg-primary/5 transition-all flex items-center justify-center gap-3 font-bold text-lg" whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
                            <Plus size={24} /> ADD NEW PROJECT
                        </motion.button>

                        <div className="grid grid-cols-1 gap-6">
                            {localContent.projects && localContent.projects.length > 0 ? localContent.projects.map((project) => (
                                <motion.div key={project.id} layout initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-[#112240]/50 border border-white/5 rounded-2xl p-6 flex flex-col lg:flex-row gap-6 group hover:border-white/20 transition-all">
                                    <div className="w-full lg:w-56 flex-shrink-0">
                                        <div className="relative rounded-xl overflow-hidden bg-black/50 aspect-[3/4] border border-white/10">
                                            {project.image ? (
                                                <img src={project.image} alt="Preview" className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="flex items-center justify-center h-full text-gray-600"><ImageIcon size={40} /></div>
                                            )}
                                            {uploading === project.id && (
                                                <div className="absolute inset-0 bg-black/80 flex items-center justify-center">
                                                    <Loader2 size={32} className="text-secondary animate-spin" />
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex gap-2 mt-3">
                                            <motion.button onClick={() => triggerUpload('project', project.id)} disabled={uploading === project.id} className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-white/5 hover:bg-secondary/20 border border-white/10 hover:border-secondary/50 rounded-lg text-gray-400 hover:text-secondary transition-all text-xs font-bold" whileHover={{ scale: 1.02 }}>
                                                <Upload size={14} /> Upload
                                            </motion.button>
                                            <motion.button onClick={() => setPreviewProject(localContent.projects.find(p => p.id === project.id))} className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-white/5 hover:bg-primary/20 border border-white/10 hover:border-primary/50 rounded-lg text-gray-400 hover:text-primary transition-all text-xs font-bold" whileHover={{ scale: 1.02 }}>
                                                <Eye size={14} /> Preview
                                            </motion.button>
                                        </div>
                                    </div>

                                    <div className="flex-1 space-y-4">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Title</label>
                                                <input type="text" value={project.title} onChange={(e) => handleProjectChange(project.id, 'title', e.target.value)} className="w-full bg-[#0a192f] border border-white/10 rounded-xl px-4 py-3 text-white focus:border-primary focus:outline-none font-bold" />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Category</label>
                                                <select value={project.category} onChange={(e) => handleProjectChange(project.id, 'category', e.target.value)} className="w-full bg-[#0a192f] border border-white/10 rounded-xl px-4 py-3 text-white focus:border-primary focus:outline-none">
                                                    {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                                                </select>
                                            </div>
                                        </div>

                                        <div>
                                            <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Image URL</label>
                                            <input type="text" value={project.image} onChange={(e) => handleProjectChange(project.id, 'image', e.target.value)} className="w-full bg-[#0a192f] border border-white/10 rounded-xl px-4 py-3 text-sm font-mono text-cyan-300 focus:border-primary focus:outline-none" placeholder="https://..." />
                                        </div>

                                        <div>
                                            <label className="block text-xs font-bold uppercase tracking-wider text-primary mb-2 flex items-center gap-2"><LinkIcon size={14} /> Redirect Link</label>
                                            <input type="text" value={project.link || ''} onChange={(e) => handleProjectChange(project.id, 'link', e.target.value)} className="w-full bg-[#0a192f] border border-primary/30 rounded-xl px-4 py-3 text-white focus:border-primary focus:outline-none placeholder-white/20" placeholder="https://instagram.com/reel/..." />
                                        </div>

                                        <div>
                                            <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-3 flex items-center gap-2"><Palette size={14} /> Text Color</label>
                                            <div className="relative">
                                                <motion.button
                                                    onClick={() => setColorPickerOpen(colorPickerOpen === project.id ? null : project.id)}
                                                    whileHover={{ scale: 1.02 }}
                                                    whileTap={{ scale: 0.98 }}
                                                    className="w-full flex items-center gap-3 bg-gradient-to-r from-white/5 to-white/5 border border-primary/30 rounded-xl px-4 py-3 text-white hover:border-primary/50 hover:bg-white/10 transition-all"
                                                >
                                                    <div
                                                        className="w-10 h-10 rounded-lg border-2 border-white/30 shadow-lg"
                                                        style={{ backgroundColor: project.textColor || '#ffffff' }}
                                                    />
                                                    <div className="flex-1 text-left">
                                                        <p className="text-xs text-gray-400">Selected Color</p>
                                                        <p className="font-mono text-white font-bold">{project.textColor || '#ffffff'}</p>
                                                    </div>
                                                    <span className="text-gray-400">{colorPickerOpen === project.id ? '▲' : '▼'}</span>
                                                </motion.button>

                                                <AnimatePresence>
                                                    {colorPickerOpen === project.id && (
                                                        <motion.div
                                                            initial={{ opacity: 0, y: -10, scale: 0.95 }}
                                                            animate={{ opacity: 1, y: 0, scale: 1 }}
                                                            exit={{ opacity: 0, y: -10, scale: 0.95 }}
                                                            transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                                                            className="absolute top-full left-0 right-0 mt-3 z-50 max-h-[300px] overflow-y-auto p-2 bg-[#0a192f] border border-white/10 rounded-xl"
                                                            onClick={(e) => e.stopPropagation()}
                                                            onWheel={(e) => e.stopPropagation()}
                                                        >
                                                            <SmoothColorPicker
                                                                value={project.textColor || '#ffffff'}
                                                                onChange={(color) => {
                                                                    handleProjectChange(project.id, 'textColor', color);
                                                                    setColorPickerOpen(null);
                                                                }}
                                                                onClose={() => setColorPickerOpen(null)}
                                                            />
                                                        </motion.div>
                                                    )}
                                                </AnimatePresence>
                                            </div>
                                        </div>

                                        <div className="flex justify-between pt-2">
                                            <span className="text-xs text-gray-500 flex items-center gap-1"><Move size={12} /> Use Preview to drag text position</span>
                                            <motion.button onClick={() => removeProject(project.id)} className="text-red-400 hover:text-red-500 flex items-center gap-2 px-4 py-2 hover:bg-red-500/10 rounded-lg transition-all text-sm font-bold" whileHover={{ scale: 1.05 }}>
                                                <Trash size={16} /> Remove
                                            </motion.button>
                                        </div>
                                    </div>
                                </motion.div>
                            )) : (
                                <div className="text-center py-16 text-gray-500">
                                    <ImageIcon size={48} className="mx-auto mb-4 opacity-50" />
                                    <p>No projects found. Add your first project above!</p>
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}

                {activeTab === 'reviews' && (
                    <motion.div key="reviews" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="space-y-6">
                        <motion.button onClick={addReview} className="w-full py-6 border-2 border-dashed border-white/10 rounded-3xl text-gray-400 hover:border-primary hover:text-primary hover:bg-primary/5 transition-all flex items-center justify-center gap-3 font-bold text-lg" whileHover={{ scale: 1.01 }}>
                            <Plus size={24} /> ADD NEW REVIEW
                        </motion.button>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {localContent.reviews && localContent.reviews.length > 0 ? localContent.reviews.map((review) => (
                                <motion.div key={review.id} layout initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-[#112240]/50 border border-white/5 rounded-2xl p-6 hover:border-white/20 transition-all">
                                    <div className="flex items-start gap-4 mb-4">
                                        <div className="relative">
                                            <img src={review.image} alt={review.name} className="w-16 h-16 rounded-full object-cover border-2 border-white/10" />
                                            <button onClick={() => triggerUpload('review', review.id)} className="absolute -bottom-1 -right-1 p-1.5 bg-secondary rounded-full text-black hover:scale-110 transition-transform">
                                                {uploading === review.id ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                                            </button>
                                        </div>
                                        <div className="flex-1">
                                            <input type="text" value={review.name} onChange={(e) => handleReviewChange(review.id, 'name', e.target.value)} className="w-full bg-transparent border-b border-white/10 pb-1 text-white font-bold focus:border-primary focus:outline-none" placeholder="Reviewer Name" />
                                            <input type="text" value={review.role} onChange={(e) => handleReviewChange(review.id, 'role', e.target.value)} className="w-full bg-transparent border-b border-white/10 pb-1 text-gray-400 text-sm mt-1 focus:border-primary focus:outline-none" placeholder="Role/Title" />
                                        </div>
                                        <button onClick={() => removeReview(review.id)} className="p-2 text-red-400 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all">
                                            <Trash size={16} />
                                        </button>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2 flex items-center gap-2"><MessageSquare size={12} /> Review Text</label>
                                        <textarea value={review.text} onChange={(e) => handleReviewChange(review.id, 'text', e.target.value)} rows={3} className="w-full bg-[#0a192f] border border-white/10 rounded-xl px-4 py-3 text-white focus:border-primary focus:outline-none resize-none" placeholder="What did they say?" />
                                    </div>
                                    <div className="mt-3">
                                        <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Image URL</label>
                                        <input type="text" value={review.image} onChange={(e) => handleReviewChange(review.id, 'image', e.target.value)} className="w-full bg-[#0a192f] border border-white/10 rounded-xl px-4 py-3 text-sm font-mono text-cyan-300 focus:border-primary focus:outline-none" placeholder="https://..." />
                                    </div>
                                </motion.div>
                            )) : (
                                <div className="col-span-2 text-center py-16 text-gray-500">
                                    <Star size={48} className="mx-auto mb-4 opacity-50" />
                                    <p>No reviews yet. Add client testimonials above!</p>
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}

                {activeTab === 'hero' && (
                    <motion.div key="hero" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6 max-w-2xl">
                        <div className="bg-[#112240]/50 p-8 rounded-3xl border border-white/5 space-y-6">
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Main Title</label>
                                <input type="text" value={localContent.hero?.title || ''} onChange={(e) => trackChange({ ...localContent, hero: { ...localContent.hero, title: e.target.value } })} className="w-full bg-[#0a192f] border border-white/10 rounded-xl px-4 py-3 text-white text-2xl font-bold focus:border-primary focus:outline-none" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Subtitle</label>
                                <input type="text" value={localContent.hero?.subtitle || ''} onChange={(e) => trackChange({ ...localContent, hero: { ...localContent.hero, subtitle: e.target.value } })} className="w-full bg-[#0a192f] border border-white/10 rounded-xl px-4 py-3 text-white focus:border-primary focus:outline-none" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Description</label>
                                <textarea value={localContent.hero?.description || ''} onChange={(e) => trackChange({ ...localContent, hero: { ...localContent.hero, description: e.target.value } })} rows={4} className="w-full bg-[#0a192f] border border-white/10 rounded-xl px-4 py-3 text-white focus:border-primary focus:outline-none resize-none" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Button Text</label>
                                <input type="text" value={localContent.hero?.buttonText || ''} onChange={(e) => trackChange({ ...localContent, hero: { ...localContent.hero, buttonText: e.target.value } })} className="w-full bg-[#0a192f] border border-white/10 rounded-xl px-4 py-3 text-white focus:border-primary focus:outline-none" />
                            </div>
                        </div>
                    </motion.div>
                )}

                {activeTab === 'social' && (
                    <motion.div key="social" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6 max-w-2xl">
                        <div className="bg-[#112240]/50 p-8 rounded-3xl border border-white/5 space-y-6">
                            <h3 className="text-lg font-bold text-white mb-4">Social Media Links</h3>

                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2 flex items-center gap-2"><Mail size={14} /> Email Address</label>
                                <input type="email" value={localContent.social?.email || ''} onChange={(e) => trackChange({ ...localContent, social: { ...localContent.social, email: e.target.value } })} className="w-full bg-[#0a192f] border border-white/10 rounded-xl px-4 py-3 text-white focus:border-primary focus:outline-none" placeholder="your@email.com" />
                            </div>

                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2 flex items-center gap-2"><Instagram size={14} /> Instagram</label>
                                <input type="url" value={localContent.social?.instagram || ''} onChange={(e) => trackChange({ ...localContent, social: { ...localContent.social, instagram: e.target.value } })} className="w-full bg-[#0a192f] border border-white/10 rounded-xl px-4 py-3 text-white focus:border-primary focus:outline-none" placeholder="https://instagram.com/username" />
                            </div>

                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2 flex items-center gap-2"><Youtube size={14} /> YouTube</label>
                                <input type="url" value={localContent.social?.youtube || ''} onChange={(e) => trackChange({ ...localContent, social: { ...localContent.social, youtube: e.target.value } })} className="w-full bg-[#0a192f] border border-white/10 rounded-xl px-4 py-3 text-white focus:border-primary focus:outline-none" placeholder="https://youtube.com/@channel" />
                            </div>

                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2 flex items-center gap-2"><Twitter size={14} /> Twitter/X</label>
                                <input type="url" value={localContent.social?.twitter || ''} onChange={(e) => trackChange({ ...localContent, social: { ...localContent.social, twitter: e.target.value } })} className="w-full bg-[#0a192f] border border-white/10 rounded-xl px-4 py-3 text-white focus:border-primary focus:outline-none" placeholder="https://x.com/username" />
                            </div>
                        </div>
                    </motion.div>
                )}

                {activeTab === 'cinema' && (
                    <motion.div key="cinema" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6 max-w-4xl">
                        <div className="bg-[#112240]/50 p-8 rounded-3xl border border-white/5 space-y-6">
                            <h3 className="text-lg font-bold text-white mb-4">Cinema Section</h3>
                            
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Section Title</label>
                                    <input type="text" value={localContent.cinema?.title || ''} onChange={(e) => trackChange({ ...localContent, cinema: { ...localContent.cinema, title: e.target.value } })} className="w-full bg-[#0a192f] border border-white/10 rounded-xl px-4 py-3 text-white focus:border-primary focus:outline-none" placeholder="Long Form Works" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Subtitle</label>
                                    <input type="text" value={localContent.cinema?.subtitle || ''} onChange={(e) => trackChange({ ...localContent, cinema: { ...localContent.cinema, subtitle: e.target.value } })} className="w-full bg-[#0a192f] border border-white/10 rounded-xl px-4 py-3 text-white focus:border-primary focus:outline-none" placeholder="Cinematic" />
                                </div>
                            </div>

                            <div className="border-t border-white/10 pt-6">
                                <h4 className="text-sm font-bold text-white mb-4">Cinematic Works</h4>
                                {localContent.cinema?.items && localContent.cinema.items.map((item, idx) => (
                                    <div key={idx} className="mb-6 pb-6 border-b border-white/5">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                            <div>
                                                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Title</label>
                                                <input type="text" value={item.title || ''} onChange={(e) => {
                                                    const items = [...localContent.cinema.items];
                                                    items[idx].title = e.target.value;
                                                    trackChange({ ...localContent, cinema: { ...localContent.cinema, items } });
                                                }} className="w-full bg-[#0a192f] border border-white/10 rounded-xl px-4 py-3 text-white focus:border-primary focus:outline-none" placeholder="The Summit" />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Category</label>
                                                <input type="text" value={item.category || ''} onChange={(e) => {
                                                    const items = [...localContent.cinema.items];
                                                    items[idx].category = e.target.value;
                                                    trackChange({ ...localContent, cinema: { ...localContent.cinema, items } });
                                                }} className="w-full bg-[#0a192f] border border-white/10 rounded-xl px-4 py-3 text-white focus:border-primary focus:outline-none" placeholder="Documentary" />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Description</label>
                                            <textarea value={item.description || ''} onChange={(e) => {
                                                const items = [...localContent.cinema.items];
                                                items[idx].description = e.target.value;
                                                trackChange({ ...localContent, cinema: { ...localContent.cinema, items } });
                                            }} rows={2} className="w-full bg-[#0a192f] border border-white/10 rounded-xl px-4 py-3 text-white focus:border-primary focus:outline-none resize-none" placeholder="A journey to the highest peaks using cinematic drone shots." />
                                        </div>
                                        <div className="mt-4">
                                            <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Image URL</label>
                                            <input type="text" value={item.image || ''} onChange={(e) => {
                                                const items = [...localContent.cinema.items];
                                                items[idx].image = e.target.value;
                                                trackChange({ ...localContent, cinema: { ...localContent.cinema, items } });
                                            }} className="w-full bg-[#0a192f] border border-white/10 rounded-xl px-4 py-3 text-white focus:border-primary focus:outline-none font-mono text-xs" placeholder="https://..." />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </motion.div>
                )}

                {activeTab === 'about' && (
                    <motion.div key="about" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6 max-w-2xl">
                        <div className="bg-[#112240]/50 p-8 rounded-3xl border border-white/5 space-y-6">
                            <h3 className="text-lg font-bold text-white mb-4">About Section</h3>
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">About Image</label>
                                <div className="flex items-center gap-4">
                                    <div className="w-32 h-32 rounded-lg overflow-hidden bg-black/30 border border-white/10">
                                        {localContent.about?.image ? <img src={localContent.about.image} alt="About" className="w-full h-full object-cover" /> : <div className="flex items-center justify-center h-full text-gray-500">No image</div>}
                                    </div>
                                    <div className="flex flex-col gap-2">
                                        <button onClick={() => triggerUpload('aboutImage', null)} className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm font-bold">Upload Image</button>
                                        <input type="text" value={localContent.about?.image || ''} onChange={(e) => trackChange({ ...localContent, about: { ...localContent.about, image: e.target.value } })} className="mt-2 w-full bg-[#0a192f] border border-white/10 rounded-xl px-4 py-2 text-sm font-mono text-cyan-300" placeholder="https://..." />
                                    </div>
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">About Text</label>
                                <textarea value={localContent.about?.text || ''} onChange={(e) => trackChange({ ...localContent, about: { ...localContent.about, text: e.target.value } })} rows={4} className="w-full bg-[#0a192f] border border-white/10 rounded-xl px-4 py-3 text-white focus:border-primary focus:outline-none resize-none" placeholder="Write a short about section..." />
                            </div>
                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">Metrics (Metric 1, Metric 2, Metric 3)</label>
                                <div className="space-y-3">
                                    <div>
                                        <p className="text-xs text-gray-400 mb-2">Metric 1 (e.g., 500+ Polished)</p>
                                        <div className="flex gap-2">
                                            <input type="number" value={localContent.about?.metrics?.[0] || 0} onChange={(e) => {
                                                const m = [...(localContent.about?.metrics || [0,0,0])]; m[0]=parseInt(e.target.value||0);
                                                trackChange({ ...localContent, about: { ...localContent.about, metrics: m } });
                                            }} className="flex-1 bg-[#0a192f] border border-white/10 rounded-xl px-4 py-3 text-white" placeholder="e.g., 500" />
                                            <input type="text" value={localContent.about?.metricLabels?.[0] || 'Polished'} onChange={(e) => {
                                                const l = [...(localContent.about?.metricLabels || ['Polished', 'Years', 'Views'])]; l[0]=e.target.value;
                                                trackChange({ ...localContent, about: { ...localContent.about, metricLabels: l } });
                                            }} className="flex-1 bg-[#0a192f] border border-white/10 rounded-xl px-4 py-3 text-white" placeholder="Label" />
                                        </div>
                                    </div>
                                    <div>
                                        <p className="text-xs text-gray-400 mb-2">Metric 2 (e.g., 3+ Years)</p>
                                        <div className="flex gap-2">
                                            <input type="number" value={localContent.about?.metrics?.[1] || 0} onChange={(e) => {
                                                const m = [...(localContent.about?.metrics || [0,0,0])]; m[1]=parseInt(e.target.value||0);
                                                trackChange({ ...localContent, about: { ...localContent.about, metrics: m } });
                                            }} className="flex-1 bg-[#0a192f] border border-white/10 rounded-xl px-4 py-3 text-white" placeholder="e.g., 3" />
                                            <input type="text" value={localContent.about?.metricLabels?.[1] || 'Years'} onChange={(e) => {
                                                const l = [...(localContent.about?.metricLabels || ['Polished', 'Years', 'Views'])]; l[1]=e.target.value;
                                                trackChange({ ...localContent, about: { ...localContent.about, metricLabels: l } });
                                            }} className="flex-1 bg-[#0a192f] border border-white/10 rounded-xl px-4 py-3 text-white" placeholder="Label" />
                                        </div>
                                    </div>
                                    <div>
                                        <p className="text-xs text-gray-400 mb-2">Metric 3 (e.g., 50M+ Views)</p>
                                        <div className="flex gap-2">
                                            <input type="number" value={localContent.about?.metrics?.[2] || 0} onChange={(e) => {
                                                const m = [...(localContent.about?.metrics || [0,0,0])]; m[2]=parseInt(e.target.value||0);
                                                trackChange({ ...localContent, about: { ...localContent.about, metrics: m } });
                                            }} className="flex-1 bg-[#0a192f] border border-white/10 rounded-xl px-4 py-3 text-white" placeholder="e.g., 50" />
                                            <input type="text" value={localContent.about?.metricLabels?.[2] || 'Views'} onChange={(e) => {
                                                const l = [...(localContent.about?.metricLabels || ['Polished', 'Years', 'Views'])]; l[2]=e.target.value;
                                                trackChange({ ...localContent, about: { ...localContent.about, metricLabels: l } });
                                            }} className="flex-1 bg-[#0a192f] border border-white/10 rounded-xl px-4 py-3 text-white" placeholder="Label" />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}

                {activeTab === 'branding' && (
                    <motion.div key="branding" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6 max-w-2xl">
                        <div className="bg-[#112240]/50 p-8 rounded-3xl border border-white/5 space-y-6">
                            <h3 className="text-lg font-bold text-white mb-4">Branding & Header Icon</h3>
                            <p className="text-sm text-gray-400 mb-4">Upload an SVG logo; server will generate PNG/WebP variants for favicons and social preview.</p>
                            <div className="flex items-center gap-4">
                                <div className="w-20 h-20 rounded-lg overflow-hidden bg-black/30 border border-white/10 flex items-center justify-center">
                                    {localContent.headerIcon ? <img src={localContent.headerIcon} alt="Icon" className="w-full h-full object-contain" /> : <div className="text-gray-500">No icon</div>}
                                </div>
                                <div className="flex flex-col gap-2">
                                    <button onClick={() => triggerUpload('headerIcon', null)} className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-sm font-bold">Upload SVG</button>
                                    <p className="text-xs text-gray-500 mt-1">Accepted: SVG (recommended). PNG/WebP will also be created.</p>
                                </div>
                            </div>
                            {localContent.headerIconVariants && (
                                <div className="grid grid-cols-4 gap-3 mt-4">
                                    {Object.entries(localContent.headerIconVariants).map(([k,v]) => (
                                        <div key={k} className="bg-[#0a192f] p-2 rounded-lg text-center">
                                            <img src={v} alt={k} className="mx-auto mb-2 w-12 h-12 object-contain" />
                                            <p className="text-xs text-gray-400">{k}</p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}

                {activeTab === 'footer' && (
                    <motion.div key="footer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6 max-w-2xl">
                        <div className="bg-[#112240]/50 p-8 rounded-3xl border border-white/5 space-y-6">
                            <h3 className="text-lg font-bold text-white mb-4">Footer Settings</h3>

                            <div>
                                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Copyright Text</label>
                                <input type="text" value={localContent.footer?.copyright || ''} onChange={(e) => trackChange({ ...localContent, footer: { ...localContent.footer, copyright: e.target.value } })} className="w-full bg-[#0a192f] border border-white/10 rounded-xl px-4 py-3 text-white focus:border-primary focus:outline-none" placeholder="© 2026 Your Name. All rights reserved." />
                            </div>

                            <div className="flex items-center justify-between p-4 bg-[#0a192f] rounded-xl border border-white/10">
                                <div>
                                    <p className="text-white font-bold">Show Social Icons in Footer</p>
                                    <p className="text-xs text-gray-500">Display Instagram, YouTube, etc. icons</p>
                                </div>
                                <button onClick={() => trackChange({ ...localContent, footer: { ...localContent.footer, showSocial: !localContent.footer?.showSocial } })} className={`w-14 h-8 rounded-full transition-colors relative ${localContent.footer?.showSocial ? 'bg-secondary' : 'bg-gray-600'}`}>
                                    <div className={`absolute top-1 w-6 h-6 rounded-full bg-white transition-all ${localContent.footer?.showSocial ? 'left-7' : 'left-1'}`} />
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {previewProject && <ProjectPreview project={previewProject} onClose={() => setPreviewProject(null)} />}
            </AnimatePresence>
        </div>
    );
};

export default ContentCMS;
