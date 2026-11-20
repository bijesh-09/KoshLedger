import { useLayoutEffect, useRef, useState } from "react"

import "./comet.css"

// A "comet" is one bright head plus six progressively longer, dimmer dashes.
// Every segment runs the same keyframes but starts a little later, and the
// delay is exactly the arc length between the head's rear edge and the far end
// of that segment. The result is a dense head followed by a long tail that
// thins out towards the back.
//
// Lengths are percentages of the path, but the dash values themselves are in
// user units measured from the rendered path. `pathLength="100"` would be
// tidier, but Firefox scales the dash pattern by it while leaving
// stroke-dashoffset unscaled, which tears the comet into disconnected pieces.
const HEAD = { key: "head", length: 2.2, alpha: 1 }
const TAILS = [
  { key: "tail-1", length: 2.6, alpha: 0.82 },
  { key: "tail-2", length: 3.2, alpha: 0.66 },
  { key: "tail-3", length: 4, alpha: 0.52 },
  { key: "tail-4", length: 5, alpha: 0.4 },
  { key: "tail-5", length: 6.2, alpha: 0.29 },
  { key: "tail-6", length: 7.8, alpha: 0.2 },
].reduce((acc, segment) => {
  const previous = acc.length ? acc[acc.length - 1].offset : 0
  acc.push({ ...segment, offset: previous + segment.length })
  return acc
}, [])

function Segment({ d, segment, animationClass, delay, duration, total }) {
  const dash = (total * segment.length) / 100

  return (
    <path
      d={d}
      strokeDasharray={`${dash}px ${total - dash}px`}
      className={`comet comet--${segment.key} ${animationClass}`}
      style={{
        opacity: total ? segment.alpha : 0,
        animationDelay: `${delay}s`,
        animationDuration: `${duration}s`,
      }}
    />
  )
}

export function Comet({
  d,
  duration,
  delay = 0,
  animationClass,
  className = "",
}) {
  const headRef = useRef(null)
  const [total, setTotal] = useState(0)

  // Path length is geometry, not layout, so it is the same at every viewport
  // size. Measure once per `d` and render the dashes in those user units.
  useLayoutEffect(() => {
    if (headRef.current) setTotal(headRef.current.getTotalLength())
  }, [d])

  return (
    <g className={className} style={{ "--comet-total": `${total}px` }}>
      <path
        ref={headRef}
        d={d}
        strokeDasharray={`${(total * HEAD.length) / 100}px ${total - (total * HEAD.length) / 100}px`}
        className={`comet comet--head ${animationClass}`}
        style={{
          opacity: total ? HEAD.alpha : 0,
          animationDelay: `${delay}s`,
          animationDuration: `${duration}s`,
        }}
      />

      {TAILS.map((segment) => (
        // Each tail ends where the previous one began, so the comet is one
        // continuous streak: the head, then the six tail segments behind it.
        <Segment
          key={segment.key}
          d={d}
          segment={segment}
          animationClass={animationClass}
          delay={delay + (segment.offset * duration) / 100}
          duration={duration}
          total={total}
        />
      ))}
    </g>
  )
}
