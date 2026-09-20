import React, { useState } from 'react';
import Navbar from './components/Navbar';
import SwapCard from './components/SwapCard';
import PoolCard from './components/PoolCard';
import { Web3Provider } from './hooks/useWeb3';

function App() {
  const [activeTab, setActiveTab] = useState('swap');

  return (
    <Web3Provider>
      <Navbar />
      
      <main style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center',
        padding: '2rem 1rem',
        flex: 1,
        position: 'relative',
        zIndex: 1
      }}>
        <div style={{ width: '100%', maxWidth: '480px' }}>
          
          {/* Custom Tab Switcher */}
          <div style={{
            display: 'flex',
            gap: '8px',
            marginBottom: '24px',
            justifyContent: 'center'
          }}>
            <button 
              className={`btn ${activeTab === 'swap' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setActiveTab('swap')}
              style={{ padding: '8px 24px', borderRadius: '20px' }}
            >
              Swap
            </button>
            <button 
              className={`btn ${activeTab === 'pool' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setActiveTab('pool')}
              style={{ padding: '8px 24px', borderRadius: '20px' }}
            >
              Pool
            </button>
          </div>

          <div style={{ position: 'relative' }}>
            {activeTab === 'swap' ? <SwapCard /> : <PoolCard />}
          </div>
          
        </div>
      </main>
    </Web3Provider>
  );
}

export default App;
