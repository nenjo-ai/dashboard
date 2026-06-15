import { ImageResponse } from 'next/og'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Shared social-card renderer used by both /opengraph-image and /twitter-image.
// Text-forward card in the site's serif + mono system so it always reflects the
// current hero copy (no more hand-exported PNG drifting from the live wording).

export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'Nenjo — The private, collaborative agentic workspace'

// Read from cwd rather than via `new URL(..., import.meta.url)` — Turbopack does
// not resolve those asset references at runtime. next.config's
// outputFileTracingIncludes ensures these .ttf files ship with the route.
const cormorantSemibold = readFileSync(join(process.cwd(), 'app/_og/CormorantGaramond-SemiBold.ttf'))
const cormorantMedium = readFileSync(join(process.cwd(), 'app/_og/CormorantGaramond-Medium.ttf'))
const dmMono = readFileSync(join(process.cwd(), 'app/_og/DMMono-Medium.ttf'))

const ACCENT = '#b8841a'
const ACCENT_DEEP = '#765414'
const INK = '#151722'
const INK_DIM = '#5b6270'

function Dot() {
  return (
    <div style={{ width: 5, height: 5, borderRadius: 999, background: ACCENT, display: 'flex' }} />
  )
}

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '70px 80px',
          background: 'linear-gradient(150deg, #fffaf0 0%, #f8f5ee 46%, #f1e8d8 100%)',
          fontFamily: 'DM Mono',
          color: INK,
        }}
      >
        {/* brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 20, height: 20, borderRadius: 5, background: ACCENT, display: 'flex' }} />
          <div
            style={{
              display: 'flex',
              fontSize: 24,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: INK,
            }}
          >
            Nenjo
          </div>
        </div>

        {/* core */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', gap: 10, marginBottom: 30 }}>
            {['Zero-trust', 'Collaborative', 'Open source'].map((c) => (
              <div
                key={c}
                style={{
                  display: 'flex',
                  border: '1px solid rgba(31,35,48,0.22)',
                  borderRadius: 999,
                  padding: '8px 16px',
                  fontSize: 16,
                  letterSpacing: '0.10em',
                  textTransform: 'uppercase',
                  color: ACCENT_DEEP,
                }}
              >
                {c}
              </div>
            ))}
          </div>

          <div
            style={{
              display: 'flex',
              fontFamily: 'Cormorant Garamond',
              fontWeight: 600,
              fontSize: 88,
              lineHeight: 1.02,
              letterSpacing: '-0.005em',
              color: INK,
              maxWidth: 1000,
            }}
          >
            The private, collaborative agentic workspace.
          </div>

          <div
            style={{
              display: 'flex',
              marginTop: 26,
              fontFamily: 'Cormorant Garamond',
              fontWeight: 500,
              fontSize: 32,
              lineHeight: 1.35,
              color: INK_DIM,
              maxWidth: 860,
            }}
          >
            Build and run teams of agents on a fully managed platform — encrypted
            client-side, so not even Nenjo can read it.
          </div>
        </div>

        {/* footer labels */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            fontSize: 16,
            letterSpacing: '0.10em',
            textTransform: 'uppercase',
            color: INK_DIM,
          }}
        >
          <div style={{ display: 'flex' }}>Managed dashboard</div>
          <Dot />
          <div style={{ display: 'flex' }}>Encrypted client-side</div>
          <Dot />
          <div style={{ display: 'flex' }}>Runs on your workers</div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: 'Cormorant Garamond', data: cormorantSemibold, weight: 600, style: 'normal' },
        { name: 'Cormorant Garamond', data: cormorantMedium, weight: 500, style: 'normal' },
        { name: 'DM Mono', data: dmMono, weight: 500, style: 'normal' },
      ],
    },
  )
}
