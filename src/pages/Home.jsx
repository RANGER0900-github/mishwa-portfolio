import Hero from '../components/Hero';
import Work from '../components/Work';
import Cinema from '../components/Cinema';
import About from '../components/About';
import Reviews from '../components/Reviews';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

const Home = () => {
    return (
        <div className="relative z-10 w-full overflow-hidden">
            <Navbar />
            <Hero />
            <Work />
            <Cinema />
            <About />
            <Reviews />
            <Footer />
        </div>
    );
};

export default Home;
