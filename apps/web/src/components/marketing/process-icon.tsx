export function ProcessIcon({ type }: { type: 'connect' | 'understand' | 'correct' | 'plan' }) {
  return (
    <div className={`process-icon process-icon--${type}`} aria-hidden="true">
      <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
        {type === 'connect' && (
          <>
            <circle cx="23" cy="27" r="10" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="57" cy="23" r="7" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="48" cy="58" r="11" stroke="currentColor" strokeWidth="1.5" />
            <path
              d="M32 29L50 25M28 36L43 51M56 30L51 47"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <circle cx="23" cy="27" r="3" fill="currentColor" />
            <circle cx="48" cy="58" r="3" fill="currentColor" />
          </>
        )}
        {type === 'understand' && (
          <>
            <path d="M13 62H67M13 62V18" stroke="currentColor" strokeWidth="1.5" />
            <path
              d="M20 53L32 40L42 47L52 28L64 21"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M20 53L32 40L42 47L52 28L64 21V62H20V53Z"
              fill="currentColor"
              fillOpacity=".06"
            />
            <circle cx="52" cy="28" r="4" fill="currentColor" />
          </>
        )}
        {type === 'correct' && (
          <>
            <path
              d="M20 24H60M20 40H60M20 56H60"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <circle cx="34" cy="24" r="7" fill="#101614" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="50" cy="40" r="7" fill="#101614" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="30" cy="56" r="7" fill="#101614" stroke="currentColor" strokeWidth="1.5" />
            <path
              d="M48 40L53 45L60 34"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </>
        )}
        {type === 'plan' && (
          <>
            <circle cx="40" cy="40" r="27" stroke="currentColor" strokeWidth="1.5" />
            <circle
              cx="40"
              cy="40"
              r="18"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeDasharray="3 6"
            />
            <circle
              cx="40"
              cy="40"
              r="8"
              fill="currentColor"
              fillOpacity=".18"
              stroke="currentColor"
            />
            <path d="M40 40L58 22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <circle cx="58" cy="22" r="4" fill="currentColor" />
          </>
        )}
      </svg>
    </div>
  );
}
