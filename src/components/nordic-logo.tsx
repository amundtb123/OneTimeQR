// Abstract QR-inspired logo without actual QR code - WCAG compliant colors
export function NordicLogo({ className = "w-10 h-10" }: { className?: string }) {
  return (
    <div className={`${className} relative`}>
      <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Soft geometric blocks inspired by QR codes */}
        <rect x="10" y="10" width="25" height="25" rx="8" fill="#5D8CC9" />
        <rect x="65" y="10" width="25" height="25" rx="8" fill="#C6A99A" />
        <rect x="10" y="65" width="25" height="25" rx="8" fill="#E8927E" />
        
        {/* Center scan frame element */}
        <rect x="45" y="45" width="30" height="30" rx="10" fill="#E1C7BA" />
        <rect x="50" y="50" width="20" height="20" rx="6" fill="#F7F2EE" />
        
        {/* Small accent pixels */}
        <rect x="42" y="15" width="8" height="8" rx="3" fill="#5D8CC9" opacity="0.6" />
        <rect x="42" y="77" width="8" height="8" rx="3" fill="#C6A99A" opacity="0.6" />
        <rect x="77" y="50" width="8" height="8" rx="3" fill="#E8927E" opacity="0.6" />
      </svg>
    </div>
  );
}