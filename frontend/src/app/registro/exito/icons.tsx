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
        <svg viewBox="0 0 24 24" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.6" />
            <path d="M3 9.5H21" stroke="currentColor" strokeWidth="1.6" />
            <path d="M7.5 3V6.5M16.5 3V6.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
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
        <svg viewBox="0 0 24 24" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
                d="M6 2.5H14.5L19 7V19.5C19 20.6 18.1 21.5 17 21.5H7C5.9 21.5 5 20.6 5 19.5V4.5C5 3.4 5.9 2.5 6 2.5Z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinejoin="round"
            />
            <path d="M14.5 2.5V7H19" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
    );
}

export function InstagramIcon({ className }: IconProps) {
    return (
        <svg viewBox="0 0 24 24" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth="1.6" />
            <circle cx="12" cy="12" r="4.2" stroke="currentColor" strokeWidth="1.6" />
            <circle cx="17.2" cy="6.8" r="1.1" fill="currentColor" />
        </svg>
    );
}

export function WhatsappIcon({ className }: IconProps) {
    return (
        <svg viewBox="0 0 24 24" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
                d="M12 3a9 9 0 0 0-7.7 13.6L3 21l4.5-1.3A9 9 0 1 0 12 3Z"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
            />
            <path
                d="M8.5 8.7c.2-.6.6-.6 1-.6h.4c.2 0 .4.1.5.4l.6 1.5c.1.2 0 .4-.1.5l-.5.6c-.1.2-.1.3 0 .5.4.7 1.5 1.9 2.8 2.4.2.1.3 0 .5-.1l.6-.6c.2-.2.4-.2.6-.1l1.4.7c.2.1.4.3.4.5v.5c0 .7-.7 1.3-1.4 1.2-2.9-.3-5.7-2.9-6.5-5.6-.2-.7 0-1.4.1-1.8Z"
                fill="currentColor"
            />
        </svg>
    );
}

export function FacebookIcon({ className }: IconProps) {
    return (
        <svg viewBox="0 0 24 24" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
            <path
                d="M13.5 21V13h2.2l.3-2.6h-2.5V8.8c0-.8.2-1.3 1.3-1.3h1.3V5.2c-.2 0-1-.1-1.9-.1-1.9 0-3.2 1.1-3.2 3.2v1.9H9v2.6h1.9V21"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
            />
        </svg>
    );
}

export function ShareIcon({ className }: IconProps) {
    return (
        <svg viewBox="0 0 24 24" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="18" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.6" />
            <circle cx="6" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.6" />
            <circle cx="18" cy="19" r="2.5" stroke="currentColor" strokeWidth="1.6" />
            <path d="M8.2 10.7 15.8 6.3M8.2 13.3l7.6 4.4" stroke="currentColor" strokeWidth="1.6" />
        </svg>
    );
}
