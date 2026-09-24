import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { TRADABLE } from '../utils/tokens';

export default function TokenSelect({ symbol, onChange, options = TRADABLE }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  return (
    <div className="token-select" ref={rootRef}>
      <button
        type="button"
        className="token-badge token-badge-btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span>{symbol}</span>
        <ChevronDown size={14} />
      </button>
      {open ? (
        <div className="token-menu" role="listbox" aria-label="Choose token">
          {options.map((token) => (
            <button
              type="button"
              key={token.symbol}
              role="option"
              aria-selected={token.symbol === symbol}
              className={token.symbol === symbol ? 'is-selected' : undefined}
              onClick={() => {
                onChange(token.symbol);
                setOpen(false);
              }}
            >
              <strong>{token.symbol}</strong>
              <span>{token.name}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
