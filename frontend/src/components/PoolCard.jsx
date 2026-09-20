import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { ethers } from 'ethers';
import { useWeb3 } from '../hooks/useWeb3';
import { TOKENS, ABIS } from '../utils/contracts';

export default function PoolCard() {
  const { account, connectWallet, router, signer } = useWeb3();
  const [tokenASymbol] = useState('10X');
  const [tokenBSymbol] = useState('AYO');
  const [amountA, setAmountA] = useState('');
  const [amountB, setAmountB] = useState('');
  const [isApproving, setIsApproving] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [reserves, setReserves] = useState([0n, 0n]);
  const { factory } = useWeb3();

  React.useEffect(() => {
    const fetchReserves = async () => {
      if (!factory || !signer) return;
      try {
        const pairAddress = await factory.getPair(TOKENS[tokenASymbol], TOKENS[tokenBSymbol]);
        if (pairAddress !== ethers.ZeroAddress) {
          const pair = new ethers.Contract(pairAddress, ABIS.Pair, signer);
          const [res0, res1] = await pair.getReserves();
          const token0 = await pair.token0();
          if (token0.toLowerCase() === TOKENS[tokenASymbol].toLowerCase()) {
            setReserves([res0, res1]);
          } else {
            setReserves([res1, res0]);
          }
        }
      } catch (err) {
        console.error("Failed to fetch reserves", err);
      }
    };
    fetchReserves();
  }, [factory, signer, tokenASymbol, tokenBSymbol]);

  const handleAmountAChange = async (val) => {
    setAmountA(val);
    if (!val || isNaN(val) || reserves[0] === 0n) return;
    try {
      const amount = ethers.parseEther(val);
      const optimalB = await router.quote(amount, reserves[0], reserves[1]);
      setAmountB(ethers.formatEther(optimalB));
    } catch (e) {}
  };

  const handleAddLiquidity = async () => {
    if (!router || !signer) return;
    try {
      setIsAdding(true);
      const parsedAmountA = ethers.parseEther(amountA);
      const parsedAmountB = ethers.parseEther(amountB);
      
      const deadline = Math.floor(Date.now() / 1000) + 60 * 20;

      // 1. Approve router to spend tokenA and tokenB
      setIsApproving(true);
      const tokenAContract = new ethers.Contract(TOKENS[tokenASymbol], ABIS.ERC20, signer);
      const tokenBContract = new ethers.Contract(TOKENS[tokenBSymbol], ABIS.ERC20, signer);
      
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
        TOKENS[tokenASymbol],
        TOKENS[tokenBSymbol],
        parsedAmountA,
        parsedAmountB,
        amountAMin,
        amountBMin,
        account,
        deadline
      );
      await tx.wait();
      alert('Liquidity added successfully!');
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

  return (
    <div className="glass-panel" style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h2 style={{ margin: 0, fontSize: '1.2rem' }}>Add Liquidity</h2>
      </div>

      <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '16px' }}>
        Provide liquidity to earn a 0.3% fee on all trades proportional to your share of the pool.
      </div>

      {/* Input Token A */}
      <div className="input-container" style={{ marginBottom: '4px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Deposit</span>
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
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Deposit</span>
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
        <button className="btn btn-primary" style={{ width: '100%', padding: '16px', fontSize: '1.1rem' }} onClick={connectWallet}>
          Connect Wallet
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
          {isApproving ? 'Approving Tokens...' : isAdding ? 'Adding Liquidity...' : 'Add Liquidity'}
        </button>
      )}
    </div>
  );
}
