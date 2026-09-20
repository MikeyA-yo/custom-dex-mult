import React from 'react';
import { Wallet, Activity } from 'lucide-react';
import { useWeb3 } from '../hooks/useWeb3';

export default function Navbar() {
  const { account, connectWallet, isConnecting } = useWeb3();

  const formatAddress = (address) => {
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
  };

  return (
    <nav style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '1.5rem 2rem',
      position: 'relative',
      zIndex: 10
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{
          background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
          padding: '8px',
          borderRadius: '12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 12px rgba(139, 92, 246, 0.4)'
        }}>
          <Activity size={24} color="white" />
        </div>
        <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 'bold' }} className="text-gradient">
          NexusDEX
        </h1>
      </div>

      <div>
        {account ? (
          <button className="btn btn-secondary glass-panel" style={{ borderRadius: '20px' }}>
            <Wallet size={18} style={{ marginRight: '8px' }} color="var(--accent-secondary)" />
            {formatAddress(account)}
          </button>
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
