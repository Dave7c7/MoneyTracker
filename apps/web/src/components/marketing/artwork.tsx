import type { ArtworkVariant } from './data.ts';

const mono = 'ui-monospace, SFMono-Regular, Menlo, monospace';

export function FeatureArtwork({
  variant,
  id,
  className = '',
}: {
  variant: ArtworkVariant;
  id: string;
  className?: string;
}) {
  const glow = `${id}-glow`;
  const surface = `${id}-surface`;
  const haze = `${id}-haze`;
  const blur = `${id}-blur`;

  return (
    <svg
      aria-hidden="true"
      className={`artwork ${className}`}
      viewBox="0 0 800 900"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      focusable="false"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <linearGradient
          id={surface}
          x1="110"
          y1="90"
          x2="700"
          y2="820"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#E8FFD0" />
          <stop offset=".38" stopColor="#C2FB7D" />
          <stop offset=".78" stopColor="#5F876E" />
          <stop offset="1" stopColor="#111A15" />
        </linearGradient>
        <linearGradient
          id={glow}
          x1="130"
          y1="120"
          x2="680"
          y2="790"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#C6FF78" />
          <stop offset=".52" stopColor="#8C7BFF" />
          <stop offset="1" stopColor="#FF9A78" />
        </linearGradient>
        <radialGradient
          id={haze}
          cx="0"
          cy="0"
          r="1"
          gradientTransform="translate(410 390) rotate(90) scale(430)"
        >
          <stop stopColor="#A88BFF" stopOpacity=".18" />
          <stop offset="1" stopColor="#090D0B" stopOpacity="0" />
        </radialGradient>
        <filter id={blur} x="-80%" y="-80%" width="260%" height="260%">
          <feGaussianBlur stdDeviation="32" />
        </filter>
      </defs>
      <rect width="800" height="900" fill="#0B100E" />
      <rect width="800" height="900" fill={`url(#${haze})`} />
      <g stroke="#E8F2EA" strokeOpacity=".045">
        <path d="M0 180H800M0 360H800M0 540H800M0 720H800" />
        <path d="M160 0V900M320 0V900M480 0V900M640 0V900" />
      </g>
      {variant === 'accounts' && <Accounts surface={surface} glow={glow} blur={blur} />}
      {variant === 'categories' && <Categories surface={surface} glow={glow} blur={blur} />}
      {variant === 'cashflow' && <Cashflow surface={surface} glow={glow} blur={blur} />}
      {variant === 'budgets' && <Budgets surface={surface} glow={glow} blur={blur} />}
      {variant === 'overview' && <Overview surface={surface} glow={glow} blur={blur} />}
      {variant === 'review' && <Review surface={surface} glow={glow} blur={blur} />}
      {variant === 'goals' && <Goals surface={surface} glow={glow} blur={blur} />}
      <path d="M42 58H100M42 58V116M758 842H700M758 842V784" stroke="#DDFCB0" strokeOpacity=".28" />
    </svg>
  );
}

type Paint = { surface: string; glow: string; blur: string };

