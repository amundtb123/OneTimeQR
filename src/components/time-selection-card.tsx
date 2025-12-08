import { SoftCard } from './soft-card';
import { Clock, Calendar, Infinity, ScanLine } from 'lucide-react';

interface TimeOption {
  label: string;
  value: string;
  icon: 'clock' | 'calendar' | 'infinity' | 'scan';
}

const timeOptions: TimeOption[] = [
  { label: '10 minutter', value: '10min', icon: 'clock' },
  { label: '30 minutter', value: '30min', icon: 'clock' },
  { label: '1 time', value: '1hour', icon: 'clock' },
  { label: '24 timer', value: '24hours', icon: 'calendar' },
  { label: '7 dager', value: '7days', icon: 'calendar' },
  { label: 'Til første skanning', value: 'first-scan', icon: 'scan' },
];

interface TimeSelectionCardProps {
  selectedTime: string;
  onTimeSelect: (time: string) => void;
}

export function TimeSelectionCard({ selectedTime, onTimeSelect }: TimeSelectionCardProps) {
  const getIcon = (iconType: string) => {
    const iconClass = "w-5 h-5";
    switch (iconType) {
      case 'clock': return <Clock className={iconClass} />;
      case 'calendar': return <Calendar className={iconClass} />;
      case 'infinity': return <Infinity className={iconClass} />;
      case 'scan': return <ScanLine className={iconClass} />;
      default: return <Clock className={iconClass} />;
    }
  };

  return (
    <SoftCard className="relative overflow-hidden">
      {/* Background grid */}
      <div className="absolute inset-0 opacity-[0.03]">
        <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="time-grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#EADFD6" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#time-grid)" />
        </svg>
      </div>

      <div className="relative">
        <h3 className="mb-4 text-[#6B6358]">Hvor lenge skal filen være tilgjengelig?</h3>
        
        <div className="grid grid-cols-2 gap-3">
          {timeOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => onTimeSelect(option.value)}
              className={`
                p-4 rounded-2xl transition-all duration-200 text-left
                ${selectedTime === option.value 
                  ? 'bg-[#8BA8C7] text-white shadow-lg' 
                  : 'bg-[#F5F0EB] text-[#6B6358] hover:bg-[#EADFD6]'
                }
              `}
              style={{
                boxShadow: selectedTime === option.value 
                  ? '0 4px 20px rgba(139, 168, 199, 0.3)' 
                  : '0 2px 8px rgba(107, 99, 88, 0.06)',
              }}
            >
              <div className="flex items-center gap-3">
                {getIcon(option.icon)}
                <span>{option.label}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </SoftCard>
  );
}