"use client";

/**
 * Hardcoded icon for the "system" agent role.
 * Uses the DiceBear rings SVG from system-icon.svg with Nenjo amber (#b8841a).
 */

interface SystemRoleIconProps {
  size?: number;
  className?: string;
  animate?: boolean;
}

const SYSTEM_ROLE_COLOR = "#b8841a";

// Static SVG paths (the ring geometry from system-icon.svg, recolored)
function StaticSvg({ size }: { size: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      fill="none"
      shapeRendering="crispEdges"
      width={size}
      height={size}
      style={{ borderRadius: "50%" }}
    >
      <g>
        <g transform="translate(0, 0) rotate(179 50 50)">
          <g transform="translate(0, 0) rotate(167 50 50)">
            <path d="M50 10V0C22.386 0 0 22.386 0 50h10c0-22.091 17.909-40 40-40Z" fill="currentColor" />
          </g>
          <g transform="translate(0, 0) rotate(-27 50 50)">
            <path d="M50 10c-22.091 0-40 17.909-40 40h10c0-16.569 13.431-30 30-30V10Z" fill="currentColor" />
          </g>
          <g transform="translate(0, 0) rotate(48 50 50)">
            <path d="M50 20c-16.569 0-30 13.431-30 30h10c0-11.046 8.954-20 20-20V20Z" fill="currentColor" />
          </g>
          <g transform="translate(0, 0) rotate(-180 50 50)">
            <path d="M50 30c-11.046 0-20 8.954-20 20h10c0-5.523 4.477-10 10-10V30Z" fill="currentColor" />
          </g>
          <g transform="translate(0, 0) rotate(119 50 50)">
            <circle cx="50" cy="50" r="10" fill="currentColor" />
          </g>
          <g transform="matrix(1 0 0 -1 0 100)">
            <g transform="translate(0, 0) rotate(167 50 50)">
              <path d="M50 10V0C22.386 0 0 22.386 0 50h10c0-22.091 17.909-40 40-40Z" fill="currentColor" />
            </g>
          </g>
          <g transform="matrix(1 0 0 -1 0 100)">
            <g transform="translate(0, 0) rotate(-27 50 50)">
              <path d="M50 10c-22.091 0-40 17.909-40 40h10c0-16.569 13.431-30 30-30V10Z" fill="currentColor" />
            </g>
          </g>
          <g transform="matrix(1 0 0 -1 0 100)">
            <g transform="translate(0, 0) rotate(48 50 50)">
              <path d="M50 20c-16.569 0-30 13.431-30 30h10c0-11.046 8.954-20 20-20V20Z" fill="currentColor" />
            </g>
          </g>
          <g transform="matrix(1 0 0 -1 0 100)">
            <g transform="translate(0, 0) rotate(-180 50 50)">
              <path d="M50 30c-11.046 0-20 8.954-20 20h10c0-5.523 4.477-10 10-10V30Z" fill="currentColor" />
            </g>
          </g>
          <g transform="matrix(1 0 0 -1 0 100)">
            <g transform="translate(0, 0) rotate(119 50 50)">
              <circle cx="50" cy="50" r="10" fill="currentColor" />
            </g>
          </g>
          <circle cx="50" cy="50" r="45" stroke="#fff" strokeOpacity=".25" strokeWidth="10" style={{ mixBlendMode: "lighten" }} />
          <circle cx="50" cy="50" r="25" stroke="#fff" strokeOpacity=".25" strokeWidth="10" style={{ mixBlendMode: "lighten" }} />
          <circle cx="50" cy="50" r="10" fill="#fff" fillOpacity=".25" style={{ mixBlendMode: "lighten" }} />
        </g>
      </g>
    </svg>
  );
}

// Animated version — outer 3 ring pairs spin CW/CCW/CW
const RING_DURATIONS = [3, 2.4, 1.8];

