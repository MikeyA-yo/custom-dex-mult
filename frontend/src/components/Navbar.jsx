import React, { useState } from 'react';
import { Wallet, Activity, Globe, Terminal, AlertCircle, LogOut, Copy, Check } from 'lucide-react';
import { useWeb3 } from '../hooks/useWeb3';

export default function Navbar() {
  const {
    account,
    connectWallet,
    disconnectWallet,
    isConnecting,
    selectedNetwork,
    activeNetworkConfig,
    switchWalletToNetwork,
    isCorrectNetwork,
  } = useWeb3();

  const [copied, setCopied] = useState(false);

  const formatAddress = (address) => {
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
  };

  const copyAddress = () => {
    if (account) {
      navigator.clipboard.writeText(account);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  const renderNetworkStatus = () => {
    if (!account) {
      return (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '6px 12px',
          borderRadius: '10px',
          background: '#111622',
          border: '1px solid #1f283a',
          fontSize: '0.82rem',
          color: 'var(--text-secondary)',
          fontWeight: 500,
        }}>
          {selectedNetwork === 'sepolia' ? <Globe size={13} /> : <Terminal size={13} />}
          <span>{activeNetworkConfig.shortName}</span>
        </div>
      );
    }

    if (isCorrectNetwork) {
      return (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '7px',
          padding: '6px 12px',
          borderRadius: '10px',
          background: '#101520',
          border: '1px solid #1c2536',
          fontSize: '0.82rem',
          color: 'var(--text-primary)',
          fontWeight: 500,
        }}>
          <span className="heartbeat-dot"></span>
          <span>{activeNetworkConfig.shortName}</span>
        </div>
      );
    }

    // Network mismatch warning: 1-click switch to Sepolia
    return (
      <button
        onClick={() => switchWalletToNetwork('sepolia')}
        className="btn"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '6px 12px',
          borderRadius: '10px',
          background: 'var(--error-subtle)',
          border: '1px solid rgba(239, 68, 68, 0.4)',
          fontSize: '0.82rem',
          color: '#fca5a5',
          cursor: 'pointer',
          fontWeight: 600,
        }}
        title="Click to automatically switch to Sepolia"
      >
        <AlertCircle size={13} color="#ef4444" />
        <span>Switch to Sepolia</span>
      </button>
    );
  };

  return (
    <nav style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '1.25rem 2rem',
      position: 'relative',
      zIndex: 10,
      borderBottom: '1px solid #131824',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{
          background: 'var(--accent-primary)',
          padding: '7px',
          borderRadius: '10px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 2px 8px rgba(37, 99, 235, 0.3)',
        }}>
          <Activity size={20} color="#ffffff" />
        </div>
        <div>
          <span style={{ fontSize: '1.25rem', fontWeight: 700, letterSpacing: '-0.02em', color: '#ffffff' }}>
            10x DEX
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {renderNetworkStatus()}

        {account ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div
              onClick={copyAddress}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '6px 12px',
                borderRadius: '10px',
                fontSize: '0.85rem',
                background: '#111520',
                border: '1px solid #1d2537',
                color: 'var(--text-primary)',
                cursor: 'pointer',
                gap: '7px',
                fontFamily: 'monospace',
              }}
              title="Click to copy address"
            >
              <Wallet size={14} color="#60a5fa" />
              <span>{formatAddress(account)}</span>
              {copied ? <Check size={12} color="#34d399" /> : <Copy size={12} color="var(--text-muted)" />}
            </div>

            <button
              onClick={disconnectWallet}
              className="btn-icon"
              style={{
                padding: '7px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
              }}
              title="Disconnect Wallet"
            >
              <LogOut size={15} />
            </button>
          </div>
        ) : (
          <button
            className="btn btn-primary"
            style={{ padding: '8px 16px', fontSize: '0.88rem' }}
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
