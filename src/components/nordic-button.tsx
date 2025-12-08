import { ReactNode, ButtonHTMLAttributes } from 'react';

interface NordicButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: 'primary' | 'ghost' | 'blue' | 'coral';
  size?: 'sm' | 'md' | 'lg';
}

export function NordicButton({ 
  children, 
  variant = 'primary', 
  size = 'md',
  className = '',
  ...props 
}: NordicButtonProps) {
  const variants = {
    primary: 'bg-[#C6A99A] hover:bg-[#B99787] text-[#3F3F3F] border-[#A88B7D] focus:ring-[#5D8CC9]',
    ghost: 'bg-transparent hover:bg-[#F1E8E1] text-[#5B5B5B] border-[#C6A99A] focus:ring-[#5D8CC9]',
    blue: 'bg-[#5D8CC9] hover:bg-[#4A7AB8] text-white border-[#4A6FA5] focus:ring-[#5D8CC9]',
    coral: 'bg-[#4ECDC4] hover:bg-[#3DB8AF] text-white border-[#2CA69E] focus:ring-[#4ECDC4]',
  };

  const sizes = {
    sm: 'px-4 py-2 text-sm',
    md: 'px-6 py-3',
    lg: 'px-8 py-4 text-lg',
  };

  return (
    <button
      className={`${variants[variant]} ${sizes[size]} rounded-xl border transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      style={{
        boxShadow: '0 2px 8px rgba(63, 63, 63, 0.08)',
      }}
      {...props}
    >
      {children}
    </button>
  );
}