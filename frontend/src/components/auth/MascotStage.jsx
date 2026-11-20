import { useEffect, useRef, useState } from "react"

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function Eyes({ x = 0, y = 0, blink = false, scale = 1 }) {
  const ry = blink ? 0.7 : 6.5

  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} className="mascot__eyes">
      <ellipse cx="-10" cy="0" rx="4.6" ry={ry} fill="#25243A" />
      <ellipse cx="10" cy="0" rx="4.6" ry={ry} fill="#25243A" />
      {!blink && (
        <>
          <circle cx="-11.5" cy="-2.5" r="1.45" fill="white" />
          <circle cx="8.5" cy="-2.5" r="1.45" fill="white" />
        </>
      )}
      <path
        d="M-4 13 Q0 17 4 13"
        fill="none"
        stroke="#25243A"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </g>
  )
}

const shapes = {
  purple: (
    <>
      <rect x="-43" y="-54" width="86" height="108" rx="22" fill="#8871E8" />
      <path
        d="M-25 -54 Q-18 -68 -8 -55 M13 -54 Q24 -69 28 -54"
        stroke="#8871E8"
        strokeWidth="8"
        strokeLinecap="round"
      />
      <ellipse cx="-25" cy="7" rx="7" ry="4" fill="#F2A2B2" opacity=".8" />
      <ellipse cx="25" cy="7" rx="7" ry="4" fill="#F2A2B2" opacity=".8" />
    </>
  ),
  pink: (
    <>
      <rect x="-42" y="-49" width="84" height="98" rx="25" fill="#F28DB7" />
      <path
        d="M-30 -42 Q-47 -66 -29 -66 Q-15 -66 -14 -48 M29 -42 Q47 -66 29 -66 Q15 -66 14 -48"
        fill="#F28DB7"
      />
      <ellipse cx="-24" cy="8" rx="7" ry="4" fill="#D96F9C" opacity=".5" />
      <ellipse cx="24" cy="8" rx="7" ry="4" fill="#D96F9C" opacity=".5" />
    </>
  ),
  yellow: (
    <>
      <rect x="-39" y="-47" width="78" height="94" rx="25" fill="#F6C94F" />
      <path
        d="M-20 -47 Q-15 -61 -5 -49 M15 -47 Q25 -61 30 -47"
        stroke="#F6C94F"
        strokeWidth="8"
        strokeLinecap="round"
      />
      <ellipse cx="-22" cy="8" rx="6" ry="3.5" fill="#EAA65B" />
      <ellipse cx="22" cy="8" rx="6" ry="3.5" fill="#EAA65B" />
    </>
  ),
  orange: (
    <>
      <path
        d="M-47 36 Q-49 -48 0 -48 Q49 -48 47 36 Q0 54 -47 36Z"
        fill="#F19A55"
      />
      <path
        d="M-28 -43 Q-24 -60 -12 -47 M18 -47 Q32 -61 35 -42"
        stroke="#F19A55"
        strokeWidth="8"
        strokeLinecap="round"
      />
      <ellipse cx="-27" cy="15" rx="7" ry="4" fill="#D9784B" opacity=".55" />
      <ellipse cx="27" cy="15" rx="7" ry="4" fill="#D9784B" opacity=".55" />
    </>
  ),
}

function Character({ type, x, y, eyeX, eyeY, blink, eager, delay }) {
  return (
    <g
      transform={`translate(${x} ${y})`}
      className={`mascot mascot--${type}`}
      style={{ animationDelay: `${delay}s` }}
    >
      <ellipse cx="0" cy="54" rx="35" ry="7" fill="#40345D" opacity=".16" />
      {shapes[type]}
      <Eyes
        x={eyeX}
        y={eyeY}
        blink={blink}
        scale={eager ? 1.12 : 1}
      />
    </g>
  )
}

/**
 * Purely decorative animated characters.
 *
 * - Eyes follow the pointer around the page.
 * - Random blinking keeps them feeling alive.
 * - While the password field is focused (and hidden), they lean in.
 * - When the password is revealed, they look away.
 *
 * `focusedField`, `passwordVisible` and `passwordLength` are the only
 * inputs. No API/auth logic lives in this component.
 */
