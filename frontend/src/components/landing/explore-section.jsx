import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"

import { Comet } from "./comet"
import "./explore-section.css"

// Geometry lives in one place so a comet can be drawn on exactly the same path
// as the branch it flows through. Coordinates are in the 1120x660 viewBox.
const PATH = {
  trunk: "M 232 340 H 900",
  faucet: "M 330 340 C 336 268 382 196 444 196",
  transfer: "M 430 340 C 430 448 468 500 526 500",
  toSystem: "M 795 97 C 726 90 642 106 566 122",
  toYou: "M 596 168 H 708",
  toAnother: "M 694 514 C 744 518 786 556 826 569",
}

// Main services are rounded rectangles; people stay circular.
const NODE = {
  login: { cx: 130, cy: 340, w: 204, h: 128, rx: 26 },
  faucet: { cx: 520, cy: 168, w: 152, h: 92, rx: 22 },
  transfer: { cx: 610, cy: 500, w: 168, h: 92, rx: 22 },
  buy: { cx: 980, cy: 340, w: 160, h: 116, rx: 24 },
  system: { cx: 836, cy: 86, r: 42 },
  you: { cx: 744, cy: 170, r: 36 },
  another: { cx: 866, cy: 582, r: 42 },
}

const CYCLE = 7

function NodeLabel({ cx, cy, lines, size = 20, lineHeight = 24 }) {
  const top = cy - ((lines.length - 1) * lineHeight) / 2

  return (
    <text
      x={cx}
      y={top}
      textAnchor="middle"
      dominantBaseline="middle"
      fontSize={size}
      fontWeight="600"
      fill="#251b03"
    >
      {lines.map((line, index) => (
        <tspan key={line} x={cx} dy={index === 0 ? 0 : lineHeight}>
          {line}
        </tspan>
      ))}
    </text>
  )
}

function MainNode({ node, lines, size }) {
  const x = node.cx - node.w / 2
  const y = node.cy - node.h / 2

  return (
    <g className="explore-node-main">
      <rect
        x={x}
        y={y}
        width={node.w}
        height={node.h}
        rx={node.rx}
        fill="url(#explore-main-fill)"
      />
      <rect
        x={x}
        y={y}
        width={node.w}
        height={node.h}
        rx={node.rx}
        fill="none"
        stroke="rgba(255,247,205,0.55)"
        strokeWidth="1.5"
      />
      <NodeLabel cx={node.cx} cy={node.cy} lines={lines} size={size} />
    </g>
  )
}

function PersonGlyph({ x = 0, y = 0, scale = 1, stroke = "#3a1d05" }) {
  return (
    <g
      transform={`translate(${x} ${y}) scale(${scale})`}
      fill="none"
      stroke={stroke}
      strokeWidth="2.4"
      strokeLinecap="round"
    >
      <circle cx="0" cy="-6.5" r="5.2" />
      <path d="M -10.5 12.5a10.5 10.5 0 0 1 21 0" />
    </g>
  )
}

// The System User mark from the reference art: blocky gear with a person in a
// white plate. Built as a polygon so it stays crisp at any size.
function gearPoints(outer, inner, teeth) {
  const step = (Math.PI * 2) / teeth
  const half = step * 0.23
  const shoulder = step * 0.1
  const points = []

  for (let index = 0; index < teeth; index += 1) {
    const mid = index * step - Math.PI / 2
    points.push(
      [inner, mid - half - shoulder],
      [outer, mid - half],
      [outer, mid + half],
      [inner, mid + half + shoulder],
    )
  }

  return (
    points
      .map(([radius, angle], index) => {
        const x = (radius * Math.cos(angle)).toFixed(1)
        const y = (radius * Math.sin(angle)).toFixed(1)
        return `${index === 0 ? "M" : "L"}${x} ${y}`
      })
      .join(" ") + " Z"
  )
}

const SYSTEM_GEAR = gearPoints(27, 21.5, 8)

function SystemUserMark({ cx, cy }) {
  return (
    <g transform={`translate(${cx} ${cy})`}>
      <path
        d={SYSTEM_GEAR}
        fill="#3a1d05"
        stroke="#3a1d05"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="0" cy="0" r="17" fill="rgba(255,247,240,0.96)" />
      <circle cx="0" cy="-4.6" r="5" fill="#3a1d05" />
      <path d="M -9.6 11.4a9.6 9.6 0 0 1 19.2 0Z" fill="#3a1d05" />
    </g>
  )
}

