import { AlertCircle, Check, Info } from 'lucide-react';

const TONE = {
  success: {
    background: 'var(--success-subtle)',
    border: '1px solid rgba(16, 185, 129, 0.3)',
    color: '#34d399',
    Icon: Check,
  },
  error: {
    background: 'var(--error-subtle)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    color: '#fca5a5',
    Icon: AlertCircle,
  },
  warning: {
    background: 'var(--warning-subtle)',
    border: '1px solid rgba(245, 158, 11, 0.3)',
    color: '#fbbf24',
    Icon: AlertCircle,
  },
  info: {
    background: 'rgba(37, 99, 235, 0.12)',
    border: '1px solid rgba(37, 99, 235, 0.35)',
    color: '#93c5fd',
    Icon: Info,
  },
};

export default function StatusBanner({ type = 'info', children }) {
  if (!children) return null;
  const tone = TONE[type] ?? TONE.info;
  const Icon = tone.Icon;
  return (
    <div
      className="status-banner"
      style={{ background: tone.background, border: tone.border, color: tone.color }}
    >
      <Icon size={16} />
      <span>{children}</span>
    </div>
  );
}
