import { useEffect, useState } from 'react';

const PRICE_URL = 'https://coins.llama.fi/prices/current/coingecko:ethereum';
const REFRESH_MS = 60_000;

let cached = { usd: null, updatedAt: 0 };
let inflight = null;

function loadEthUsd() {
  if (cached.usd != null && Date.now() - cached.updatedAt < REFRESH_MS) {
    return Promise.resolve(cached.usd);
  }
  if (!inflight) {
    inflight = fetch(PRICE_URL)
      .then((response) => {
        if (!response.ok) throw new Error('ETH price request failed');
        return response.json();
      })
      .then((body) => {
        const usd = body?.coins?.['coingecko:ethereum']?.price;
        if (!Number.isFinite(usd) || usd <= 0) throw new Error('ETH price missing');
        cached = { usd, updatedAt: Date.now() };
        return usd;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

export function useEthUsd() {
  const [ethUsd, setEthUsd] = useState(cached.usd);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const run = () => {
      loadEthUsd()
        .then((usd) => {
          if (!active) return;
          setEthUsd(usd);
          setError('');
        })
        .catch(() => {
          if (!active) return;
          setError('Dollar prices are unavailable right now.');
        });
    };
    run();
    const timer = setInterval(run, REFRESH_MS);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  return { ethUsd, error };
}
