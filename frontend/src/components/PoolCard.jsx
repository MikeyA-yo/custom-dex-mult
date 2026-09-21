import React, { useState, useEffect } from 'react';
import { Plus, Wallet, AlertCircle } from 'lucide-react';
import { ethers } from 'ethers';
import { useWeb3 } from '../hooks/useWeb3';
import { ABIS } from '../utils/contracts';

export default function PoolCard() {
  const {
    account,
    connectWallet,
    router,
    signer,
    factory,
    readProvider,
    tokens,
    isCorrectNetwork,
    selectedNetwork,
    activeNetworkConfig,
    switchWalletToNetwork,
  } = useWeb3();

  const [tokenASymbol] = useState('10X');
  const [tokenBSymbol] = useState('AYO');
  const [amountA, setAmountA] = useState('');
  const [amountB, setAmountB] = useState('');
  const [isApproving, setIsApproving] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [reserves, setReserves] = useState([0n, 0n]);
  const [balanceA, setBalanceA] = useState('0');
  const [balanceB, setBalanceB] = useState('0');
  const [isNodeOffline, setIsNodeOffline] = useState(false);

  // Fetch token balances
  useEffect(() => {
    let isMounted = true;
    const fetchBalances = async () => {
      if (!account || !tokens) return;
      const targetProvider = (signer && isCorrectNetwork) ? signer : readProvider;
      if (!targetProvider) return;

      try {
        const addrA = tokens[tokenASymbol];
        const addrB = tokens[tokenBSymbol];
        if (addrA && addrB) {
          const cA = new ethers.Contract(addrA, ABIS.ERC20, targetProvider);
          const cB = new ethers.Contract(addrB, ABIS.ERC20, targetProvider);
          const [bA, bB] = await Promise.all([cA.balanceOf(account), cB.balanceOf(account)]);
          if (isMounted) {
            setBalanceA(ethers.formatEther(bA));
            setBalanceB(ethers.formatEther(bB));
            setIsNodeOffline(false);
          }
        }
      } catch (err) {
        if (isMounted) {
          setBalanceA('0');
          setBalanceB('0');
          if (selectedNetwork === 'anvil') {
            setIsNodeOffline(true);
          }
        }
      }
    };
    fetchBalances();
  }, [account, signer, isCorrectNetwork, readProvider, tokens, tokenASymbol, tokenBSymbol, selectedNetwork]);

  // Fetch reserves
  useEffect(() => {
    let isMounted = true;
    const fetchReserves = async () => {
      if (!tokens) return;
      const targetFactory = factory || (readProvider ? new ethers.Contract(activeNetworkConfig.addresses.Factory, ABIS.Factory, readProvider) : null);
      if (!targetFactory) return;

      try {
        const pairAddress = await targetFactory.getPair(tokens[tokenASymbol], tokens[tokenBSymbol]);
        if (pairAddress && pairAddress !== ethers.ZeroAddress) {
          const pair = new ethers.Contract(pairAddress, ABIS.Pair, readProvider || signer || factory.runner);
          const [res0, res1] = await pair.getReserves();
          const token0 = await pair.token0();
          if (isMounted) {
            if (token0.toLowerCase() === tokens[tokenASymbol].toLowerCase()) {
              setReserves([res0, res1]);
            } else {
              setReserves([res1, res0]);
            }
            setIsNodeOffline(false);
          }
        } else {
          if (isMounted) setReserves([0n, 0n]);
        }
      } catch (err) {
        if (isMounted) {
          setReserves([0n, 0n]);
          if (selectedNetwork === 'anvil') {
            setIsNodeOffline(true);
          }
        }
      }
    };
    fetchReserves();
  }, [factory, readProvider, signer, isCorrectNetwork, tokenASymbol, tokenBSymbol, tokens, selectedNetwork, activeNetworkConfig]);

  const handleAmountAChange = async (val) => {
    setAmountA(val);
    if (!val || isNaN(val) || Number(val) <= 0 || !router || reserves[0] === 0n) return;
    try {
      const amount = ethers.parseEther(val);
      const optimalB = await router.quote(amount, reserves[0], reserves[1]);
      setAmountB(ethers.formatEther(optimalB));
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddLiquidity = async () => {
    if (!router || !signer || !tokens) return;
    try {
      setIsAdding(true);
      const parsedAmountA = ethers.parseEther(amountA);
      const parsedAmountB = ethers.parseEther(amountB);
      const deadline = Math.floor(Date.now() / 1000) + 60 * 20;

      // 1. Approve router to spend tokenA and tokenB
      setIsApproving(true);
      const tokenAContract = new ethers.Contract(tokens[tokenASymbol], ABIS.ERC20, signer);
      const tokenBContract = new ethers.Contract(tokens[tokenBSymbol], ABIS.ERC20, signer);

      const allowanceA = await tokenAContract.allowance(account, await router.getAddress());
      if (allowanceA < parsedAmountA) {
        const txApproveA = await tokenAContract.approve(await router.getAddress(), ethers.MaxUint256);
        await txApproveA.wait();
      }

      const allowanceB = await tokenBContract.allowance(account, await router.getAddress());
      if (allowanceB < parsedAmountB) {
        const txApproveB = await tokenBContract.approve(await router.getAddress(), ethers.MaxUint256);
        await txApproveB.wait();
      }
      setIsApproving(false);

      // 2. Add Liquidity (slippage set to 0.5%)
      const amountAMin = (parsedAmountA * 995n) / 1000n;
      const amountBMin = (parsedAmountB * 995n) / 1000n;

      const tx = await router.addLiquidity(
        tokens[tokenASymbol],
        tokens[tokenBSymbol],
        parsedAmountA,
        parsedAmountB,
        amountAMin,
        amountBMin,
        account,
        deadline
      );
      await tx.wait();
      alert(`Liquidity added successfully on ${activeNetworkConfig.name}!`);
      setAmountA('');
      setAmountB('');
    } catch (err) {
      console.error(err);
      alert('Add liquidity failed. Check console.');
    } finally {
      setIsApproving(false);
      setIsAdding(false);
    }
  };

  const formatBalance = (val) => {
    if (!val || isNaN(val)) return '0.00';
    const num = parseFloat(val);
    if (num === 0) return '0.00';
    if (num < 0.0001) return '< 0.0001';
    return num.toLocaleString(undefined, { maximumFractionDigits: 4 });
  };

  return (
    <div className="glass-panel" style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h2 style={{ margin: 0, fontSize: '1.2rem' }}>Add Liquidity</h2>
        <span style={{
          fontSize: '0.8rem',
          color: 'var(--text-secondary)',
          background: 'rgba(255, 255, 255, 0.05)',
          padding: '4px 10px',
          borderRadius: '12px',
        }}>
          {activeNetworkConfig.shortName}
        </span>
      </div>

      {isNodeOffline && selectedNetwork === 'anvil' && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '10px 14px',
          borderRadius: '12px',
          background: 'rgba(234, 179, 8, 0.12)',
          border: '1px solid rgba(234, 179, 8, 0.3)',
          color: '#fde047',
          fontSize: '0.85rem',
          marginBottom: '16px',
        }}>
          <AlertCircle size={16} />
          <span>Local Anvil node not detected at 127.0.0.1:8545. Run <code>anvil</code> in terminal or switch to Sepolia.</span>
        </div>
      )}

      <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '16px', lineHeight: 1.4 }}>
        Provide liquidity on {activeNetworkConfig.name} to earn 0.3% protocol fee on all trades.
      </div>

      {/* Input Token A */}
      <div className="input-container" style={{ marginBottom: '4px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Deposit</span>
          {account && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              <Wallet size={12} />
              <span>Balance: {formatBalance(balanceA)}</span>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <input
            type="number"
            placeholder="0"
            className="token-input"
            value={amountA}
            onChange={(e) => handleAmountAChange(e.target.value)}
          />
          <button className="btn btn-secondary" style={{ padding: '8px 16px', borderRadius: '12px' }}>
            {tokenASymbol}
          </button>
        </div>
      </div>

      {/* Plus Icon */}
      <div style={{ display: 'flex', justifyContent: 'center', margin: '12px 0' }}>
        <Plus size={20} color="var(--text-secondary)" />
      </div>

      {/* Input Token B */}
      <div className="input-container" style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Deposit</span>
          {account && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              <Wallet size={12} />
              <span>Balance: {formatBalance(balanceB)}</span>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <input
            type="number"
            placeholder="0"
            className="token-input"
            value={amountB}
            onChange={(e) => setAmountB(e.target.value)}
          />
          <button className="btn btn-secondary" style={{ padding: '8px 16px', borderRadius: '12px' }}>
            {tokenBSymbol}
          </button>
        </div>
      </div>

      {/* Action Button */}
      {!account ? (
        <button
          className="btn btn-primary"
          style={{ width: '100%', padding: '16px', fontSize: '1.1rem' }}
          onClick={connectWallet}
        >
          Connect Wallet
        </button>
      ) : !isCorrectNetwork ? (
        <button
          className="btn btn-primary"
          style={{
            width: '100%',
            padding: '16px',
            fontSize: '1rem',
            background: 'linear-gradient(135deg, #ef4444, #f97316)',
          }}
          onClick={() => switchWalletToNetwork(selectedNetwork)}
        >
          Switch Wallet to {activeNetworkConfig.name}
        </button>
      ) : !amountA || !amountB ? (
        <button className="btn btn-secondary" style={{ width: '100%', padding: '16px', fontSize: '1.1rem' }} disabled>
          Enter an amount
        </button>
      ) : (
        <button
          className="btn btn-primary"
          style={{ width: '100%', padding: '16px', fontSize: '1.1rem' }}
          onClick={handleAddLiquidity}
          disabled={isAdding || isApproving}
        >
          {isApproving ? 'Approving Tokens...' : isAdding ? 'Adding Liquidity...' : `Add Liquidity on ${activeNetworkConfig.shortName}`}
        </button>
      )}
    </div>
  );
}
