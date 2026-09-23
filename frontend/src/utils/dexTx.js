import { ethers } from 'ethers';
import { ABIS } from './contracts';

/** Approve MaxUint256 only when the current allowance is short. Returns true if a tx was sent. */
export async function ensureAllowance({ tokenAddress, owner, spender, amount, signer }) {
  const token = new ethers.Contract(tokenAddress, ABIS.ERC20, signer);
  const current = await token.allowance(owner, spender);
  if (current >= amount) return false;
  const tx = await token.approve(spender, ethers.MaxUint256);
  await tx.wait();
  return true;
}