function ExploreDiagram() {
  return (
    <svg
      viewBox="0 0 1120 660"
      className="block h-auto w-full font-sans"
      role="img"
      aria-labelledby="explore-diagram-title"
    >
      <title id="explore-diagram-title">KoshLedger services map</title>
      <desc>
        Login and SignUp lead into a wallet trunk that branches to Faucet,
        Transfer and Buy Products. Faucet branches to the System User and to
        You. Transfer branches to another KoshLedger user.
      </desc>

      <defs>
        <radialGradient id="explore-main-fill" cx="35%" cy="27%" r="82%">
          <stop offset="0%" stopColor="#fff4b8" />
          <stop offset="45%" stopColor="#facc15" />
          <stop offset="100%" stopColor="#cf9600" />
        </radialGradient>
        <radialGradient id="explore-sub-fill" cx="35%" cy="27%" r="82%">
          <stop offset="0%" stopColor="#ffe3c4" />
          <stop offset="48%" stopColor="#fb923c" />
          <stop offset="100%" stopColor="#c2410c" />
        </radialGradient>
        <linearGradient id="explore-avatar-fill" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="hsl(268 72% 60%)" />
          <stop offset="100%" stopColor="hsl(306 76% 42%)" />
        </linearGradient>
      </defs>

      {/* ---------------------------------------------------------- wires */}
      <g fill="none">
        <path
          d={PATH.trunk}
          className="explore-wire explore-wire--trunk"
          strokeLinecap="round"
        />
        <path d={PATH.faucet} className="explore-wire" strokeLinecap="round" />
        <path d={PATH.transfer} className="explore-wire" strokeLinecap="round" />
        <path d={PATH.toSystem} className="explore-wire explore-wire--dotted" />
        <path d={PATH.toYou} className="explore-wire explore-wire--dotted" />
        <path d={PATH.toAnother} className="explore-wire explore-wire--dotted" />
      </g>

      {/* --------------------------------------------------------- comets */}
      <Comet
        d={PATH.trunk}
        duration={CYCLE}
        animationClass="explore-beam"
        className="explore-beam-group explore-beam-group--main"
      />
      <Comet
        d={PATH.faucet}
        delay={1.3}
        duration={CYCLE}
        animationClass="explore-beam"
        className="explore-beam-group explore-beam-group--main"
      />
      <Comet
        d={PATH.transfer}
        delay={2}
        duration={CYCLE}
        animationClass="explore-beam"
        className="explore-beam-group explore-beam-group--main"
      />
      <Comet
        d={PATH.toSystem}
        delay={2.4}
        duration={CYCLE}
        animationClass="explore-beam"
        className="explore-beam-group explore-beam-group--sub"
      />
      <Comet
        d={PATH.toYou}
        delay={1.3}
        duration={CYCLE}
        animationClass="explore-beam"
        className="explore-beam-group explore-beam-group--sub"
      />
      <Comet
        d={PATH.toAnother}
        delay={2}
        duration={CYCLE}
        animationClass="explore-beam"
        className="explore-beam-group explore-beam-group--sub"
      />

      {/* ---------------------------------------------------------- nodes */}
      <g className="explore-node-main">
        <rect
          x={NODE.login.cx - NODE.login.w / 2 - 6}
          y={NODE.login.cy - NODE.login.h / 2 - 6}
          width={NODE.login.w + 12}
          height={NODE.login.h + 12}
          rx={NODE.login.rx + 6}
          fill="none"
          stroke="rgba(250,204,21,0.5)"
          strokeWidth="1.5"
          className="explore-source-ring"
        />
      </g>

      <MainNode node={NODE.login} lines={["Login /", "SignUp"]} size={20} />
      <MainNode node={NODE.faucet} lines={["Faucet"]} size={20} />
      <MainNode node={NODE.transfer} lines={["Transfer"]} size={19} />
      <MainNode node={NODE.buy} lines={["Buy", "Products"]} size={19} />

      {/* System user: still part of the warm family, but orange and smaller. */}
      <g className="explore-node-sub">
        <circle
          cx={NODE.system.cx}
          cy={NODE.system.cy}
          r={NODE.system.r}
          fill="url(#explore-sub-fill)"
        />
        <SystemUserMark cx={NODE.system.cx} cy={NODE.system.cy} />
      </g>
      <text
        x={NODE.system.cx + NODE.system.r + 12}
        y={NODE.system.cy - 8}
        fontSize="12.5"
        fontWeight="500"
        fill="rgba(214,211,209,0.72)"
      >
        <tspan x={NODE.system.cx + NODE.system.r + 12}>System</tspan>
        <tspan x={NODE.system.cx + NODE.system.r + 12} dy="16">
          User
        </tspan>
      </text>

      {/* You: the profile avatar, ringed in the warm sub-node colour. */}
      <g className="explore-node-sub">
        <circle
          cx={NODE.you.cx}
          cy={NODE.you.cy}
          r={NODE.you.r}
          fill="url(#explore-sub-fill)"
        />
        <circle
          cx={NODE.you.cx}
          cy={NODE.you.cy}
          r={NODE.you.r - 7}
          fill="url(#explore-avatar-fill)"
        />
        <PersonGlyph
          x={NODE.you.cx}
          y={NODE.you.cy - 1}
          scale={1.15}
          stroke="rgba(255,255,255,0.95)"
        />
      </g>
      <text
        x={NODE.you.cx + NODE.you.r + 12}
        y={NODE.you.cy}
        dominantBaseline="middle"
        fontSize="12.5"
        fontWeight="500"
        fill="rgba(214,211,209,0.72)"
      >
        You
      </text>

      {/* Another user, reached through Transfer. */}
      <g className="explore-node-sub">
        <circle
          cx={NODE.another.cx}
          cy={NODE.another.cy}
          r={NODE.another.r}
          fill="url(#explore-sub-fill)"
        />
        <PersonGlyph x={NODE.another.cx} y={NODE.another.cy + 1} scale={1.15} />
      </g>
      <text
        x={NODE.another.cx + NODE.another.r + 12}
        y={NODE.another.cy - 16}
        fontSize="12.5"
        fontWeight="500"
        fill="rgba(214,211,209,0.72)"
      >
        <tspan x={NODE.another.cx + NODE.another.r + 12}>Another</tspan>
        <tspan x={NODE.another.cx + NODE.another.r + 12} dy="16">
          KoshLedger
        </tspan>
        <tspan x={NODE.another.cx + NODE.another.r + 12} dy="16">
          User
        </tspan>
      </text>
    </svg>
  )
}

