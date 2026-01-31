import React from 'react';
import { AlertTriangle } from 'lucide-react';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true };
    }

    componentDidCatch(error, errorInfo) {
        console.error('Error caught by boundary:', error, errorInfo);
        this.setState({
            error,
            errorInfo
        });
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen bg-background flex items-center justify-center px-6">
                    <div className="max-w-md text-center">
                        <div className="flex justify-center mb-6">
                            <AlertTriangle size={64} className="text-secondary" />
                        </div>
                        <h1 className="text-3xl font-display font-bold text-white mb-4">
                            Something Went Wrong
                        </h1>
                        <p className="text-gray-400 mb-8">
                            An unexpected error occurred. Please try refreshing the page.
                        </p>
                        {process.env.NODE_ENV === 'development' && (
                            <details className="text-left bg-red-500/10 border border-red-500/20 p-4 rounded-lg mb-6 text-xs text-red-400">
                                <summary className="cursor-pointer font-bold mb-2">Error Details (Dev Only)</summary>
                                <pre className="overflow-auto max-h-48 text-red-300">
                                    {this.state.error && this.state.error.toString()}
                                    {'\n\n'}
                                    {this.state.errorInfo && this.state.errorInfo.componentStack}
                                </pre>
                            </details>
                        )}
                        <button
                            onClick={() => window.location.reload()}
                            className="px-6 py-3 bg-secondary text-black font-bold rounded-lg hover:bg-secondary/90 transition-colors"
                        >
                            Reload Page
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