function Accounts({ glow, blur }: Paint) {
  return (
    <g fontFamily={mono}>
      <text x="66" y="94" fill="#8C9B92" fontSize="11" letterSpacing="2">
        ALL ACCOUNTS
      </text>
      <text x="66" y="142" fill="#F2F8F3" fontSize="36" letterSpacing="-1.4">
        $84,920
      </text>
      <rect x="608" y="106" width="126" height="30" rx="15" fill="#C2FB7D" fillOpacity=".12" />
      <text x="671" y="125" textAnchor="middle" fill="#D7FF9D" fontSize="10">
        +8.4% / MO
      </text>

      {(
        [
          ['Checking', '$12,480.12', '2081', 0.34, '#C2FB7D'],
          ['Savings', '$41,220.88', '9014', 0.82, '#9A86FF'],
          ['Travel card', '−$1,842.60', '3007', 0.18, '#FF9A78'],
        ] as const
      ).map(([name, amount, digits, progress, color], index) => (
        <g key={name} transform={`translate(66 ${206 + index * 154})`}>
          <rect
            width="668"
            height="126"
            rx="14"
            fill="#121A16"
            stroke="#EDF7EF"
            strokeOpacity=".09"
          />
          <circle cx="42" cy="42" r="18" fill={color} fillOpacity=".14" />
          <path d="M34 42H50M37 35H47M37 49H47" stroke={color} strokeWidth="1.5" />
          <text x="76" y="36" fill="#EDF6EF" fontSize="15">
            {name}
          </text>
          <text x="76" y="58" fill="#77857C" fontSize="10">
            SoFi · Linked · {digits}
          </text>
          <text x="628" y="48" textAnchor="end" fill="#F2F8F3" fontSize="21">
            {amount}
          </text>
          <rect x="76" y="82" width="552" height="4" rx="2" fill="#EDF7EF" fillOpacity=".07" />
          <rect
            x="76"
            y="82"
            width={Number(progress) * 552}
            height="4"
            rx="2"
            fill={color}
            fillOpacity=".8"
          />
          <circle cx="628" cy="84" r="4" fill={color} />
        </g>
      ))}
      <circle cx="662" cy="164" r="66" fill="#B9FF70" fillOpacity=".09" filter={`url(#${blur})`} />
      <ellipse
        cx="642"
        cy="188"
        rx="120"
        ry="44"
        transform="rotate(-20 642 188)"
        stroke={`url(#${glow})`}
        strokeOpacity=".55"
      />
    </g>
  );
}

function Categories({ surface, glow, blur }: Paint) {
  const segments = [
    { color: '#C2FB7D', dash: '188 214' },
    { color: '#9A86FF', dash: '112 290' },
    { color: '#FF9A78', dash: '76 326' },
    { color: '#6CA8FF', dash: '58 344' },
  ];
  return (
    <g fontFamily={mono}>
      <text x="66" y="94" fill="#8C9B92" fontSize="11" letterSpacing="2">
        CATEGORY REVIEW
      </text>
      <text x="66" y="142" fill="#F2F8F3" fontSize="32" letterSpacing="-1">
        92% explained
      </text>
      <circle cx="282" cy="390" r="174" fill="#C2FB7D" fillOpacity=".04" filter={`url(#${blur})`} />
      {segments.map((segment, index) => (
        <circle
          key={segment.color}
          cx="282"
          cy="390"
          r="128"
          transform="rotate(-90 282 390)"
          stroke={segment.color}
          strokeWidth="34"
          strokeDasharray={segment.dash}
          strokeDashoffset={-index * 14}
          strokeLinecap="round"
          strokeOpacity={index === 0 ? 1 : 0.74}
        />
      ))}
      <circle cx="282" cy="390" r="86" fill="#0D1410" stroke="#EDF7EF" strokeOpacity=".1" />
      <text x="282" y="380" textAnchor="middle" fill="#8C9B92" fontSize="9" letterSpacing="1">
        THIS MONTH
      </text>
      <text x="282" y="414" textAnchor="middle" fill="#F2F8F3" fontSize="30">
        41
      </text>
      <text x="282" y="436" textAnchor="middle" fill="#77857C" fontSize="9">
        transactions
      </text>
      <text x="554" y="242" fill="#8C9B92" fontSize="9" letterSpacing="1.4">
        SOURCE &amp; REASON
      </text>
      {[
        ['Groceries', 'Rule: Whole Foods', '#C2FB7D'],
        ['Transport', 'Merchant match', '#9A86FF'],
        ['Eating out', 'User correction', '#FF9A78'],
        ['Subscriptions', 'Recurring', '#6CA8FF'],
      ].map(([name, reason, color], index) => (
        <g key={name} transform={`translate(518 ${274 + index * 102})`}>
          <rect
            width="216"
            height="80"
            rx="11"
            fill="#121A16"
            stroke="#EDF7EF"
            strokeOpacity=".08"
          />
          <circle cx="24" cy="27" r="6" fill={color} />
          <text x="40" y="31" fill="#EDF6EF" fontSize="12">
            {name}
          </text>
          <text x="24" y="56" fill="#77857C" fontSize="9">
            {reason}
          </text>
        </g>
      ))}
      <path
        d="M410 390C448 390 466 344 504 330"
        stroke={`url(#${glow})`}
        strokeWidth="2"
        strokeDasharray="5 7"
      />
      <circle cx="504" cy="330" r="4" fill="#C2FB7D" />
      <ellipse
        cx="300"
        cy="648"
        rx="204"
        ry="42"
        fill="#9A86FF"
        fillOpacity=".12"
        filter={`url(#${blur})`}
      />
      <path
        d="M130 650H430"
        stroke={`url(#${surface})`}
        strokeWidth="18"
        strokeLinecap="round"
        opacity=".35"
      />
    </g>
  );
}

