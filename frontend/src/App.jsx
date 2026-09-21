import React, { useState } from 'react';
import { Globe, Terminal, AlertTriangle, Layers, ArrowLeftRight, Droplet } from 'lucide-react';
import Navbar from './components/Navbar';
import SwapCard from './components/SwapCard';
import PoolCard from './components/PoolCard';
import ContractsInfoCard from './components/ContractsInfoCard';
import { Web3Provider, useWeb3 } from './hooks/useWeb3';

function DexContent() {
  const [activeTab, setActiveTab] = useState('swap');
  const {
    selectedNetwork,
    setSelectedNetwork,
    activeNetworkConfig,
    isCorrectNetwork,
    account,
    walletChainId,
    switchWalletToNetwork,
  } = useWeb3();

  return (
    <main style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '1.5rem 1rem 3rem',
      flex: 1,
      position: 'relative',
      zIndex: 1,
    }}>
      <div style={{ width: '100%', maxWidth: '490px' }}>

        {/* 1. Network Version Selector Tabs (Sepolia vs Anvil) */}
        <div className="network-tabs-wrapper">
          <button
            className={`network-tab-btn ${selectedNetwork === 'sepolia' ? 'active-sepolia' : ''}`}
            onClick={() => {
              setSelectedNetwork('sepolia');
              if (account && walletChainId !== 11155111) {
                switchWalletToNetwork('sepolia');
              }
            }}
          >
            <Globe size={16} />
            <span>Sepolia Testnet</span>
            <span className="network-badge-tag tag-live">Live</span>
          </button>

          <button
            className={`network-tab-btn ${selectedNetwork === 'anvil' ? 'active-anvil' : ''}`}
            onClick={() => {
              setSelectedNetwork('anvil');
              if (account && walletChainId !== 31337) {
                switchWalletToNetwork('anvil');
              }
            }}
          >
            <Terminal size={16} />
            <span>Anvil Local</span>
            <span className="network-badge-tag tag-local">31337</span>
          </button>
        </div>

        {/* 2. Network Mismatch Warning Banner */}
        {account && walletChainId && !isCorrectNetwork && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              background: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '16px',
              padding: '10px 16px',
              marginBottom: '16px',
              fontSize: '0.85rem',
              color: '#fca5a5',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertTriangle size={16} color="#ef4444" />
              <span>MetaMask is on different network ({walletChainId || 'Unknown'})</span>
            </div>
            <button
              onClick={() => switchWalletToNetwork(selectedNetwork)}
              style={{
                background: '#ef4444',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                padding: '6px 12px',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              Switch to {activeNetworkConfig.shortName}
            </button>
          </div>
        )}

        {/* 3. DEX Feature Tabs (Swap / Pool / Contracts) */}
        <div style={{
          display: 'flex',
          gap: '8px',
          marginBottom: '20px',
          justifyContent: 'center',
        }}>
          <button
            className={`btn ${activeTab === 'swap' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('swap')}
            style={{
              padding: '8px 20px',
              borderRadius: '20px',
              fontSize: '0.9rem',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <ArrowLeftRight size={15} />
            <span>Swap</span>
          </button>

          <button
            className={`btn ${activeTab === 'pool' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('pool')}
            style={{
              padding: '8px 20px',
              borderRadius: '20px',
              fontSize: '0.9rem',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Droplet size={15} />
            <span>Pool</span>
          </button>

          <button
            className={`btn ${activeTab === 'contracts' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('contracts')}
            style={{
              padding: '8px 20px',
              borderRadius: '20px',
              fontSize: '0.9rem',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Layers size={15} />
            <span>Contracts</span>
          </button>
        </div>

        {/* 4. Active Card View */}
        <div style={{ position: 'relative' }}>
          {activeTab === 'swap' && <SwapCard />}
          {activeTab === 'pool' && <PoolCard />}
          {activeTab === 'contracts' && <ContractsInfoCard />}
        </div>

      </div>
    </main>
  );
}

function App() {
  return (
    <Web3Provider>
      <Navbar />
      <DexContent />
    </Web3Provider>
  );
}

export default App;
