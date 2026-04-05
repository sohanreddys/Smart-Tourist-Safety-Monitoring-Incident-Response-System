import React from 'react';
import { Link } from 'react-router-dom';

const Home = () => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-900 via-primary-800 to-primary-700">
      {/* Hero Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-16">
        <div className="text-center">
          <div className="text-6xl mb-6">🛡️</div>
          <h1 className="text-5xl md:text-6xl font-extrabold text-white mb-4">
            WanderMate
          </h1>
          <p className="text-xl md:text-2xl text-primary-200 mb-2">
            Explore More — Worry Less
          </p>
          <p className="text-md text-primary-300 max-w-2xl mx-auto mb-10">
            Smart Tourist Safety Monitoring & Incident Response System powered by
            AI, Geo-Fencing & Blockchain Digital ID
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              to="/register"
              className="px-8 py-3 bg-white text-primary-800 font-bold rounded-xl text-lg hover:bg-gray-100 transition-all shadow-lg hover:shadow-xl"
            >
              Get Started
            </Link>
            <Link
              to="/login"
              className="px-8 py-3 border-2 border-white text-white font-bold rounded-xl text-lg hover:bg-white hover:text-primary-800 transition-all"
            >
              Sign In
            </Link>
          </div>
        </div>
      </div>

      {/* Features Grid */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            {
              icon: '🚨',
              title: 'SOS Panic Button',
              desc: 'Instant emergency alerts with location, audio & video evidence sent to authorities in real-time.',
            },
            {
              icon: '📍',
              title: 'Live Geo-Tracking',
              desc: 'Real-time location monitoring with geo-fence alerts when entering restricted or danger zones.',
            },
            {
              icon: '🤖',
              title: 'AI Anomaly Detection',
              desc: 'Rule-based AI detects unusual patterns — stationary too long, entering risk zones, or erratic movement.',
            },
            {
              icon: '🔗',
              title: 'Blockchain Digital ID',
              desc: 'Tamper-proof tourist identity with immutable logs for secure verification by authorities.',
            },
            {
              icon: '📡',
              title: 'Offline Support',
              desc: 'Works without internet — stores alerts locally and syncs automatically when reconnected.',
            },
            {
              icon: '🏥',
              title: 'Nearby Services',
              desc: 'Find closest hospitals, police stations, and emergency services on the map instantly.',
            },
          ].map((feature, i) => (
            <div
              key={i}
              className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20 hover:bg-white/20 transition-all"
            >
              <div className="text-3xl mb-3">{feature.icon}</div>
              <h3 className="text-lg font-bold text-white mb-2">{feature.title}</h3>
              <p className="text-primary-200 text-sm">{feature.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-white/10 py-6 text-center text-primary-300 text-sm">
        WanderMate © 2025 — Team WanderBytes | Smart India Hackathon
      </div>
    </div>
  );
};

export default Home;
