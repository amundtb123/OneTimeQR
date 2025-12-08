// Decorative background shapes inspired by Nordic design
export function DecorativeBackground() {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
      {/* Soft organic shapes with WCAG compliant colors */}
      <div 
        className="absolute top-20 right-10 w-96 h-96 rounded-full opacity-20"
        style={{ 
          background: 'radial-gradient(circle, #C6A99A 0%, transparent 70%)',
          filter: 'blur(60px)'
        }}
      />
      <div 
        className="absolute bottom-32 left-10 w-80 h-80 rounded-full opacity-15"
        style={{ 
          background: 'radial-gradient(circle, #E8927E 0%, transparent 70%)',
          filter: 'blur(50px)'
        }}
      />
      <div 
        className="absolute top-1/2 left-1/3 w-64 h-64 rounded-full opacity-15"
        style={{ 
          background: 'radial-gradient(circle, #5D8CC9 0%, transparent 70%)',
          filter: 'blur(70px)'
        }}
      />
      
      {/* Geometric grid lines - very subtle */}
      <svg 
        className="absolute inset-0 w-full h-full opacity-[0.025]" 
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
            <path 
              d="M 60 0 L 0 0 0 60" 
              fill="none" 
              stroke="#D5C5BD" 
              strokeWidth="1"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>
    </div>
  );
}

// Decorative floating shapes
export function FloatingShapes() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {/* Rounded rectangles - QR inspired but abstract */}
      <div 
        className="absolute top-1/4 right-1/4 w-16 h-16 rounded-2xl opacity-30"
        style={{ background: '#C6A99A' }}
      />
      <div 
        className="absolute top-1/3 left-1/4 w-12 h-12 rounded-xl opacity-25"
        style={{ background: '#5D8CC9' }}
      />
      <div 
        className="absolute bottom-1/4 right-1/3 w-20 h-20 rounded-3xl opacity-20"
        style={{ background: '#E8927E' }}
      />
      <div 
        className="absolute top-2/3 left-1/3 w-14 h-14 rounded-2xl opacity-25"
        style={{ background: '#E1C7BA' }}
      />
    </div>
  );
}