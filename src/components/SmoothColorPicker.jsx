import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

const SmoothColorPicker = ({ value, onChange, onClose }) => {
    const [inputValue, setInputValue] = useState(value || '');
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [isValidHex, setIsValidHex] = useState(/^#[0-9A-Fa-f]{6}$/.test(value || ''));

    useEffect(() => {
        // keep internal input synced when parent value changes
        setInputValue(value || '');
        setIsValidHex(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(value || ''));
    }, [value]);

    // Color presets organized by groups
    const colorGroups = {
        'Neutrals': ['#000000', '#333333', '#666666', '#999999', '#cccccc', '#ffffff'],
        'Blues': ['#0070f3', '#0047ab', '#006bb3', '#0080ff', '#3399ff', '#66ccff'],
        'Cyans': ['#00d4ff', '#00ffff', '#64ffda', '#00e5ff', '#20b2aa', '#00ced1'],
        'Magentas': ['#ec4899', '#d946ef', '#dd33fa', '#ff1493', '#ff69b4', '#ff85c0'],
        'Yellows': ['#fbbf24', '#f59e0b', '#ffbf00', '#ffb700', '#ffc700', '#ffd700'],
        'Reds': ['#ef4444', '#f87171', '#ff4444', '#ff6b6b', '#ff8888', '#ffaaaa'],
    };

    const handleHexInput = (val) => {
        setInputValue(val);
        let color = val.trim();
        if (color && !color.startsWith('#')) color = '#' + color;
        if (/^#[0-9A-Fa-f]{6}$/.test(color)) {
            onChange(color);
        }
    };

    // Simple hex spectrum for predictable values
    const spectrum = ['#ff0000', '#ff7f00', '#ffff00', '#7fff00', '#00ff00', '#00ff7f', '#00ffff', '#007fff', '#0000ff', '#7f00ff', '#ff00ff', '#ff007f'];

    return (
        <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            className="bg-gradient-to-br from-[#112240] to-[#0a192f] border border-primary/30 rounded-2xl p-5 space-y-5 shadow-2xl w-full max-w-sm"
        >
            {/* Current Color Display */}
            <div className="flex gap-3 items-center">
                <div
                    className="w-16 h-16 rounded-xl border-2 border-white/20 shadow-lg flex-shrink-0 transition-all"
                    style={{ backgroundColor: value }}
                />
                <div>
                    <p className="text-xs text-gray-400 mb-1">Current Color</p>
                    <input
                        type="text"
                        value={inputValue}
                        onChange={(e) => handleHexInput(e.target.value)}
                        className="bg-white/5 border border-white/20 rounded-lg px-3 py-2 text-white text-sm w-full font-mono focus:border-primary focus:outline-none"
                        placeholder="#ffffff"
                    />
                </div>
            </div>

            {/* Color Spectrum Bar */}
            <div>
                <p className="text-xs text-gray-400 mb-2">Spectrum</p>
                <div className="flex gap-1 h-8 rounded-lg overflow-hidden border border-white/10">
                    {spectrum.map((color, i) => (
                        <motion.button
                            key={i}
                            onClick={() => {
                                onChange(color);
                                setInputValue(color);
                                setIsValidHex(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(color));
                            }}
                            whileHover={{ scaleY: 1.3 }}
                            className="flex-1 hover:z-10 transition-all cursor-pointer"
                            style={{ backgroundColor: color }}
                            title={color}
                        />
                    ))}
                </div>
            </div>

            {/* Color Groups */}
            <div>
                <button
                    onClick={() => setShowAdvanced(!showAdvanced)}
                    className="text-xs text-gray-400 hover:text-primary transition-colors mb-2 font-bold uppercase tracking-wider"
                >
                    {showAdvanced ? '− Hide' : '+ Show'} Color Palettes
                </button>

                {showAdvanced && (
                    <div className="space-y-3">
                        {Object.entries(colorGroups).map(([group, colors]) => (
                            <motion.div
                                key={group}
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                            >
                                <p className="text-xs text-gray-500 mb-2 font-bold">{group}</p>
                                <div className="grid grid-cols-6 gap-2">
                                    {colors.map((color) => (
                                        <motion.button
                                            key={color}
                                            onClick={() => {
                                                onChange(color);
                                                setInputValue(color);
                                                setIsValidHex(true);
                                            }}
                                            whileHover={{ scale: 1.1 }}
                                            whileTap={{ scale: 0.95 }}
                                            className={`h-10 rounded-lg border-2 transition-all ${
                                                (inputValue === color || value === color)
                                                    ? 'border-primary shadow-lg shadow-primary'
                                                    : 'border-white/20 hover:border-white/50'
                                            }`}
                                            style={{ backgroundColor: color }}
                                            title={color}
                                        />
                                    ))}
                                </div>
                            </motion.div>
                        ))}
                    </div>
                )}
            </div>

            {/* Quick Presets (Always Visible) */}
            <div>
                <p className="text-xs text-gray-400 mb-2">Favorites</p>
                <div className="grid grid-cols-8 gap-2">
                    {['#ffffff', '#64ffda', '#0070f3', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#000000'].map((color) => (
                        <motion.button
                            key={color}
                            onClick={() => {
                                onChange(color);
                                setInputValue(color);
                                setIsValidHex(true);
                            }}
                            whileHover={{ scale: 1.15, rotate: 5 }}
                            whileTap={{ scale: 0.9 }}
                            className={`h-8 rounded-lg border-2 transition-all ${
                                (inputValue === color || value === color)
                                    ? 'border-primary shadow-lg'
                                    : 'border-white/20'
                            }`}
                            style={{ backgroundColor: color }}
                            title={color}
                        />
                    ))}
                </div>
            </div>

            {/* Native Color Picker */}
            <label className="block">
                <p className="text-xs text-gray-400 mb-2">Or use system picker</p>
                <input
                    type="color"
                    value={inputValue || value || '#ffffff'}
                    onInput={(e) => {
                        onChange(e.target.value);
                        setInputValue(e.target.value);
                        setIsValidHex(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(e.target.value));
                    }}
                    onChange={(e) => {
                        // ensure onChange on commit as well
                        onChange(e.target.value);
                        setInputValue(e.target.value);
                        setIsValidHex(/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(e.target.value));
                    }}
                    className={`w-full h-10 rounded-lg cursor-pointer border ${isValidHex ? 'border-white/20' : 'border-red-400'}`}
                />
            </label>

            {/* Validation & Close Hint */}
            {!isValidHex && inputValue && (
                <p className="text-xs text-red-400 text-center italic">Invalid color code — use 6-digit hex like #ff00aa</p>
            )}
            <p className="text-xs text-gray-500 text-center italic">Click outside to close</p>
        </motion.div>
    );
};

export default SmoothColorPicker;