function Cashflow({ surface, glow, blur }: Paint) {
  return (
    <g fontFamily={mono}>
      <text x="66" y="94" fill="#8C9B92" fontSize="11" letterSpacing="2">
        CASH FLOW / 6 MONTHS
      </text>
      <text x="66" y="142" fill="#F2F8F3" fontSize="34" letterSpacing="-1.4">
        +$4,243.80
      </text>
      <text x="732" y="142" textAnchor="end" fill="#C2FB7D" fontSize="11">
        NET POSITIVE
      </text>
      <rect
        x="66"
        y="196"
        width="668"
        height="440"
        rx="16"
        fill="#101813"
        stroke="#EDF7EF"
        strokeOpacity=".09"
      />
      <g stroke="#EDF7EF" strokeOpacity=".07">
        <path d="M96 270H706M96 360H706M96 450H706M96 540H706" />
      </g>
      <g fill="#748078" fontSize="9" textAnchor="end">
        <text x="696" y="274">
          $6K
        </text>
        <text x="696" y="364">
          $4K
        </text>
        <text x="696" y="454">
          $2K
        </text>
        <text x="696" y="544">
          $0
        </text>
      </g>
      <path
        d="M96 520C140 508 166 458 210 472C256 486 278 402 324 426C368 449 394 476 438 436C482 396 508 330 554 344C600 358 624 300 670 284C688 278 700 270 706 264V548H96V520Z"
        fill={`url(#${surface})`}
        fillOpacity=".12"
      />
      <path
        d="M96 520C140 508 166 458 210 472C256 486 278 402 324 426C368 449 394 476 438 436C482 396 508 330 554 344C600 358 624 300 670 284C688 278 700 270 706 264"
        stroke={`url(#${glow})`}
        strokeWidth="3"
        strokeLinecap="round"
      />
      {[
        [210, 472],
        [324, 426],
        [438, 436],
        [554, 344],
        [670, 284],
      ].map(([cx, cy]) => (
        <g key={cx}>
          <circle cx={cx} cy={cy} r="8" fill="#0B100E" stroke="#C2FB7D" strokeWidth="2" />
          <circle cx={cx} cy={cy} r="2.5" fill="#C2FB7D" />
        </g>
      ))}
      <g transform="translate(96 660)">
        <rect
          width="314"
          height="102"
          rx="13"
          fill="#121A16"
          stroke="#EDF7EF"
          strokeOpacity=".09"
        />
        <text x="22" y="30" fill="#77857C" fontSize="9" letterSpacing="1.2">
          INCOME
        </text>
        <text x="22" y="66" fill="#F2F8F3" fontSize="25">
          $8,420
        </text>
        <rect x="214" y="52" width="76" height="20" rx="10" fill="#C2FB7D" fillOpacity=".1" />
        <text x="252" y="66" textAnchor="middle" fill="#C2FB7D" fontSize="8">
          +3.2%
        </text>
      </g>
      <g transform="translate(432 660)">
        <rect
          width="302"
          height="102"
          rx="13"
          fill="#121A16"
          stroke="#EDF7EF"
          strokeOpacity=".09"
        />
        <text x="22" y="30" fill="#77857C" fontSize="9" letterSpacing="1.2">
          SPENDING
        </text>
        <text x="22" y="66" fill="#F2F8F3" fontSize="25">
          $4,176
        </text>
        <path d="M238 66L252 52L266 60L280 40" stroke="#9A86FF" strokeWidth="2" />
      </g>
      <circle cx="670" cy="284" r="40" fill="#C2FB7D" fillOpacity=".1" filter={`url(#${blur})`} />
    </g>
  );
}

