import React from 'react';

interface AvatarProps {
  src?: string;
  name: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  status?: 'Hot' | 'Warm' | 'Cold' | 'Stable' | null;
  className?: string;
  id?: string;
}

export const Avatar: React.FC<AvatarProps> = ({
  src,
  name,
  size = 'md',
  status,
  className = '',
  id
}) => {
  const sizeMap = {
    xs: 'w-6 h-6 text-xs',
    sm: 'w-8 h-8 text-sm',
    md: 'w-10 h-10 text-base',
    lg: 'w-12 h-12 text-lg',
    xl: 'w-14 h-14 text-xl'
  };

  const getInitials = (n: string) => {
    return n
      .split(' ')
      .map((part) => part[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  };

  // Border colored by status (as defined in mockup/RIG)
  const getStatusBorder = () => {
    if (!status) return 'border border-white/10';
    switch (status) {
      case 'Hot':
        return 'border-2 border-rios-critical shadow-[0_0_8px_rgba(239,68,68,0.2)]';
      case 'Warm':
        return 'border-2 border-rios-commitment';
      case 'Stable':
        return 'border-2 border-rios-building';
      case 'Cold':
        return 'border-2 border-zinc-500';
      default:
        return 'border border-white/10';
    }
  };

  return (
    <div
      id={id || `avatar-${name.toLowerCase().replace(/\s+/g, '-')}`}
      className={`relative inline-flex items-center justify-center rounded-full bg-zinc-800 font-sans font-medium text-zinc-200 select-none overflow-hidden shrink-0 ${sizeMap[size]} ${getStatusBorder()} ${className}`}
    >
      {src ? (
        <img
          src={src}
          alt={name}
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover"
        />
      ) : (
        <span>{getInitials(name)}</span>
      )}
    </div>
  );
};
