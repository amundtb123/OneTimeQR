// The OneTimeQR mark: the three corner squares that make a QR code recognisable,
// plus a few data modules. Drawn in currentColor; public/favicon.svg is the same drawing.
export function QrMark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path fillRule="evenodd" d="M0 0h10v10H0zM2 2v6h6V2z" />
      <rect x="3.5" y="3.5" width="3" height="3" />
      <path fillRule="evenodd" d="M14 0h10v10H14zM16 2v6h6V2z" />
      <rect x="17.5" y="3.5" width="3" height="3" />
      <path fillRule="evenodd" d="M0 14h10v10H0zM2 16v6h6v-6z" />
      <rect x="3.5" y="17.5" width="3" height="3" />
      <rect x="14" y="14" width="3" height="3" />
      <rect x="17" y="14" width="3" height="3" />
      <rect x="14" y="17" width="3" height="3" />
      <rect x="21" y="17" width="3" height="3" />
      <rect x="17" y="21" width="3" height="3" />
      <rect x="21" y="21" width="3" height="3" />
      <rect x="11.5" y="4" width="1.5" height="1.5" />
      <rect x="4" y="11.5" width="1.5" height="1.5" />
    </svg>
  );
}
