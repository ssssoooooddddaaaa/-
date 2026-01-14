import React, { useState, useEffect } from 'react';
import MagicOverlay from './components/MagicOverlay';

const App: React.FC = () => {
  const [dimensions, setDimensions] = useState({ width: 640, height: 480 });

  useEffect(() => {
    const handleResize = () => {
      setDimensions({
        width: window.innerWidth,
        height: window.innerHeight
      });
    };

    window.addEventListener('resize', handleResize);
    handleResize(); // Initial set

    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="w-screen h-screen bg-neutral-900 overflow-hidden relative">
      <MagicOverlay width={dimensions.width} height={dimensions.height} />
    </div>
  );
};

export default App;