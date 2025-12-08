import { ReactNode } from 'react';

interface SoftCardProps {
  children: ReactNode;
  className?: string;
  variant?: 'default' | 'neutral' | 'clay' | 'blue' | 'coral';
}

export function SoftCard({ children, className = '', variant = 'default' }: SoftCardProps) {
  const variants = {
    default: 'bg-white border-[#D5C5BD]',
    neutral: 'bg-[#E8DCD4] border-[#D5C5BD]',
    clay: 'bg-[#E1C7BA] border-[#D5C5BD]',
    blue: 'bg-[#E2EFFA] border-[#D5C5BD]',
    coral: 'bg-[#F5E5E1] border-[#D5C5BD]',
  };

  return (
    <div 
      className={`${variants[variant]} rounded-2xl p-6 border ${className}`}
      style={{
        boxShadow: '0 8px 24px rgba(63, 63, 63, 0.06), 0 2px 6px rgba(63, 63, 63, 0.03)',
      }}
    >
      {children}
    </div>
  );
}