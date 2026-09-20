import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { CONTRACT_ADDRESSES, ABIS } from '../utils/contracts';

const Web3Context = createContext(null);

export function Web3Provider({ children }) {
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [account, setAccount] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [chainId, setChainId] = useState(null);

  // Contracts
  const [router, setRouter] = useState(null);
  const [factory, setFactory] = useState(null);

  const connectWallet = useCallback(async () => {
    if (typeof window.ethereum === 'undefined') {
      alert('Please install MetaMask to use this dApp!');
      return;
    }
    
    try {
      setIsConnecting(true);
      const browserProvider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await browserProvider.send("eth_requestAccounts", []);
      const signerInstance = await browserProvider.getSigner();
      const network = await browserProvider.getNetwork();

      setProvider(browserProvider);
      setSigner(signerInstance);
      setAccount(accounts[0]);
      setChainId(network.chainId);

      // Initialize contracts
      const routerContract = new ethers.Contract(CONTRACT_ADDRESSES.Router, ABIS.Router, signerInstance);
      const factoryContract = new ethers.Contract(CONTRACT_ADDRESSES.Factory, ABIS.Factory, signerInstance);
      
      setRouter(routerContract);
      setFactory(factoryContract);

    } catch (error) {
      console.error("Connection error:", error);
    } finally {
      setIsConnecting(false);
    }
  }, []);

  useEffect(() => {
    if (window.ethereum) {
      window.ethereum.on('accountsChanged', (accounts) => {
        if (accounts.length > 0) {
          setAccount(accounts[0]);
          if (provider) {
             provider.getSigner().then((newSigner) => {
                setSigner(newSigner);
                setRouter(new ethers.Contract(CONTRACT_ADDRESSES.Router, ABIS.Router, newSigner));
                setFactory(new ethers.Contract(CONTRACT_ADDRESSES.Factory, ABIS.Factory, newSigner));
             });
          }
        } else {
          setAccount('');
          setSigner(null);
          setRouter(null);
          setFactory(null);
        }
      });

      window.ethereum.on('chainChanged', () => {
        window.location.reload();
      });
    }
  }, [provider]);

  return (
    <Web3Context.Provider value={{
      provider,
      signer,
      account,
      chainId,
      isConnecting,
      connectWallet,
      router,
      factory
    }}>
      {children}
    </Web3Context.Provider>
  );
}

export function useWeb3() {
  const context = useContext(Web3Context);
  if (!context) {
    throw new Error('useWeb3 must be used within a Web3Provider');
  }
  return context;
}
