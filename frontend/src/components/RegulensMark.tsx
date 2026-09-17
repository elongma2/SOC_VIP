export function RegulensMark({ size = 36 }: { size?: number }) {
  return (
    <svg
      aria-label="Regulens inspection mark"
      role="img"
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="7.5" y="5.5" width="20" height="25" rx="4" stroke="currentColor" strokeWidth="1.8" />
      <path d="M13 12.5H22M13 17H20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="25.5" cy="24.5" r="7" fill="#F0FDFA" stroke="currentColor" strokeWidth="2" />
      <path d="M30.5 29.5L35 34" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M22.5 22.5H28.5M22.5 25H27M22.5 27.5H25.5" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" />
    </svg>
  );
}