export function MascotStage({
  focusedField = "",
  passwordVisible = false,
  passwordLength = 0,
}) {
  const stageRef = useRef(null)
  const [gaze, setGaze] = useState({ x: 0, y: 0 })
  const [blink, setBlink] = useState(false)

  const passwordFocused = focusedField === "password"
  // Once the password is revealed the characters stay turned away, even if
  // focus moves to another field. While it is hidden they lean toward it.
  const lookAway = passwordVisible
  const eager = passwordFocused && !passwordVisible

  // Track the pointer across the whole viewport, not only the illustration,
  // so the characters notice the cursor while the user is filling the form.
  useEffect(() => {
    let frame = 0
    let latest = { x: 0, y: 0 }

    function handleMove(event) {
      latest = {
        x: clamp((event.clientX / window.innerWidth - 0.5) * 2, -1, 1),
        y: clamp((event.clientY / window.innerHeight - 0.5) * 2, -1, 1),
      }
      if (frame) return
      frame = window.requestAnimationFrame(() => {
        frame = 0
        setGaze(latest)
      })
    }

    window.addEventListener("pointermove", handleMove, { passive: true })
    return () => {
      window.removeEventListener("pointermove", handleMove)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [])

  // Natural, irregular blinking. Skipped for reduced-motion users.
  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) {
      return
    }

    let cancelled = false
    let blinkTimer
    let closeTimer

    function schedule() {
      blinkTimer = window.setTimeout(
        () => {
          if (cancelled) return
          setBlink(true)
          closeTimer = window.setTimeout(() => {
            if (cancelled) return
            setBlink(false)
            schedule()
          }, 150)
        },
        2200 + Math.random() * 2800,
      )
    }

    schedule()
    return () => {
      cancelled = true
      window.clearTimeout(blinkTimer)
      window.clearTimeout(closeTimer)
    }
  }, [])

  // Gaze target priority: look away > eager look at the form > follow pointer.
  const gazeX = lookAway ? -1 : eager ? 0.95 : gaze.x
  const gazeY = lookAway ? -0.55 : eager ? 0.4 : gaze.y
  const eyeX = gazeX * 4.2
  const eyeY = gazeY * 3

  const caption = lookAway
    ? "We saw nothing! 🙈"
    : eager && passwordLength > 0
      ? "Ooh, a secret. 🤫"
      : eager
        ? "Take your time."
        : "Nice to see you!"

  return (
    <div
      ref={stageRef}
      className={`mascot-stage${lookAway ? " mascot-stage--shy" : ""}${
        eager ? " mascot-stage--eager" : ""
      }`}
      aria-hidden="true"
    >
      <div className="mascot-stage__spark spark-one">✦</div>
      <div className="mascot-stage__spark spark-two">✧</div>
      <div className="mascot-stage__spark spark-three">·</div>

      <svg className="mascot-stage__art" viewBox="0 0 440 310" role="presentation">
        <defs>
          <filter id="mascotShadow" x="-30%" y="-30%" width="160%" height="170%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="5" />
            <feOffset dy="7" />
            <feComponentTransfer>
              <feFuncA type="linear" slope=".18" />
            </feComponentTransfer>
            <feMerge>
              <feMergeNode />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <g filter="url(#mascotShadow)">
          <Character
            type="purple"
            x={108}
            y={135}
            eyeX={eyeX}
            eyeY={eyeY}
            blink={blink}
            eager={eager}
            delay={0}
          />
          <Character
            type="pink"
            x={218}
            y={119}
            eyeX={eyeX}
            eyeY={eyeY}
            blink={blink}
            eager={eager}
            delay={0.25}
          />
          <Character
            type="yellow"
            x={326}
            y={151}
            eyeX={eyeX}
            eyeY={eyeY}
            blink={blink}
            eager={eager}
            delay={0.5}
          />
          <Character
            type="orange"
            x={216}
            y={236}
            eyeX={eyeX}
            eyeY={eyeY}
            blink={blink}
            eager={eager}
            delay={0.75}
          />
        </g>
      </svg>

      <div className="mascot-stage__caption">{caption}</div>
    </div>
  )
}