function Budgets({ surface, glow, blur }: Paint) {
  return (
    <g fontFamily={mono}>
      <text x="66" y="94" fill="#8C9B92" fontSize="11" letterSpacing="2">
        BUDGETS / OCTOBER
      </text>
      <text x="66" y="140" fill="#F2F8F3" fontSize="32" letterSpacing="-1">
        $1,284 left
      </text>
      <circle cx="620" cy="334" r="140" fill="#C2FB7D" fillOpacity=".05" filter={`url(#${blur})`} />
      <circle cx="620" cy="334" r="104" stroke="#EDF7EF" strokeOpacity=".08" strokeWidth="22" />
      <circle
        cx="620"
        cy="334"
        r="104"
        transform="rotate(-90 620 334)"
        stroke={`url(#${surface})`}
        strokeWidth="22"
        strokeDasharray="416 654"
        strokeLinecap="round"
      />
      <text x="620" y="326" textAnchor="middle" fill="#8C9B92" fontSize="9" letterSpacing="1.2">
        SAFE TO SPEND
      </text>
      <text x="620" y="360" textAnchor="middle" fill="#F2F8F3" fontSize="30">
        $812
      </text>
      <text x="620" y="382" textAnchor="middle" fill="#C2FB7D" fontSize="9">
        per week
      </text>

      {(
        [
          ['Groceries', '$455', '$500', 0.91, '#C2FB7D'],
          ['Dining', '$210', '$320', 0.66, '#9A86FF'],
          ['Transport', '$118', '$220', 0.54, '#6CA8FF'],
          ['Shopping', '$286', '$300', 0.95, '#FF9A78'],
        ] as const
      ).map(([name, spent, total, progress, color], index) => (
        <g key={name} transform={`translate(66 ${214 + index * 118})`}>
          <text y="0" fill="#EDF6EF" fontSize="14">
            {name}
          </text>
          <text x="420" y="0" textAnchor="end" fill="#829087" fontSize="10">
            {spent} / {total}
          </text>
          <rect y="24" width="420" height="8" rx="4" fill="#EDF7EF" fillOpacity=".07" />
          <rect
            y="24"
            width={Number(progress) * 420}
            height="8"
            rx="4"
            fill={color}
            fillOpacity=".9"
          />
          <circle cx={Number(progress) * 420} cy="28" r="4" fill={color} />
          <text y="58" fill="#748078" fontSize="9">
            {Math.round(Number(progress) * 100)}% used
          </text>
        </g>
      ))}
      <g transform="translate(66 716)">
        <rect width="668" height="90" rx="14" fill="#121A16" stroke="#C2FB7D" strokeOpacity=".18" />
        <text x="24" y="30" fill="#C2FB7D" fontSize="9" letterSpacing="1.2">
          MONTHLY RHYTHM
        </text>
        <text x="24" y="60" fill="#EDF6EF" fontSize="13">
          You are on track in 6 of 8 categories.
        </text>
        <path d="M596 46L612 30L628 46" stroke="#C2FB7D" strokeWidth="2" strokeLinecap="round" />
      </g>
      <ellipse
        cx="620"
        cy="334"
        rx="154"
        ry="58"
        transform="rotate(-24 620 334)"
        stroke={`url(#${glow})`}
        strokeOpacity=".3"
      />
    </g>
  );
}

