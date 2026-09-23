import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useAccount, useConnect, useDisconnect, useSwitchChain } from 'wagmi';
import { sepolia } from 'wagmi/chains';
import { ethers } from 'ethers';
import { NETWORKS, ABIS } from '../utils/contracts';

const Web3Context = createContext(null);

export function Web3Provider({ children }) {
  // Wagmi hooks
  const { address, isConnected, chainId: wagmiChainId, status } = useAccount();
  const { connectAsync, connectors, isPending: isConnectPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChainAsync } = useSwitchChain();

  const [selectedNetwork, setSelectedNetwork] = useState('sepolia'); // 'sepolia' | 'anvil'
  const [signer, setSigner] = useState(null);
  const [provider, setProvider] = useState(null);
  const [switchError, setSwitchError] = useState(null);
  const [dataVersion, setDataVersion] = useState(0);
  const bumpData = useCallback(() => setDataVersion((version) => version + 1), []);

  const activeNetworkConfig = useMemo(() => {
    return NETWORKS[selectedNetwork] || NETWORKS.sepolia;
  }, [selectedNetwork]);

  const tokens = activeNetworkConfig.tokens;
  const addresses = activeNetworkConfig.addresses;
  const isCorrectNetwork = wagmiChainId === activeNetworkConfig.chainId;

  // Dedicated read-only fallback provider
  const readProvider = useMemo(() => {
    try {
      return new ethers.JsonRpcProvider(activeNetworkConfig.rpcUrl);
    } catch {
      return null;
    }
  }, [activeNetworkConfig.rpcUrl]);

  // Sync ethers signer whenever address, chain, or window.ethereum changes
  useEffect(() => {
    let active = true;
    const updateSigner = async () => {
      if (isConnected && address && typeof window !== 'undefined' && window.ethereum) {
        try {
          const browserProvider = new ethers.BrowserProvider(window.ethereum, 'any');
          const s = await browserProvider.getSigner();
          if (active) {
            setProvider(browserProvider);
            setSigner(s);
          }
        } catch (err) {
          console.error("Failed to acquire signer:", err);
          if (active) setSigner(null);
        }
      } else {
        if (active) {
          setSigner(null);
          setProvider(null);
        }
      }
    };
    updateSigner();
    return () => {
      active = false;
    };
  }, [isConnected, address, wagmiChainId]);

  // Network Switch Function using Wagmi
  const switchWalletToNetwork = useCallback(async (networkKey) => {
    setSwitchError(null);
    const target = NETWORKS[networkKey];
    if (!target) return false;

    try {
      if (switchChainAsync) {
        await switchChainAsync({ chainId: target.chainId });
      } else if (typeof window !== 'undefined' && window.ethereum) {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: target.chainIdHex }],
        });
      }
      setSelectedNetwork(networkKey);
      return true;
    } catch (err) {
      console.warn("Wagmi switchChain error, attempting addEthereumChain if code 4902:", err);
      // If chain not added to wallet
      if (err?.code === 4902 || err?.data?.originalError?.code === 4902 || err?.message?.includes('4902')) {
        try {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: target.chainIdHex,
              chainName: target.name,
              nativeCurrency: target.currency,
              rpcUrls: [target.rpcUrl],
              blockExplorerUrls: target.explorerUrl ? [target.explorerUrl] : [],
            }],
          });
          setSelectedNetwork(networkKey);
          return true;
        } catch (addErr) {
          console.error("Failed to add network:", addErr);
          setSwitchError(addErr.message);
        }
      } else {
        setSwitchError(err.message || 'Failed to switch network');
      }
      return false;
    }
  }, [switchChainAsync]);

  // Automatic Switch to Sepolia:
  // Lead engineer reported having to manually switch and it failed on his end.
  // Whenever the user is connected and not on Sepolia while Sepolia is selected, automatically trigger the switch!
  useEffect(() => {
    if (isConnected && wagmiChainId && selectedNetwork === 'sepolia' && wagmiChainId !== sepolia.id) {
      console.log(`Auto-switching to Sepolia (${sepolia.id}) from current chain ${wagmiChainId}`);
      switchWalletToNetwork('sepolia');
    }
  }, [isConnected, wagmiChainId, selectedNetwork, switchWalletToNetwork]);

  // Connect Wallet using Wagmi with direct target chain
  const connectWallet = useCallback(async () => {
    try {
      setSwitchError(null);
      // Prefer injected (MetaMask, Rabby, etc.)
      const injectedConnector = connectors.find((c) => c.id === 'injected' || c.id === 'metaMask') || connectors[0];
      if (!injectedConnector) {
        if (typeof window !== 'undefined' && !window.ethereum) {
          alert('Please install MetaMask or a Web3 wallet extension to use 10x DEX!');
          return;
        }
      }

      await connectAsync({
        connector: injectedConnector,
        chainId: selectedNetwork === 'anvil' ? 31337 : sepolia.id,
      });

      // Ensure chain matches selectedNetwork
      const targetChainId = selectedNetwork === 'anvil' ? 31337 : sepolia.id;
      if (wagmiChainId && wagmiChainId !== targetChainId) {
        await switchWalletToNetwork(selectedNetwork);
      }
    } catch (err) {
      console.error("Wagmi connect error:", err);
    }
  }, [connectors, connectAsync, selectedNetwork, wagmiChainId, switchWalletToNetwork]);

  const disconnectWallet = useCallback(() => {
    disconnect();
    setSigner(null);
    setProvider(null);
  }, [disconnect]);

  // Contracts: signer if connected to the right network, otherwise fallback to readProvider
  const router = useMemo(() => {
    const rAddr = activeNetworkConfig.addresses?.Router;
    if (!rAddr) return null;
    if (signer && isCorrectNetwork) {
      return new ethers.Contract(rAddr, ABIS.Router, signer);
    }
    if (readProvider) {
      return new ethers.Contract(rAddr, ABIS.Router, readProvider);
    }
    return null;
  }, [signer, isCorrectNetwork, activeNetworkConfig, readProvider]);

  const factory = useMemo(() => {
    const fAddr = activeNetworkConfig.addresses?.Factory;
    if (!fAddr) return null;
    if (signer && isCorrectNetwork) {
      return new ethers.Contract(fAddr, ABIS.Factory, signer);
    }
    if (readProvider) {
      return new ethers.Contract(fAddr, ABIS.Factory, readProvider);
    }
    return null;
  }, [signer, isCorrectNetwork, activeNetworkConfig, readProvider]);

  return (
    <Web3Context.Provider
      value={{
        provider,
        readProvider,
        signer,
        account: address || '',
        address: address || '',
        isConnected,
        isConnecting: isConnectPending || status === 'connecting',
        walletChainId: wagmiChainId,
        chainId: wagmiChainId,
        selectedNetwork,
        setSelectedNetwork,
        activeNetworkConfig,
        isCorrectNetwork,
        connectWallet,
        disconnectWallet,
        switchWalletToNetwork,
        switchError,
        tokens,
        addresses,
        router,
        factory,
        dataVersion,
        bumpData,
      }}
    >
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
