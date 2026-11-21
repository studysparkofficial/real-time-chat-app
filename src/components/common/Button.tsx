import React from 'react';
import { Loader2 } from 'lucide-react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  disabled,
  style,
  ...props
}) => {
  const getVariantStyles = (): React.CSSProperties => {
    switch (variant) {
      case 'secondary':
        return {
          background: 'var(--bg-tertiary, #1f2937)',
          color: 'var(--text-primary, #f8fafc)',
          border: '1px solid var(--border-color, rgba(255,255,255,0.1))'
        };
      case 'ghost':
        return {
          background: 'transparent',
          color: 'var(--text-secondary, #94a3b8)',
          border: 'none'
        };
      case 'danger':
        return {
          background: 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)',
          color: '#ffffff',
          border: 'none'
        };
      case 'primary':
      default:
        return {
          background: 'var(--accent-gradient)',
          color: '#ffffff',
          border: 'none',
          boxShadow: 'var(--shadow-sm)'
        };
    }
  };

  const getSizeStyles = (): React.CSSProperties => {
    switch (size) {
      case 'sm':
        return {
          padding: '6px 12px',
          fontSize: '13px',
          minHeight: '36px',
          borderRadius: '8px'
        };
      case 'lg':
        return {
          padding: '12px 24px',
          fontSize: '16px',
          minHeight: '48px',
          borderRadius: '12px'
        };
      case 'md':
      default:
        return {
          padding: '10px 18px',
          fontSize: '14.5px',
          minHeight: '44px', // Android touch target minimum
          borderRadius: '10px'
        };
    }
  };

  return (
    <button
      disabled={disabled || loading}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        fontWeight: 500,
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        transition: 'all 0.2s ease',
        userSelect: 'none',
        ...getVariantStyles(),
        ...getSizeStyles(),
        ...style
      }}
      {...props}
    >
      {loading ? (
        <Loader2 className="animate-spin" size={18} style={{ animation: 'spin 1s linear infinite' }} />
      ) : (
        icon
      )}
      {children}
    </button>
  );
};