function Overview({ surface, glow, blur }: Paint) {
  return (
    <g fontFamily={mono}>
      <text x="66" y="94" fill="#8C9B92" fontSize="11" letterSpacing="2">
        OVERVIEW / TODAY
      </text>
      <text x="66" y="142" fill="#F2F8F3" fontSize="34" letterSpacing="-1.4">
        All clear.
      </text>
      <text x="732" y="142" textAnchor="end" fill="#C2FB7D" fontSize="10">
        4 ACCOUNTS SYNCED
      </text>
      <g transform="translate(66 196)">
        <rect
          width="420"
          height="242"
          rx="16"
          fill="#101813"
          stroke="#EDF7EF"
          strokeOpacity=".09"
        />
        <text x="24" y="34" fill="#77857C" fontSize="9" letterSpacing="1.2">
          NET WORTH
        </text>
        <text x="24" y="78" fill="#F2F8F3" fontSize="31">
          $84,920
        </text>
        <path
          d="M24 180C78 174 100 122 154 142C208 162 230 98 284 112C330 124 354 84 396 68"
          stroke={`url(#${glow})`}
          strokeWidth="3"
          strokeLinecap="round"
        />
        <path
          d="M24 180C78 174 100 122 154 142C208 162 230 98 284 112C330 124 354 84 396 68V210H24V180Z"
          fill={`url(#${surface})`}
          fillOpacity=".1"
        />
      </g>
      <g transform="translate(510 196)">
        <rect
          width="224"
          height="112"
          rx="14"
          fill="#121A16"
          stroke="#EDF7EF"
          strokeOpacity=".09"
        />
        <text x="22" y="30" fill="#77857C" fontSize="9">
          SPENT
        </text>
        <text x="22" y="66" fill="#F2F8F3" fontSize="24">
          $4,176
        </text>
        <rect x="22" y="84" width="180" height="5" rx="2.5" fill="#EDF7EF" fillOpacity=".07" />
        <rect x="22" y="84" width="116" height="5" rx="2.5" fill="#C2FB7D" />
      </g>
      <g transform="translate(510 326)">
        <rect
          width="224"
          height="112"
          rx="14"
          fill="#121A16"
          stroke="#EDF7EF"
          strokeOpacity=".09"
        />
        <text x="22" y="30" fill="#77857C" fontSize="9">
          SAVED
        </text>
        <text x="22" y="66" fill="#F2F8F3" fontSize="24">
          $2,840
        </text>
        <circle cx="186" cy="52" r="20" stroke="#9A86FF" strokeOpacity=".28" strokeWidth="5" />
        <circle
          cx="186"
          cy="52"
          r="20"
          transform="rotate(-90 186 52)"
          stroke="#9A86FF"
          strokeWidth="5"
          strokeDasharray="90 126"
          strokeLinecap="round"
        />
      </g>
      <g transform="translate(66 476)">
        <rect
          width="668"
          height="300"
          rx="16"
          fill="#101813"
          stroke="#EDF7EF"
          strokeOpacity=".09"
        />
        <text x="24" y="34" fill="#77857C" fontSize="9" letterSpacing="1.2">
          RECENT ACTIVITY
        </text>
        {[
          ['Whole Foods', 'Groceries', '−$64.20', '#C2FB7D'],
          ['Salary', 'Income', '+$4,210.00', '#9A86FF'],
          ['Metro pass', 'Transport', '−$42.00', '#6CA8FF'],
          ['Figma', 'Software', '−$15.00', '#FF9A78'],
        ].map(([name, category, amount, color], index) => (
          <g key={name} transform={`translate(24 ${62 + index * 55})`}>
            <circle cx="10" cy="10" r="8" fill={color} fillOpacity=".14" />
            <circle cx="10" cy="10" r="3" fill={color} />
            <text x="30" y="14" fill="#EDF6EF" fontSize="11">
              {name}
            </text>
            <text x="150" y="14" fill="#7A887F" fontSize="9">
              {category}
            </text>
            <text x="616" y="14" textAnchor="end" fill={color} fontSize="11">
              {amount}
            </text>
          </g>
        ))}
      </g>
      <circle cx="648" cy="162" r="48" fill="#B9FF70" fillOpacity=".1" filter={`url(#${blur})`} />
    </g>
  );
}

