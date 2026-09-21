import React from 'react';
import { Wallet, Activity, Globe, Terminal, AlertCircle, LogOut } from 'lucide-react';
import { useWeb3 } from '../hooks/useWeb3';

export default function Navbar() {
  const {
    account,
    connectWallet,
    disconnectWallet,
    isConnecting,
    walletChainId,
    selectedNetwork,
    setSelectedNetwork,
    activeNetworkConfig,
    switchWalletToNetwork,
    isCorrectNetwork,
  } = useWeb3();

  const formatAddress = (address) => {
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
  };

  const renderNetworkStatus = () => {
    if (!account) {
      return (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '6px 14px',
          borderRadius: '20px',
          background: selectedNetwork === 'sepolia' ? 'rgba(139, 92, 246, 0.15)' : 'rgba(6, 182, 212, 0.15)',
          border: `1px solid ${selectedNetwork === 'sepolia' ? 'rgba(139, 92, 246, 0.3)' : 'rgba(6, 182, 212, 0.3)'}`,
          fontSize: '0.85rem',
          color: selectedNetwork === 'sepolia' ? '#c4b5fd' : '#67e8f9',
        }}>
          {selectedNetwork === 'sepolia' ? <Globe size={14} /> : <Terminal size={14} />}
          <span>{activeNetworkConfig.shortName}</span>
        </div>
      );
    }

    if (isCorrectNetwork) {
      return (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '6px 14px',
          borderRadius: '20px',
          background: selectedNetwork === 'sepolia' ? 'rgba(139, 92, 246, 0.18)' : 'rgba(6, 182, 212, 0.18)',
          border: `1px solid ${selectedNetwork === 'sepolia' ? 'rgba(139, 92, 246, 0.4)' : 'rgba(6, 182, 212, 0.4)'}`,
          fontSize: '0.85rem',
          color: selectedNetwork === 'sepolia' ? '#c4b5fd' : '#67e8f9',
        }}>
          <span style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: '#10b981',
            boxShadow: '0 0 8px #10b981',
            display: 'inline-block',
          }}></span>
          <span>{activeNetworkConfig.shortName}</span>
        </div>
      );
    }

    // Network mismatch warning: clicking immediately requests MetaMask to switch
    return (
      <button
        onClick={() => switchWalletToNetwork('sepolia')}
        className="btn"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '6px 14px',
          borderRadius: '20px',
          background: 'rgba(239, 68, 68, 0.18)',
          border: '1px solid rgba(239, 68, 68, 0.4)',
          fontSize: '0.85rem',
          color: '#fca5a5',
          cursor: 'pointer',
        }}
        title="Click to switch MetaMask to Sepolia"
      >
        <AlertCircle size={14} color="#ef4444" />
        <span>Switch to Sepolia</span>
      </button>
    );
  };

  return (
    <nav style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '1.5rem 2rem',
      position: 'relative',
      zIndex: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{
          background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
          padding: '8px',
          borderRadius: '12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 12px rgba(139, 92, 246, 0.4)',
        }}>
          <Activity size={24} color="white" />
        </div>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 'bold' }} className="text-gradient">
            NexusDEX
          </h1>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {renderNetworkStatus()}

        {account ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div
              className="glass-panel"
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '8px 16px',
                borderRadius: '20px',
                fontSize: '0.9rem',
              }}
            >
              <Wallet size={16} style={{ marginRight: '8px' }} color="var(--accent-secondary)" />
              <span>{formatAddress(account)}</span>
            </div>

            <button
              onClick={disconnectWallet}
              className="btn btn-secondary"
              style={{
                padding: '8px 12px',
                borderRadius: '20px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '0.8rem',
                color: 'var(--text-secondary)',
              }}
              title="Disconnect Wallet"
            >
              <LogOut size={14} />
              <span>Disconnect</span>
            </button>
          </div>
        ) : (
          <button
            className="btn btn-primary"
            onClick={connectWallet}
            disabled={isConnecting}
          >
            {isConnecting ? 'Connecting...' : 'Connect Wallet'}
          </button>
        )}
      </div>
    </nav>
  );
}
