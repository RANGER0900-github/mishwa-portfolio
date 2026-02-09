import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Eye, EyeOff } from 'lucide-react';
import { adminJsonFetch } from '../../utils/adminApi';

const Login = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const handleLogin = async (e) => {
        e.preventDefault();
        setError('');

        try {
            const { response, data } = await adminJsonFetch('/api/login', {
                method: 'POST',
                body: { username, password }
            });
            if (response.ok && data?.success) {
                navigate('/admin');
            } else {
                setError(data?.message || 'Invalid credentials');
            }
        } catch (err) {
            setError('Login Failed. Check if server is running on port 3000.');
            console.error('Login error:', err);
        }
    };

    return (
        <div className="min-h-screen bg-[#0a192f] flex items-center justify-center relative overflow-hidden p-4 pt-[calc(env(safe-area-inset-top,0)+1rem)] pb-[calc(env(safe-area-inset-bottom,0)+1rem)]">
            {/* Background Effects */}
            <div className="absolute top-0 left-0 w-full h-full bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-5"></div>
            <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-secondary/20 rounded-full blur-[120px]"></div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full max-w-md bg-white/5 backdrop-blur-xl border border-white/10 p-6 sm:p-8 rounded-3xl shadow-2xl relative z-10"
            >
                <h2 className="text-3xl font-display font-bold text-white mb-2 text-center">Welcome Back.</h2>
                <p className="text-gray-400 text-center mb-8">Enter your credentials to access the command center.</p>

                {error && (
                    <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-xl mb-6 text-sm text-center font-bold">
                        {error}
                    </div>
                )}

                <form onSubmit={handleLogin} className="space-y-6">
                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 block">Username</label>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="w-full bg-[#0a192f]/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-secondary transition-colors"
                        />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2 block">Password</label>
                        <div className="relative">
                            <input
                                type={showPassword ? "text" : "password"}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full bg-[#0a192f]/50 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-secondary transition-colors pr-10"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
                                aria-label={showPassword ? "Hide password" : "Show password"}
                            >
                                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                            </button>
                        </div>
                    </div>

                    <button
                        type="submit"
                        className="w-full bg-secondary text-black font-bold py-4 rounded-xl hover:bg-secondary/90 transition-transform active:scale-95"
                    >
                        Access Dashboard
                    </button>
                </form>
            </motion.div>
        </div>
    );
};

export default Login;
