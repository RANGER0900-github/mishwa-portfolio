import Hero from '../components/Hero';
import Work from '../components/Work';
import Cinema from '../components/Cinema';
import About from '../components/About';
import Reviews from '../components/Reviews';
import SeoContent from '../components/SeoContent';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

const Home = () => {
    return (
        <div className="relative z-10 w-full overflow-hidden">
            <Navbar />
            <main>
                <Hero />
                <Work />
                <Cinema />
                <About />
                <Reviews />
                <SeoContent />
            </main>
            <Footer />
        </div>
    );
};

export default Home;
