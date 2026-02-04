'use client';

interface StatusCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  color?: 'cyan' | 'green' | 'purple' | 'white';
}

export function StatusCard({ title, value, subtitle, color = 'white' }: StatusCardProps) {
  const colorClasses = {
    cyan: 'text-cyan-400',
    green: 'text-green-400',
    purple: 'text-purple-400',
    white: 'text-white'
  };

  return (
    <div className="card">
      <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">
        {title}
      </div>
      <div className={`text-2xl font-bold ${colorClasses[color]}`}>
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
      {subtitle && (
        <div className="text-xs text-zinc-500 mt-1">{subtitle}</div>
      )}
    </div>
  );
}