function AnimatedSvg({ size }: { size: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 100 100"
      fill="none"
      shapeRendering="crispEdges"
      width={size}
      height={size}
      style={{ borderRadius: "50%", overflow: "hidden" }}
    >
      <g>
        <g transform="translate(0, 0) rotate(179 50 50)">
          {/* Ring 1 (outermost) — CW */}
          <g transform="translate(0, 0) rotate(167 50 50)">
            <path d="M50 10V0C22.386 0 0 22.386 0 50h10c0-22.091 17.909-40 40-40Z" fill="currentColor" />
            <animateTransform attributeName="transform" type="rotate" from="0 50 50" to="360 50 50" dur={`${RING_DURATIONS[0]}s`} repeatCount="indefinite" additive="sum" />
          </g>
          {/* Ring 2 — CCW */}
          <g transform="translate(0, 0) rotate(-27 50 50)">
            <path d="M50 10c-22.091 0-40 17.909-40 40h10c0-16.569 13.431-30 30-30V10Z" fill="currentColor" />
            <animateTransform attributeName="transform" type="rotate" from="0 50 50" to="-360 50 50" dur={`${RING_DURATIONS[1]}s`} repeatCount="indefinite" additive="sum" />
          </g>
          {/* Ring 3 — CW */}
          <g transform="translate(0, 0) rotate(48 50 50)">
            <path d="M50 20c-16.569 0-30 13.431-30 30h10c0-11.046 8.954-20 20-20V20Z" fill="currentColor" />
            <animateTransform attributeName="transform" type="rotate" from="0 50 50" to="360 50 50" dur={`${RING_DURATIONS[2]}s`} repeatCount="indefinite" additive="sum" />
          </g>
          {/* Ring 4 (inner) — static */}
          <g transform="translate(0, 0) rotate(-180 50 50)">
            <path d="M50 30c-11.046 0-20 8.954-20 20h10c0-5.523 4.477-10 10-10V30Z" fill="currentColor" />
          </g>
          {/* Center dot — static */}
          <g transform="translate(0, 0) rotate(119 50 50)">
            <circle cx="50" cy="50" r="10" fill="currentColor" />
          </g>

          {/* Bottom-half mirrors (Y-flipped) — reverse spin direction */}
          <g transform="matrix(1 0 0 -1 0 100)">
            <g transform="translate(0, 0) rotate(167 50 50)">
              <path d="M50 10V0C22.386 0 0 22.386 0 50h10c0-22.091 17.909-40 40-40Z" fill="currentColor" />
              <animateTransform attributeName="transform" type="rotate" from="0 50 50" to="-360 50 50" dur={`${RING_DURATIONS[0]}s`} repeatCount="indefinite" additive="sum" />
            </g>
          </g>
          <g transform="matrix(1 0 0 -1 0 100)">
            <g transform="translate(0, 0) rotate(-27 50 50)">
              <path d="M50 10c-22.091 0-40 17.909-40 40h10c0-16.569 13.431-30 30-30V10Z" fill="currentColor" />
              <animateTransform attributeName="transform" type="rotate" from="0 50 50" to="360 50 50" dur={`${RING_DURATIONS[1]}s`} repeatCount="indefinite" additive="sum" />
            </g>
          </g>
          <g transform="matrix(1 0 0 -1 0 100)">
            <g transform="translate(0, 0) rotate(48 50 50)">
              <path d="M50 20c-16.569 0-30 13.431-30 30h10c0-11.046 8.954-20 20-20V20Z" fill="currentColor" />
              <animateTransform attributeName="transform" type="rotate" from="0 50 50" to="-360 50 50" dur={`${RING_DURATIONS[2]}s`} repeatCount="indefinite" additive="sum" />
            </g>
          </g>
          <g transform="matrix(1 0 0 -1 0 100)">
            <g transform="translate(0, 0) rotate(-180 50 50)">
              <path d="M50 30c-11.046 0-20 8.954-20 20h10c0-5.523 4.477-10 10-10V30Z" fill="currentColor" />
            </g>
          </g>
          <g transform="matrix(1 0 0 -1 0 100)">
            <g transform="translate(0, 0) rotate(119 50 50)">
              <circle cx="50" cy="50" r="10" fill="currentColor" />
            </g>
          </g>

          {/* Overlay rings */}
          <circle cx="50" cy="50" r="45" stroke="#fff" strokeOpacity=".25" strokeWidth="10" style={{ mixBlendMode: "lighten" }} />
          <circle cx="50" cy="50" r="25" stroke="#fff" strokeOpacity=".25" strokeWidth="10" style={{ mixBlendMode: "lighten" }} />
          <circle cx="50" cy="50" r="10" fill="#fff" fillOpacity=".25" style={{ mixBlendMode: "lighten" }} />
        </g>
      </g>
    </svg>
  );
}

export function SystemRoleIcon({ size = 32, className, animate = false }: SystemRoleIconProps) {
  return (
    <div className={className} style={{ width: size, height: size, flexShrink: 0, color: SYSTEM_ROLE_COLOR }}>
      {animate ? <AnimatedSvg size={size} /> : <StaticSvg size={size} />}
    </div>
  );
}
