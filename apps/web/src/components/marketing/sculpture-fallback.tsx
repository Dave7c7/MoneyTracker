export function SculptureFallback() {
  return (
    <div className="sculpture-fallback" data-sculpture-fallback aria-hidden="true">
      <svg viewBox="0 0 800 800" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient
            id="fallback-form"
            x1="250"
            y1="180"
            x2="580"
            y2="650"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#EEFFD7" />
            <stop offset=".3" stopColor="#B9FA72" />
            <stop offset=".68" stopColor="#7769A8" />
            <stop offset="1" stopColor="#161920" />
          </linearGradient>
          <linearGradient
            id="fallback-ring"
            x1="140"
            y1="180"
            x2="650"
            y2="610"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#C8FF86" />
            <stop offset=".5" stopColor="#A18AFF" />
            <stop offset="1" stopColor="#C8FF86" stopOpacity=".1" />
          </linearGradient>
          <radialGradient id="fallback-haze">
            <stop stopColor="#A28AFF" stopOpacity=".22" />
            <stop offset="1" stopColor="#A28AFF" stopOpacity="0" />
          </radialGradient>
          <filter id="fallback-blur" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="34" />
          </filter>
        </defs>
        <circle cx="420" cy="400" r="330" fill="url(#fallback-haze)" />
        <g className="sculpture-fallback__form">
          <path
            d="M421 183C514 177 601 272 577 361C555 442 423 437 387 515C353 589 439 644 511 583C563 539 537 478 486 475C421 471 388 552 319 557C231 564 176 460 225 383C271 310 365 345 392 280C409 239 380 185 421 183Z"
            stroke="url(#fallback-form)"
            strokeWidth="74"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M421 183C514 177 601 272 577 361C555 442 423 437 387 515C353 589 439 644 511 583"
            stroke="#F1FFE2"
            strokeOpacity=".44"
            strokeWidth="4"
            strokeLinecap="round"
          />
          <ellipse
            cx="404"
            cy="408"
            rx="284"
            ry="108"
            transform="rotate(-28 404 408)"
            stroke="url(#fallback-ring)"
            strokeWidth="3"
          />
          <ellipse
            cx="404"
            cy="408"
            rx="244"
            ry="326"
            transform="rotate(38 404 408)"
            stroke="#C6FF80"
            strokeOpacity=".22"
          />
          <circle
            cx="628"
            cy="244"
            r="30"
            fill="#C4FF7E"
            fillOpacity=".35"
            filter="url(#fallback-blur)"
          />
          <circle cx="628" cy="244" r="6" fill="#D8FFAB" />
        </g>
      </svg>
    </div>
  );
}
