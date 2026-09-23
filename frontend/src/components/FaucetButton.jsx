import { useState } from 'react';
import { ethers } from 'ethers';
import { Coins } from 'lucide-react';
import { useWeb3 } from '../hooks/useWeb3';
import { ABIS } from '../utils/contracts';
import { decodeRevert } from '../utils/dexMath';
import StatusBanner from './StatusBanner';

const MINT_AMOUNT = ethers.parseEther('1000');

export default function FaucetButton() {
  const {
    account,
    signer,
    tokens,
    isCorrectNetwork,
    selectedNetwork,
    connectWallet,
    bumpData,
    activeNetworkConfig,
  } = useWeb3();
  const [phase, setPhase] = useState('');
  const [status, setStatus] = useState(null);

  const isTestnet = selectedNetwork === 'sepolia' || selectedNetwork === 'anvil';
  if (!isTestnet) return null;

  const mint = async () => {
    if (!signer || !account || !tokens) return;
    setStatus(null);
    try {
      const token10x = new ethers.Contract(tokens['10X'], ABIS.ERC20, signer);
      const ayo = new ethers.Contract(tokens.AYO, ABIS.ERC20, signer);
      setPhase('Minting 1,000 10X…');
      const first = await token10x.mint(account, MINT_AMOUNT);
      await first.wait();
      setPhase('Minting 1,000 AYO…');
      const second = await ayo.mint(account, MINT_AMOUNT);
      await second.wait();
      setStatus({ type: 'success', text: 'Minted 1,000 10X and 1,000 AYO to your wallet.' });
      bumpData();
    } catch (err) {
      setStatus({ type: 'error', text: decodeRevert(err) });
    } finally {
      setPhase('');
    }
  };

  return (
    <div className="faucet-wrap">
      <div className="faucet-bar">
        <div className="faucet-copy">
          <Coins size={16} />
          <div>
            <strong>Test tokens</strong>
            <p>Mint 1,000 10X and 1,000 AYO on {activeNetworkConfig.shortName}. Testnets only.</p>
          </div>
        </div>
        {!account ? (
          <button type="button" className="btn btn-secondary" onClick={connectWallet}>
            Connect to mint
          </button>
        ) : !isCorrectNetwork ? (
          <span className="faucet-wait">Switch network to mint</span>
        ) : (
          <button type="button" className="btn btn-secondary" onClick={mint} disabled={Boolean(phase)}>
            {phase || 'Get test tokens'}
          </button>
        )}
      </div>
      {status ? <StatusBanner type={status.type}>{status.text}</StatusBanner> : null}
    </div>
  );
}
