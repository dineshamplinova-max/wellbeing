import React from 'react';
import Home1 from './Home1';
import Home2 from './Home2';
import Home3 from './Home3';
import Navbar from '../navbar/Navbar';

const Home = () => {
  return (
    <div className="min-h-screen bg-wb-bg text-wb-text">
      <Navbar />
      {/* pt-16 clears the fixed 64px navbar */}
      <main className="pt-16">
        <Home1 />
        <Home3 />
        <Home2 />
      </main>
    </div>
  );
};

export default Home;