function Review({ surface, glow, blur }: Paint) {
  return (
    <g fontFamily={mono}>
      <text x="66" y="94" fill="#8C9B92" fontSize="11" letterSpacing="2">
        REVIEW INBOX
      </text>
      <text x="66" y="142" fill="#F2F8F3" fontSize="32" letterSpacing="-1">
        3 need a look
      </text>
      <g transform="translate(66 196)">
        <rect
          width="668"
          height="162"
          rx="16"
          fill="#121A16"
          stroke="#C2FB7D"
          strokeOpacity=".26"
        />
        <text x="24" y="32" fill="#C2FB7D" fontSize="9" letterSpacing="1.2">
          NEEDS REVIEW / 01
        </text>
        <text x="24" y="72" fill="#F2F8F3" fontSize="20">
          Corner Market
        </text>
        <text x="24" y="98" fill="#7C8981" fontSize="10">
          $38.42 · Oct 24 · Card 2081
        </text>
        <rect
          x="398"
          y="54"
          width="150"
          height="38"
          rx="8"
          fill="#C2FB7D"
          fillOpacity=".11"
          stroke="#C2FB7D"
          strokeOpacity=".3"
        />
        <text x="473" y="77" textAnchor="middle" fill="#D7FF9D" fontSize="9">
          GROCERIES
        </text>
        <rect x="558" y="54" width="86" height="38" rx="8" fill="#EDF7EF" fillOpacity=".05" />
        <text x="601" y="77" textAnchor="middle" fill="#9AA79F" fontSize="9">
          CHANGE
        </text>
        <text x="24" y="132" fill="#748078" fontSize="9">
          Suggested by: merchant match
        </text>
        <path
          d="M548 136L562 150L586 118"
          stroke={`url(#${surface})`}
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>

      {[
        ['Metro Transit', 'Transport', '$42.00'],
        ['Figma', 'Software', '$15.00'],
      ].map(([name, category, amount], index) => (
        <g key={name} transform={`translate(66 ${392 + index * 118})`}>
          <rect
            width="668"
            height="96"
            rx="14"
            fill="#101713"
            stroke="#EDF7EF"
            strokeOpacity=".08"
          />
          <circle cx="34" cy="34" r="12" fill="#EDF7EF" fillOpacity=".06" />
          <path d="M28 34H40M34 28V40" stroke="#8F9D94" strokeWidth="1.3" />
          <text x="60" y="32" fill="#E7F0E9" fontSize="13">
            {name}
          </text>
          <text x="60" y="54" fill="#728077" fontSize="9">
            {amount} · Suggested: {category}
          </text>
          <rect x="500" y="28" width="136" height="38" rx="8" fill="#EDF7EF" fillOpacity=".06" />
          <text x="568" y="51" textAnchor="middle" fill="#A8B4AC" fontSize="9">
            REVIEW
          </text>
        </g>
      ))}
      <g transform="translate(66 660)">
        <rect
          width="668"
          height="126"
          rx="14"
          fill="#121A16"
          stroke="#EDF7EF"
          strokeOpacity=".08"
        />
        <text x="24" y="32" fill="#77857C" fontSize="9" letterSpacing="1.2">
          WHAT YOU TAUGHT IT
        </text>
        <text x="24" y="64" fill="#EDF6EF" fontSize="13">
          “Corner Market is always groceries.”
        </text>
        <text x="24" y="92" fill="#C2FB7D" fontSize="9">
          Rule saved · 12 transactions updated
        </text>
        <path
          d="M580 76L596 92L620 58"
          stroke="#C2FB7D"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
      <circle cx="688" cy="226" r="52" fill="#B9FF70" fillOpacity=".09" filter={`url(#${blur})`} />
      <ellipse
        cx="446"
        cy="246"
        rx="260"
        ry="54"
        transform="rotate(-8 446 246)"
        stroke={`url(#${glow})`}
        strokeOpacity=".2"
      />
    </g>
  );
}

