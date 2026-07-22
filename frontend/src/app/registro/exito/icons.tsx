type IconProps = { className?: string };

export function CrownIcon({ className }: IconProps) {
    return (
        <svg viewBox="0 0 24 16" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
                d="M1 14L2.5 4L7.5 9L12 2L16.5 9L21.5 4L23 14H1Z"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
            />
            <path d="M1 14H23" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
    );
}

export function CalendarIcon({ className }: IconProps) {
    return (
        <svg viewBox="0 0 24 24" className={className} xmlns="http://www.w3.org/2000/svg">
            <rect x="2.5" y="4.5" width="19" height="17" rx="2.5" fill="#FFFFFF" stroke="#B91C1C" strokeWidth="1" />
            <path d="M2.5 9H21.5" stroke="#B91C1C" strokeWidth="1" />
            <path d="M2.5 4.5H21.5V8.5H2.5V4.5Z" fill="#E11D2E" />
            <path d="M7.2 2.8V6.2M16.8 2.8V6.2" stroke="#7F1D1D" strokeWidth="1.4" strokeLinecap="round" />
            <text
                x="12"
                y="18"
                textAnchor="middle"
                fontSize="7.5"
                fontWeight="700"
                fontFamily="Arial, sans-serif"
                fill="#B91C1C"
            >
                22
            </text>
        </svg>
    );
}

export function PinIcon({ className }: IconProps) {
    return (
        <svg viewBox="0 0 24 24" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
                d="M12 21S4.5 14.2 4.5 9.5a7.5 7.5 0 1 1 15 0C19.5 14.2 12 21 12 21Z"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
            />
            <circle cx="12" cy="9.5" r="2.5" stroke="currentColor" strokeWidth="1.6" />
        </svg>
    );
}

export function PdfIcon({ className }: IconProps) {
    return (
        <svg viewBox="0 0 24 24" className={className} xmlns="http://www.w3.org/2000/svg">
            <path
                d="M6 1.5H14.5L19.5 6.5V21C19.5 21.8 18.8 22.5 18 22.5H6C5.2 22.5 4.5 21.8 4.5 21V3C4.5 2.2 5.2 1.5 6 1.5Z"
                fill="#FFFFFF"
                stroke="#B91C1C"
                strokeWidth="1"
            />
            <path d="M14.5 1.5V6.5H19.5" fill="none" stroke="#B91C1C" strokeWidth="1" strokeLinejoin="round" />
            <rect x="2.5" y="13" width="16" height="7.5" rx="1.2" fill="#E11D2E" />
            <text
                x="10.5"
                y="18.7"
                textAnchor="middle"
                fontSize="6.2"
                fontWeight="700"
                fontFamily="Arial, sans-serif"
                fill="#FFFFFF"
            >
                PDF
            </text>
        </svg>
    );
}

export function TigerClawIcon({ className }: IconProps) {
    return (
        <svg viewBox="0 0 40 24" className={className} xmlns="http://www.w3.org/2000/svg">
            <g transform="rotate(-8 20 12)">
                <path d="M0 2 C10 -0.5 30 -0.5 40 2 C30 4.5 10 4.5 0 2 Z" fill="currentColor" opacity="0.6" />
                <path d="M0 12 C10 9 30 9 40 12 C30 15 10 15 0 12 Z" fill="currentColor" />
                <path d="M0 22 C10 19.5 30 19.5 40 22 C30 24.5 10 24.5 0 22 Z" fill="currentColor" opacity="0.6" />
            </g>
        </svg>
    );
}
