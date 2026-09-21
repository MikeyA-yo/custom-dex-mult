import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { ethers } from 'ethers';
import { NETWORKS, ABIS } from '../utils/contracts';

const Web3Context = createContext(null);

export function Web3Provider({ children }) {
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [account, setAccount] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [walletChainId, setWalletChainId] = useState(null);
  const [selectedNetwork, setSelectedNetwork] = useState('sepolia'); // 'sepolia' | 'anvil'

  const activeNetworkConfig = useMemo(() => {
    return NETWORKS[selectedNetwork] || NETWORKS.sepolia;
  }, [selectedNetwork]);

  const tokens = activeNetworkConfig.tokens;
  const addresses = activeNetworkConfig.addresses;
  const isCorrectNetwork = walletChainId === activeNetworkConfig.chainId;

  // Dedicated read-only provider for active tab (bypasses MetaMask RPC mismatches)
  const readProvider = useMemo(() => {
    try {
      return new ethers.JsonRpcProvider(activeNetworkConfig.rpcUrl);
    } catch {
      return null;
    }
  }, [activeNetworkConfig.rpcUrl]);

  // Contracts: use signer if wallet matches network, otherwise use readProvider
  const [router, setRouter] = useState(null);
  const [factory, setFactory] = useState(null);

  useEffect(() => {
    const rAddr = activeNetworkConfig.addresses.Router;
    const fAddr = activeNetworkConfig.addresses.Factory;

    if (signer && isCorrectNetwork) {
      setRouter(new ethers.Contract(rAddr, ABIS.Router, signer));
      setFactory(new ethers.Contract(fAddr, ABIS.Factory, signer));
    } else if (readProvider) {
      setRouter(new ethers.Contract(rAddr, ABIS.Router, readProvider));
      setFactory(new ethers.Contract(fAddr, ABIS.Factory, readProvider));
    } else {
      setRouter(null);
      setFactory(null);
    }
  }, [signer, isCorrectNetwork, activeNetworkConfig, readProvider]);

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
      const numChainId = Number(network.chainId);

      setProvider(browserProvider);
      setSigner(signerInstance);
      setAccount(accounts[0]);
      setWalletChainId(numChainId);

      // Auto-select network tab matching the wallet's current chain
      if (numChainId === NETWORKS.sepolia.chainId) {
        setSelectedNetwork('sepolia');
      } else if (numChainId === NETWORKS.anvil.chainId) {
        setSelectedNetwork('anvil');
      }
    } catch (error) {
      console.error("Connection error:", error);
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const switchWalletToNetwork = useCallback(async (networkKey) => {
    if (typeof window.ethereum === 'undefined') {
      setSelectedNetwork(networkKey);
      return;
    }
    const target = NETWORKS[networkKey];
    if (!target) return;

    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: target.chainIdHex }],
      });
      setSelectedNetwork(networkKey);
    } catch (switchError) {
      // Chain not added to MetaMask yet (error code 4902)
      if (switchError.code === 4902 || switchError.data?.originalError?.code === 4902) {
        try {
          const params = {
            chainId: target.chainIdHex,
            chainName: target.name,
            nativeCurrency: target.currency,
            rpcUrls: [target.rpcUrl],
          };
          if (target.explorerUrl) {
            params.blockExplorerUrls = [target.explorerUrl];
          }
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [params],
          });
          setSelectedNetwork(networkKey);
        } catch (addError) {
          console.error("Failed to add network:", addError);
        }
      } else {
        console.error("Failed to switch network:", switchError);
      }
    }
  }, []);

  const syncWallet = useCallback(async () => {
    if (typeof window.ethereum === 'undefined') return;
    try {
      const browserProvider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await browserProvider.send("eth_accounts", []);
      if (accounts.length > 0) {
        const signerInstance = await browserProvider.getSigner();
        const network = await browserProvider.getNetwork();
        const numChainId = Number(network.chainId);

        setProvider(browserProvider);
        setSigner(signerInstance);
        setAccount(accounts[0]);
        setWalletChainId(numChainId);

        if (numChainId === NETWORKS.sepolia.chainId) {
          setSelectedNetwork('sepolia');
        } else if (numChainId === NETWORKS.anvil.chainId) {
          setSelectedNetwork('anvil');
        }
      } else {
        setAccount('');
        setSigner(null);
        setWalletChainId(null);
      }
    } catch (err) {
      console.error("Error syncing wallet:", err);
    }
  }, []);

  // Sync wallet state on initial load
  useEffect(() => {
    syncWallet();
  }, [syncWallet]);

  // Listen to MetaMask account / chain changes
  useEffect(() => {
    if (window.ethereum) {
      const handleAccountsChanged = (accounts) => {
        if (accounts.length > 0) {
          syncWallet();
        } else {
          setAccount('');
          setSigner(null);
          setWalletChainId(null);
        }
      };

      const handleChainChanged = () => {
        syncWallet();
      };

      window.ethereum.on('accountsChanged', handleAccountsChanged);
      window.ethereum.on('chainChanged', handleChainChanged);

      return () => {
        window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
        window.ethereum.removeListener('chainChanged', handleChainChanged);
      };
    }
  }, [syncWallet]);

  const disconnectWallet = useCallback(() => {
    setAccount('');
    setSigner(null);
    setWalletChainId(null);
    setProvider(null);
  }, []);

  return (
    <Web3Context.Provider value={{
      provider,
      readProvider,
      signer,
      account,
      walletChainId,
      chainId: walletChainId,
      isConnecting,
      connectWallet,
      disconnectWallet,
      selectedNetwork,
      setSelectedNetwork,
      activeNetworkConfig,
      switchWalletToNetwork,
      isCorrectNetwork,
      tokens,
      addresses,
      router,
      factory,
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