export function ExploreSection() {
  return (
    <section
      id="explore"
      className="scroll-mt-24 border-t border-border/50 py-14 sm:py-20"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-amber-300/80">
            Explore
          </p>
          <h2 className="mt-2 font-heading text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            Every path runs through your wallet
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground text-pretty sm:text-base">
            One account opens the whole map: top up from the faucet, move money
            to anyone, and spend it on products — every hop recorded in the same
            double-entry ledger.
          </p>
        </div>

        <div className="mt-8 overflow-x-auto rounded-3xl border border-border/60 bg-card/30 p-2 [scrollbar-color:rgba(148,163,184,0.4)_transparent] [scrollbar-width:thin] sm:p-4">
          <div className="relative mx-auto min-w-[680px] max-w-[1120px]">
            <ExploreDiagram />

            <div className="absolute left-[21.5%] top-[54%]">
              <Breadcrumb>
                <BreadcrumbList className="text-xs">
                  <BreadcrumbItem>
                    <BreadcrumbLink
                      render={<span />}
                      className="text-muted-foreground/80"
                    >
                      HomePage
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator className="text-muted-foreground/50" />
                  <BreadcrumbItem>
                    <BreadcrumbPage className="text-amber-200">
                      Services
                    </BreadcrumbPage>
                  </BreadcrumbItem>
                </BreadcrumbList>
              </Breadcrumb>
            </div>
          </div>
        </div>

        <p className="mt-2 text-center text-[11px] text-muted-foreground sm:hidden">
          Swipe the map sideways to follow the wires →
        </p>
      </div>
    </section>
  )
}
