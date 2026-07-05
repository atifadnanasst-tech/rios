import React from 'react';
import { LucideIcon } from 'lucide-react';

interface KPICardProps {
  title: string;
  value: string | number;
  subtext: string;
  icon?: LucideIcon;
  className?: string;
  id?: string;
}

export const KPICard: React.FC<KPICardProps> = ({
  title,
  value,
  subtext,
  icon: Icon,
  className = '',
  id
}) => {
  return (
    <div
      id={id || `kpi-${title.toLowerCase().replace(/\s+/g, '-')}`}
      className={`flex-1 min-w-[140px] bg-rios-card border border-rios-border rounded-[14px] p-4.5 font-sans relative overflow-hidden group select-none hover:bg-rios-card-hover hover:border-rios-border-hover transition-all duration-150 ${className}`}
    >
      {/* Decorative gradient corner glow on hover */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/[0.01] to-transparent group-hover:from-white/[0.02] pointer-events-none transition-all duration-150" />
      
      <div className="flex flex-col gap-1 z-10 relative">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-rios-text-muted">
            {title}
          </span>
          {Icon && (
            <Icon className="w-4 h-4 text-rios-text-muted group-hover:text-rios-purple transition-colors duration-150" />
          )}
        </div>
        
        <span className="text-2xl font-bold tracking-tight text-white mt-1.5 leading-none">
          {value}
        </span>
        
        <span className="text-[10px] text-rios-text-secondary mt-1 font-mono tracking-wide leading-none">
          {subtext}
        </span>
      </div>
    </div>
  );
};
