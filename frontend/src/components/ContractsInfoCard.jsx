import React, { useState } from 'react';
import { Copy, Check, ExternalLink, PlusCircle, Globe, Server } from 'lucide-react';
import { useWeb3 } from '../hooks/useWeb3';

export default function ContractsInfoCard() {
  const { selectedNetwork, activeNetworkConfig, addresses } = useWeb3();
  const [copiedKey, setCopiedKey] = useState(null);

  const copyToClipboard = (text, key) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const addTokenToMetaMask = async (symbol, address) => {
    if (!window.ethereum) return;
    try {
      await window.ethereum.request({
        method: 'wallet_watchAsset',
        params: {
          type: 'ERC20',
          options: {
            address,
            symbol,
            decimals: 18,
          },
        },
      });
    } catch (error) {
      console.error("Failed to add token to MetaMask:", error);
    }
  };

  const contractList = [
    { name: 'DexRouter', address: addresses.Router, key: 'router', isToken: false },
    { name: 'DexFactory', address: addresses.Factory, key: 'factory', isToken: false },
    { name: 'WETH9 (Wrapped ETH)', address: addresses.WETH, key: 'weth', isToken: true, symbol: 'WETH' },
    { name: '10x Token', address: addresses.Token10x, key: '10x', isToken: true, symbol: '10X' },
    { name: 'Ayo Token', address: addresses.TokenAyo, key: 'ayo', isToken: true, symbol: 'AYO' },
  ];

  return (
    <div className="glass-panel" style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {selectedNetwork === 'sepolia' ? (
            <Globe size={20} color="var(--accent-primary)" />
          ) : (
            <Server size={20} color="var(--accent-secondary)" />
          )}
          <h2 style={{ margin: 0, fontSize: '1.2rem' }}>
            {activeNetworkConfig.name} Contracts
          </h2>
        </div>
        <span style={{
          fontSize: '0.75rem',
          padding: '4px 10px',
          borderRadius: '10px',
          background: '#141a27',
          border: '1px solid #232d42',
          color: '#60a5fa',
          fontWeight: 600,
        }}>
          Chain ID: {activeNetworkConfig.chainId}
        </span>
      </div>

      <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '20px', lineHeight: 1.5 }}>
        These are the live smart contract addresses active for this network tab. You can copy addresses, view on explorer, or import tokens directly into MetaMask.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {contractList.map((item) => (
          <div
            key={item.key}
            style={{
              background: 'rgba(0, 0, 0, 0.25)',
              border: '1px solid var(--panel-border)',
              borderRadius: '14px',
              padding: '12px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                {item.name}
              </span>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                {item.isToken && (
                  <button
                    onClick={() => addTokenToMetaMask(item.symbol, item.address)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      background: '#151b26',
                      border: '1px solid #232c3d',
                      borderRadius: '8px',
                      padding: '4px 8px',
                      color: '#60a5fa',
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                    }}
                    title="Add to MetaMask"
                  >
                    <PlusCircle size={13} />
                    <span>+ MetaMask</span>
                  </button>
                )}
                {activeNetworkConfig.explorerUrl && (
                  <a
                    href={`${activeNetworkConfig.explorerUrl}/address/${item.address}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      color: 'var(--text-secondary)',
                      padding: '4px',
                      borderRadius: '6px',
                    }}
                    title="View on Explorer"
                  >
                    <ExternalLink size={14} />
                  </a>
                )}
                <button
                  onClick={() => copyToClipboard(item.address, item.key)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    background: 'transparent',
                    border: 'none',
                    color: copiedKey === item.key ? 'var(--success)' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    padding: '4px',
                  }}
                  title="Copy Address"
                >
                  {copiedKey === item.key ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
            </div>
            <span style={{
              fontFamily: 'monospace',
              fontSize: '0.8rem',
              color: 'var(--text-secondary)',
              wordBreak: 'break-all',
            }}>
              {item.address}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