function Goals({ surface, glow, blur }: Paint) {
  return (
    <g fontFamily={mono}>
      <text x="66" y="94" fill="#8C9B92" fontSize="11" letterSpacing="2">
        SAVINGS GOALS
      </text>
      <text x="66" y="142" fill="#F2F8F3" fontSize="32" letterSpacing="-1">
        74% of the way
      </text>
      <circle
        cx="248"
        cy="404"
        r="168"
        fill="#C2FB7D"
        fillOpacity=".045"
        filter={`url(#${blur})`}
      />
      <circle cx="248" cy="404" r="124" stroke="#EDF7EF" strokeOpacity=".08" strokeWidth="24" />
      <circle
        cx="248"
        cy="404"
        r="124"
        transform="rotate(-90 248 404)"
        stroke={`url(#${surface})`}
        strokeWidth="24"
        strokeDasharray="576 780"
        strokeLinecap="round"
      />
      <text x="248" y="392" textAnchor="middle" fill="#8C9B92" fontSize="9" letterSpacing="1.2">
        EMERGENCY FUND
      </text>
      <text x="248" y="428" textAnchor="middle" fill="#F2F8F3" fontSize="34">
        $14,800
      </text>
      <text x="248" y="452" textAnchor="middle" fill="#C2FB7D" fontSize="9">
        of $20,000
      </text>
      <g transform="translate(510 210)">
        {(
          [
            ['Emergency fund', '$14,800', '$20,000', 0.74, '#C2FB7D'],
            ['Japan 2027', '$3,240', '$6,000', 0.54, '#9A86FF'],
            ['New kitchen', '$8,100', '$18,000', 0.45, '#6CA8FF'],
          ] as const
        ).map(([name, saved, total, progress, color], index) => (
          <g key={name} transform={`translate(0 ${index * 146})`}>
            <rect
              width="224"
              height="120"
              rx="14"
              fill="#121A16"
              stroke="#EDF7EF"
              strokeOpacity=".09"
            />
            <text x="20" y="28" fill="#EDF6EF" fontSize="11">
              {name}
            </text>
            <text x="20" y="55" fill="#F2F8F3" fontSize="17">
              {saved}
            </text>
            <text x="20" y="73" fill="#748078" fontSize="9">
              of {total}
            </text>
            <rect x="20" y="90" width="184" height="5" rx="2.5" fill="#EDF7EF" fillOpacity=".07" />
            <rect x="20" y="90" width={Number(progress) * 184} height="5" rx="2.5" fill={color} />
          </g>
        ))}
      </g>
      <g transform="translate(66 662)">
        <rect
          width="668"
          height="126"
          rx="14"
          fill="#121A16"
          stroke="#EDF7EF"
          strokeOpacity=".09"
        />
        <text x="24" y="32" fill="#77857C" fontSize="9" letterSpacing="1.2">
          PROJECTED ARRIVAL
        </text>
        <text x="24" y="68" fill="#F2F8F3" fontSize="24">
          March 2027
        </text>
        <text x="24" y="94" fill="#C2FB7D" fontSize="9">
          At $520 saved each month
        </text>
        <path
          d="M540 84C566 84 570 50 596 50C622 50 626 28 650 28"
          stroke={`url(#${glow})`}
          strokeWidth="2"
          strokeLinecap="round"
        />
        <circle cx="650" cy="28" r="5" fill="#C2FB7D" />
      </g>
      <ellipse
        cx="248"
        cy="404"
        rx="180"
        ry="64"
        transform="rotate(-22 248 404)"
        stroke={`url(#${glow})`}
        strokeOpacity=".4"
      />
    </g>
  );
}
