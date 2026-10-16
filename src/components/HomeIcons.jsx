// ═══════════════════════════════════════════════════════════════════════════
// IKON SVG inline untuk halaman beranda. Inline (tanpa paket ikon) supaya
// tidak menambah dependensi, dan tidak bergantung pada font emoji yang bisa
// tidak tersedia di perangkat/browser tertentu (akan tampil sebagai kotak).
// Semua ikon aria-hidden; teks di sekitarnya yang menjelaskan fungsinya.
// ═══════════════════════════════════════════════════════════════════════════

function Svg({ children, size = 22, className = "", ...rest }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
      {...rest}
    >
      {children}
    </svg>
  )
}

export function EyeIcon(props) {
  return (
    <Svg {...props}>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </Svg>
  )
}

export function EyeOffIcon(props) {
  return (
    <Svg {...props}>
      <path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.1M6.6 6.6A17.3 17.3 0 0 0 2 12s3.6 7 10 7a9.8 9.8 0 0 0 5.4-1.6" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      <path d="M2 2l20 20" />
    </Svg>
  )
}

export function PlusIcon(props) {
  return (
    <Svg {...props}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  )
}

export function SparkIcon(props) {
  return (
    <Svg {...props}>
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
      <path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z" />
    </Svg>
  )
}

export function BookIcon(props) {
  return (
    <Svg {...props}>
      <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" />
      <path d="M4 19V5M9 7h6" />
    </Svg>
  )
}

export function FileIcon(props) {
  return (
    <Svg {...props}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5M9 13h6M9 17h4" />
    </Svg>
  )
}

export function BoltIcon(props) {
  return (
    <Svg {...props}>
      <path d="M13 2L4 14h7l-1 8 9-12h-7z" />
    </Svg>
  )
}

export function UsersIcon(props) {
  return (
    <Svg {...props}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4-6" />
    </Svg>
  )
}

export function ChartIcon(props) {
  return (
    <Svg {...props}>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </Svg>
  )
}

export function ArrowRightIcon(props) {
  return (
    <Svg {...props}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </Svg>
  )
}

export function ArrowLeftIcon(props) {
  return (
    <Svg {...props}>
      <path d="M19 12H5M11 6l-6 6 6 6" />
    </Svg>
  )
}

export function StarIcon(props) {
  return (
    <Svg {...props}>
      <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />
    </Svg>
  )
}

export function ClockIcon(props) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </Svg>
  )
}

export function UserIcon(props) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </Svg>
  )
}

export function BulbIcon(props) {
  return (
    <Svg {...props}>
      <path d="M9.5 18h5M10.5 21h3" />
      <path d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.2 1.3 2.2h4.6c.2-1 .6-1.6 1.3-2.2A6 6 0 0 0 12 3Z" />
    </Svg>
  )
}

export function SearchIcon(props) {
  return (
    <Svg {...props}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-3.8-3.8" />
    </Svg>
  )
}

export function LockIcon(props) {
  return (
    <Svg {...props}>
      <rect x="5" y="10.5" width="14" height="9.5" rx="2.5" />
      <path d="M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3" />
    </Svg>
  )
}

export function PlayIcon(props) {
  return (
    <Svg {...props}>
      <path d="M8 5.5v13l11-6.5z" />
    </Svg>
  )
}

export function TrashIcon(props) {
  return (
    <Svg {...props}>
      <path d="M4 7h16M9.5 7V5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2M6.5 7l1 13h9l1-13" />
      <path d="M10 11v6M14 11v6" />
    </Svg>
  )
}

export function RefreshIcon(props) {
  return (
    <Svg {...props}>
      <path d="M20 12a8 8 0 1 1-2.3-5.6" />
      <path d="M20 3.5V8h-4.5" />
    </Svg>
  )
}

export function CopyIcon(props) {
  return (
    <Svg {...props}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V6a2 2 0 0 1 2-2h9" />
    </Svg>
  )
}

export function SlidersIcon(props) {
  return (
    <Svg {...props}>
      <path d="M4 7.5h9M17.5 7.5H20M4 16.5h3M11.5 16.5H20" />
      <circle cx="15" cy="7.5" r="2.2" />
      <circle cx="9" cy="16.5" r="2.2" />
    </Svg>
  )
}

export function InboxIcon(props) {
  return (
    <Svg {...props}>
      <path d="M3 13l2.7-7h12.6L21 13v6a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 19z" />
      <path d="M3 13h5.5a3 3 0 0 0 6 0H21" />
    </Svg>
  )
}

export function GradeIcon(props) {
  return (
    <Svg {...props}>
      <path d="M12 4L2 9.5 12 15l10-5.5z" />
      <path d="M6.5 11.5V16c0 1.5 2.5 3 5.5 3s5.5-1.5 5.5-3v-4.5" />
      <path d="M21.5 9.5V14" />
    </Svg>
  )
}
