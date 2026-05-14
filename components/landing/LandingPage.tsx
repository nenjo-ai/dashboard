// @ts-nocheck
"use client";

/* eslint-disable react/no-unescaped-entities, @next/next/no-html-link-for-pages, @next/next/no-img-element */
import { useEffect, useRef, useState } from "react";
import { BookOpen, Github } from "lucide-react";

const LANDING_LOGO_WHITE = "/landing/logo-white.png";
const LANDING_LOGO = "/landing/logo.png";


const TWEAK_DEFAULTS = {
  "palette": "amber",
  "accent": "amber",
  "tagline": "a"
};

// ── SECTIONS DATA ──
const SECTIONS = [
  {
    id: 'intro',
    kicker: 'AGENTIC WORKFLOWS · BETA',
    headline: <>Define your AI workforce once.<br/><em>Run it everywhere.</em></>,
    body: 'Nenjo removes the complexity of building agentic workflows — launch production-ready agents in hours, not months. Reusable across every app, team, and environment. No lock-in. Full control.',
    detail: null, tags: null, highlight: null,
    transform3d: 'rotateX(0deg) rotateY(0deg) scale(1)',
  },
  {
    id: 'control',
    kicker: '01 · CONTROL PLANE',
    headline: <><em>Manifests, routing,</em><br/>and live policy.</>,
    body: 'The control plane manages agent manifests, routes requests, enforces access control, and coordinates hot-swaps — all without stopping the fabric.',
    detail: '→  MANIFESTS · ROUTER · ACCESS CONTROL · OBSERVABILITY',
    tags: ['Agent manifests', 'Hot-swap', 'Routing', 'Access control'],
    highlight: new Set(['ctrl']),
    transform3d: 'rotateX(14deg) rotateY(0deg) scale(0.95)',
  },
  {
    id: 'workers',
    kicker: '02 · WORKERS',
    headline: <>Chat & task agents,<br/><em>always on.</em></>,
    body: 'Worker agents handle tasks end-to-end — customer messages, chat, long-running jobs. Hot-swappable while live, never dropping work.',
    detail: '→  Hosted in your environment · ROI in weeks, not months',
    tags: ['Ops automation', 'Chat & tasks', 'ROI in weeks'],
    highlight: new Set(['sL2', 'sR3']),
    transform3d: 'rotateX(6deg) rotateY(-26deg) scale(0.92)',
  },
  {
    id: 'services',
    kicker: '03 · TOOL SERVICES',
    headline: <>Secure tool access,<br/><em>outside the harness.</em></>,
    body: 'Services sit outside the agent harness — a security boundary between your agents and external systems. Controlled, auditable access to CRMs, APIs, and data.',
    detail: '→  Not agents — a security boundary layer',
    tags: ['CRM access', 'API calls', 'Data reads'],
    highlight: new Set(['sL1', 'sL3', 'sR2', 'sR4']),
    transform3d: 'rotateX(6deg) rotateY(22deg) scale(0.92)',
  },
  {
    id: 'apps',
    kicker: '04 · CUSTOM APPS',
    headline: <>Your product logic,<br/><em>on the platform.</em></>,
    body: 'Custom apps are built by your team on Nenjo — compliance agents, multi-agent pipelines, developer assistants. Nenjo handles orchestration, state, and live hot-swap.',
    detail: '→  Requires dev + hosting skill · Nenjo handles orchestration',
    tags: ['Onboarding flows', 'Client portals', 'Automation'],
    highlight: new Set(['sL4', 'sR1']),
    transform3d: 'rotateX(-6deg) rotateY(16deg) scale(0.94)',
  },
];

// ── HERO GRAPH ──
const HeroGraph = ({ highlightIds }) => {
  const CTRL={x:50,y:50};
  const S_L1={x:18,y:78},S_L2={x:18,y:38},S_L3={x:34,y:16},S_L4={x:50,y:26},U_L={x:50,y:4};
  const S_R1={x:82,y:22},S_R2={x:82,y:62},S_R3={x:66,y:84},S_R4={x:50,y:74},U_R={x:50,y:96};

  const nodes = [
    {id:'ctrl',...CTRL,r:4.2,label:'CONTROL',type:'control'},
    {id:'uL',...U_L,r:2.2,label:'USER · IN',type:'user'},
    {id:'sL1',...S_L1,r:2.4,label:'SERVICE',type:'service'},
    {id:'sL2',...S_L2,r:2.2,label:'WORKER',type:'worker'},
    {id:'sL3',...S_L3,r:2.4,label:'SERVICE',type:'service'},
    {id:'sL4',...S_L4,r:2.2,label:'APP',type:'custom'},
    {id:'uR',...U_R,r:2.2,label:'USER · OUT',type:'user'},
    {id:'sR1',...S_R1,r:2.2,label:'APP',type:'custom'},
    {id:'sR2',...S_R2,r:2.4,label:'SERVICE',type:'service'},
    {id:'sR3',...S_R3,r:2.2,label:'WORKER',type:'worker'},
    {id:'sR4',...S_R4,r:2.4,label:'SERVICE',type:'service'},
  ];
  const nm=Object.fromEntries(nodes.map(n=>[n.id,n]));
  const ch=c=>c.slice(0,-1).map((id,i)=>[id,c[i+1]]);
  const logoEdges=[...ch(['sL1','sL2','sL3','sL4','uL']),...ch(['sR1','sR2','sR3','sR4','uR']),...ch(['sL4','ctrl','sR4'])];
  const ifEdges=[['sL1','sR2'],['sL2','sR1'],['sL3','sR3'],['uL','sR3'],['uR','sL3']];
  const hasHL=highlightIds&&highlightIds.size>0;

  const nodeOpacity=n=>{
    if(!hasHL)return 1;
    if(n.id==='ctrl'&&highlightIds.has('ctrl'))return 1;
    if(n.type==='user')return 0.35;
    if(highlightIds.has(n.id))return 1;
    return 0.12;
  };

  return (
    <div style={{position:'relative',width:'min(480px,88vw)',aspectRatio:'1/1',margin:'0 auto'}}>
      <svg viewBox="0 0 100 100" style={{width:'100%',height:'100%',overflow:'visible'}}>
        <defs>
          <radialGradient id="hg" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.35"/>
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0"/>
          </radialGradient>
          <filter id="glow-f"><feGaussianBlur stdDeviation="1.1" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        </defs>
        <circle cx="50" cy="50" r="46" fill="none" stroke="var(--rule-s)" strokeWidth="0.08" strokeDasharray="0.3 0.9"/>
        <circle cx="50" cy="50" r="22" fill="url(#hg)">
          <animate attributeName="r" values="18;28;18" dur="7s" repeatCount="indefinite"/>
          <animate attributeName="opacity" values="0.5;0.08;0.5" dur="7s" repeatCount="indefinite"/>
        </circle>
        {ifEdges.map(([a,b],i)=>{const na=nm[a],nb=nm[b];return(
          <line key={i} x1={na.x} y1={na.y} x2={nb.x} y2={nb.y}
            stroke="var(--steel-dim)" strokeWidth="0.15" strokeDasharray="0.7 1.8"
            opacity={hasHL?0.1:0.35} style={{transition:'opacity .7s ease'}}/>
        );})}
        {logoEdges.map(([a,b],i)=>{const na=nm[a],nb=nm[b];
          const eHL=hasHL&&(highlightIds.has(a)||highlightIds.has(b));
          const edgeOp=!hasHL?1:eHL?1:0.1;
          return(
            <g key={i} style={{opacity:edgeOp,transition:'opacity .7s ease'}}>
              <line x1={na.x} y1={na.y} x2={nb.x} y2={nb.y} stroke="var(--accent)" strokeWidth="0.28" opacity="0.28"/>
              <line x1={na.x} y1={na.y} x2={nb.x} y2={nb.y} stroke="var(--accent)"
                strokeWidth={eHL?0.55:0.38} strokeDasharray="1.8 2.8"
                style={{animation:`flow ${2.8+(i%4)*.35}s linear infinite`}}/>
            </g>
          );
        })}
        {nodes.map(n=>{
          const op=nodeOpacity(n);
          const dx=n.x-50,dy=n.y-50,mag=Math.hypot(dx,dy)||1;
          const lx=n.x+(dx/mag)*4.6,ly=n.y+(dy/mag)*4.6+.5;
          const isHL=hasHL&&highlightIds.has(n.id);
          return(
            <g key={n.id} style={{opacity:op,transition:'opacity .7s ease',filter:isHL?'url(#glow-f)':'none'}}>
              {n.type==='control'&&(<>
                <rect x={n.x-n.r*1.8} y={n.y-n.r*1.8} width={n.r*3.6} height={n.r*3.6} fill="none" stroke="var(--accent)" strokeWidth="0.15" opacity="0.4"/>
                <rect x={n.x-n.r} y={n.y-n.r} width={n.r*2} height={n.r*2} fill="var(--void)" stroke="var(--accent)" strokeWidth={isHL?0.55:0.35}/>
                <image href={LANDING_LOGO_WHITE} x={n.x-n.r*.82} y={n.y-n.r*.82} width={n.r*1.64} height={n.r*1.64} preserveAspectRatio="xMidYMid meet"/>
                {isHL&&<circle cx={n.x} cy={n.y} r={n.r*2.2} fill="none" stroke="var(--accent)" strokeWidth="0.25" opacity="0.4"><animate attributeName="r" values={`${n.r*2};${n.r*3.4};${n.r*2}`} dur="2s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.5;0;0.5" dur="2s" repeatCount="indefinite"/></circle>}
              </>)}
              {n.type==='user'&&(()=>{const r=n.r,pts=Array.from({length:6}).map((_,k)=>{const a=(Math.PI/3)*k-Math.PI/2;return `${n.x+Math.cos(a)*r},${n.y+Math.sin(a)*r}`;}).join(' ');return(<><polygon points={pts} fill="var(--void-2)" stroke="var(--ink)" strokeWidth="0.24"/><circle cx={n.x} cy={n.y} r={n.r*.32} fill="var(--ink)"/></>);})()}
              {n.type==='service'&&(<><rect x={n.x-n.r} y={n.y-n.r} width={n.r*2} height={n.r*2} fill="var(--void)" stroke={isHL?'var(--accent)':'var(--ink)'} strokeWidth="0.24"/><rect x={n.x-n.r*.32} y={n.y-n.r*.32} width={n.r*.64} height={n.r*.64} fill={isHL?'var(--accent)':'var(--ink)'}/>{isHL&&<circle cx={n.x} cy={n.y} r={n.r*1.8} fill="none" stroke="var(--accent)" strokeWidth="0.25" opacity="0.35"><animate attributeName="r" values={`${n.r*1.5};${n.r*2.5};${n.r*1.5}`} dur="2.2s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.5;0;0.5" dur="2.2s" repeatCount="indefinite"/></circle>}</>)}
              {n.type==='worker'&&(<><circle cx={n.x} cy={n.y} r={n.r} fill="var(--void)" stroke={isHL?'var(--accent)':'var(--ink)'} strokeWidth="0.24"/><circle cx={n.x} cy={n.y} r={n.r*.38} fill={isHL?'var(--accent)':'var(--ink)'}/>{isHL&&<circle cx={n.x} cy={n.y} r={n.r*1.8} fill="none" stroke="var(--accent)" strokeWidth="0.25" opacity="0.35"><animate attributeName="r" values={`${n.r*1.5};${n.r*2.5};${n.r*1.5}`} dur="1.9s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.5;0;0.5" dur="1.9s" repeatCount="indefinite"/></circle>}</>)}
              {n.type==='custom'&&(<><rect x={n.x-n.r*.85} y={n.y-n.r*.85} width={n.r*1.7} height={n.r*1.7} fill="var(--void)" stroke={isHL?'var(--accent)':'var(--ink)'} strokeWidth="0.24" transform={`rotate(45 ${n.x} ${n.y})`}/><rect x={n.x-n.r*.28} y={n.y-n.r*.28} width={n.r*.56} height={n.r*.56} fill={isHL?'var(--accent)':'var(--ink)'} transform={`rotate(45 ${n.x} ${n.y})`}/>{isHL&&<circle cx={n.x} cy={n.y} r={n.r*1.8} fill="none" stroke="var(--accent)" strokeWidth="0.25" opacity="0.35"><animate attributeName="r" values={`${n.r*1.5};${n.r*2.5};${n.r*1.5}`} dur="2.1s" repeatCount="indefinite"/><animate attributeName="opacity" values="0.5;0;0.5" dur="2.1s" repeatCount="indefinite"/></circle>}</>)}
              {n.type!=='control'&&<text x={lx} y={ly} fontFamily="var(--f-mono)" fontSize="1.18" fill={isHL?'var(--accent)':'var(--steel)'} textAnchor={dx>8?'start':dx<-8?'end':'middle'} dominantBaseline={dy>8?'hanging':dy<-8?'auto':'middle'} letterSpacing="0.18" style={{transition:'fill .5s ease'}}>{n.label}</text>}
            </g>
          );
        })}
        <text x="1" y="3" fontFamily="var(--f-mono)" fontSize="1.1" fill="var(--steel-dim)">SYS·NENJO</text>
        <text x="99" y="3" fontFamily="var(--f-mono)" fontSize="1.1" fill="var(--steel-dim)" textAnchor="end">RT·LIVE</text>
        <text x="1" y="99" fontFamily="var(--f-mono)" fontSize="1.1" fill="var(--steel-dim)">FABRIC·ACTIVE</text>
        <text x="99" y="99" fontFamily="var(--f-mono)" fontSize="1.1" fill="var(--steel-dim)" textAnchor="end">LAT·12ms</text>
      </svg>
    </div>
  );
};

// ── SPLASH HERO ──
const TAGLINES = [
  { id: 'a', text: <>The AI infrastructure between<br/><em>knowing and doing.</em></> },
  { id: 'b', text: <>Give your agents a mind.<br/><em>Give them a mission.</em></> },
  { id: 'c', text: <>Two layers.<br/><em>Infinite agents.</em></> },
  { id: 'd', text: <>Your agents.<br/><em>Taught to know. Built to act.</em></> },
];

const SplashHero = ({ taglineId = 'a' }) => {
  const tagline = TAGLINES.find(t => t.id === taglineId) || TAGLINES[0];
  return (
    <section className="splash">
      <div className="splash-kanji-bg">念</div>
      <div className="splash-grid"/>
      <div className="splash-glow-1"/>
      <div className="splash-glow-2"/>
      <div className="splash-inner">
        <div className="splash-eyebrow">NENJO · BETA</div>
        <img
          className="splash-logo"
          src={LANDING_LOGO_WHITE}
          alt="Nenjo"
        />
        <div className="splash-headline">{tagline.text}</div>
        <div className="splash-layers">
          <div className="splash-layer">
            <div className="splash-layer-dot"/>
            Knowledge Layer
          </div>
          <div className="splash-layer-sep"/>
          <div className="splash-layer">
            <div className="splash-layer-dot"/>
            Behavioral Layer
          </div>
        </div>
        <p className="splash-subtitle">
          Nenjo is a modular agentic control plane for building, deploying, and evolving AI workers across your own apps and infrastructure.
        </p>
      </div>
      <div className="splash-scroll">
        <div className="splash-scroll-line"/>
        scroll
      </div>
    </section>
  );
};

// ── KNOWLEDGE GRAPH ──
const KnowledgeGraph = () => {
  const nodes = [
    { id:'doc1', x:50,  y:6,  label:'Policy',    r:4.8, type:'doc'   },
    { id:'doc2', x:88,  y:26, label:'Guide',      r:4.6, type:'doc'   },
    { id:'doc3', x:88,  y:70, label:'Reference',  r:4.6, type:'doc'   },
    { id:'doc4', x:50,  y:92, label:'Entity',     r:4.6, type:'doc'   },
    { id:'doc5', x:12,  y:70, label:'Taxonomy',   r:4.6, type:'doc'   },
    { id:'doc6', x:12,  y:26, label:'Domain',     r:4.6, type:'doc'   },
    { id:'c5',   x:50,  y:50, label:'KNOWLEDGE',  r:9.5, type:'center'},
  ];
  // spokes to center + ring between adjacent outer nodes
  const outerIds = ['doc1','doc2','doc3','doc4','doc5','doc6'];
  const edges = [
    ...outerIds.map(id => [id,'c5']),
    ...outerIds.map((id,i) => [id, outerIds[(i+1)%outerIds.length]]),
  ];
  const nm = Object.fromEntries(nodes.map(n=>[n.id,n]));

  return (
    <div className="kgraph-wrap">
      <svg viewBox="0 0 100 100" style={{width:'100%',height:'100%',overflow:'visible'}}>
        <defs>
          <radialGradient id="kg-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.2"/>
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0"/>
          </radialGradient>
          <filter id="kg-blur"><feGaussianBlur stdDeviation="1.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        </defs>

        {/* ambient glow */}
        <circle cx="50" cy="50" r="40" fill="url(#kg-glow)">
          <animate attributeName="r" values="36;44;36" dur="5s" repeatCount="indefinite"/>
          <animate attributeName="opacity" values="0.8;0.4;0.8" dur="5s" repeatCount="indefinite"/>
        </circle>

        {/* edges */}
        {edges.map(([a,b],i) => {
          const na=nm[a], nb=nm[b];
          const isSpoke = a==='c5'||b==='c5';
          return (
            <g key={i}>
              <line x1={na.x} y1={na.y} x2={nb.x} y2={nb.y}
                stroke="var(--accent)" strokeWidth={isSpoke?0.28:0.16}
                opacity={isSpoke?0.18:0.1}/>
              <line x1={na.x} y1={na.y} x2={nb.x} y2={nb.y}
                stroke="var(--accent)" strokeWidth={isSpoke?0.45:0.24}
                opacity={isSpoke?0.5:0.28}
                strokeDasharray={isSpoke?"1.6 2.4":"0.8 3.2"}
                style={{animation:`flow ${3.0+(i%6)*.38}s linear infinite`}}/>
            </g>
          );
        })}

        {/* nodes */}
        {nodes.map((n,i) => {
          const isCenter = n.type==='center';
          const isCore   = n.type==='core';
          const isDoc    = n.type==='doc';
          const delay    = `${(i*0.7)%3.5}s`;
          return (
            <g key={n.id} filter={isCenter?'url(#kg-blur)':undefined}>
              {/* outer ring for center */}
              {isCenter && (
                <circle cx={n.x} cy={n.y} r={n.r*1.7}
                  fill="none" stroke="var(--accent)" strokeWidth="0.2" opacity="0.3"
                  strokeDasharray="1 1.5">
                  <animateTransform attributeName="transform" type="rotate"
                    from={`0 ${n.x} ${n.y}`} to={`360 ${n.x} ${n.y}`}
                    dur="18s" repeatCount="indefinite"/>
                </circle>
              )}
              <circle cx={n.x} cy={n.y} r={n.r}
                fill={isCenter?'var(--void-3)':isCore?'var(--void-2)':'var(--void)'}
                stroke="var(--accent)"
                strokeWidth={isCenter?0.45:isCore?0.32:0.22}
                opacity={isCenter?1:isCore?0.85:0.65}>
                <animate attributeName="r"
                  values={`${n.r};${n.r*1.08};${n.r}`}
                  dur={`${3.5+(i%3)}s`} begin={delay} repeatCount="indefinite"/>
              </circle>
              {isCenter && (
                <circle cx={n.x} cy={n.y} r={n.r*0.55}
                  fill="none" stroke="var(--accent)" strokeWidth="0.3" opacity="0.5"/>
              )}
              {/* label */}
              {(() => {
                const dx = n.x - 50, dy = n.y - 50;
                const mag = Math.hypot(dx, dy) || 1;
                const offset = n.r + 2.8;
                const lx = isDoc ? n.x + (dx/mag)*offset : n.x;
                const ly = isDoc ? n.y + (dy/mag)*offset : n.y + 0.5;
                const anchor = isDoc ? (dx > 4 ? 'start' : dx < -4 ? 'end' : 'middle') : 'middle';
                const baseline = isDoc ? (dy > 4 ? 'hanging' : dy < -4 ? 'auto' : 'middle') : 'middle';
                return (
                  <text
                    x={lx} y={ly}
                    fontFamily="var(--f-mono)"
                    fontSize={isCenter?2.6:isDoc?1.7:1.9}
                    fill={isCenter?'var(--accent)':isCore?'var(--ink)':'var(--ink-dim)'}
                    textAnchor={anchor}
                    dominantBaseline={baseline}
                    letterSpacing="0.15"
                    fontWeight={isCenter?"500":"400"}>
                    {n.label}
                  </text>
                );
              })()}
            </g>
          );
        })}
      </svg>
    </div>
  );
};

// ── LAYERS SECTION ──
const LayersSections = () => (
  <div className="layers-wrap">
    {/* KNOWLEDGE LAYER */}
    <div style={{borderBottom:'1px solid var(--rule)'}}>
      <div className="layer-panel sr">
        <div className="layer-text">
          <div className="layer-pip"><div className="layer-pip-dot"/>&nbsp;Knowledge Layer</div>
          <div className="layer-h">Documents that<br/><em>think in graphs.</em></div>
          <div className="layer-body">
            Your knowledge isn't flat — it's a living graph of concepts, relationships, and context. Nenjo organises your documents into a structured network so agents always have the right understanding, not just the right text.
          </div>
          <div className="layer-attrs">
            {[
              { t:'Concept graphs', d:'Documents linked by meaning, not just keyword. Agents navigate relationships the way a team member would.' },
              { t:'Always current', d:'Knowledge updates propagate through the graph in real time. Agents never act on stale context.' },
              { t:'Structured context', d:'Organize project knowledge, docs, and domain rules into a graph agents can reference consistently.' },
            ].map((a,i) => (
              <div key={i} className="layer-attr">
                <div className="layer-attr-mark"/>
                <div><strong>{a.t} — </strong>{a.d}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="layer-visual">
          <KnowledgeGraph/>
        </div>
      </div>
    </div>

    {/* BEHAVIORAL LAYER */}
    <div>
      <div className="layer-panel reverse sr sr-d1">
        <div className="layer-text">
          <div className="layer-pip"><div className="layer-pip-dot"/>&nbsp;Behavioral Layer</div>
          <div className="layer-h">Context engineered.<br/><em>Behavior portable.</em></div>
          <div className="layer-body">
            How an agent acts is defined in a manifest — a portable, version-controlled file that describes its model, tools, context window, and runtime policy. Update it live. Agents adapt without restarting.
          </div>
          <div className="layer-attrs">
            {[
              { t:'Context engineering', d:'Precisely shape what each agent knows at runtime — no prompt guesswork, no leaking context across boundaries.' },
              { t:'Portable manifests', d:'Agent behaviour defined as files. Deploy to any environment, hot-swap while live, roll back in seconds.' },
              { t:'Runtime policy', d:'Enforce access, routing, and coordination rules at the layer level — not scattered across application code.' },
            ].map((a,i) => (
              <div key={i} className="layer-attr">
                <div className="layer-attr-mark"/>
                <div><strong>{a.t} — </strong>{a.d}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="layer-visual">
          <div className="manifest-wrap">
            <div className="manifest-header">
              <div className="manifest-title">agent.manifest.json</div>
              <div className="manifest-badge">LIVE · v2.4</div>
            </div>
            {[
              { key:'"name":', val:'"customer-support-agent"', type:'bright' },
              { key:'"description":', val:'"Handles inbound tickets,', type:'normal' },
              { key:'', val:' resolves issues, escalates."', type:'normal' },
              { divider:true },
              { key:'"prompt_config":', val:'{', type:'normal' },
              { key:'"system_prompt":', val:'"You are a support agent.', type:'normal', indent:true },
              { key:'', val:' Be concise and helpful."', type:'normal', indent:true },
              { key:'"developer_prompt":', val:'"{{lib.product}}"', type:'accent', indent:true },
              { divider:true },
              { key:'"templates":', val:'{', type:'normal', indent:true },
              { key:'"task":', val:'"{{task}}"', type:'accent', indent:true, indent2:true },
              { key:'"chat":', val:'"Handle customer inquiry."', type:'normal', indent:true, indent2:true },
              { divider:true },
              { key:'"memory_profile":', val:'{', type:'normal', indent:true },
              { key:'"core_focus":', val:'["support-kb", "policies"]', type:'normal', indent:true, indent2:true },
              { key:'"project_focus":', val:'["tickets", "customers"]', type:'normal', indent:true, indent2:true },
            ].map((l,i) => {
              if(l.divider) return <div key={i} className="layer-divider" style={{margin:'6px 0'}}/>;
              const leftPad = l.indent2 ? 28 : l.indent ? 14 : 0;
              return (
                <div key={i} className="manifest-line">
                  {l.key && <span className="ml-key" style={{minWidth:'76px', paddingLeft:leftPad, flexShrink:0, whiteSpace:'nowrap'}}>{l.key}</span>}
                  {!l.key && <span style={{minWidth: leftPad + 76 + 'px', flexShrink:0}}/>}
                  {l.val && <span className={`ml-val${l.type==='accent'?' accent':l.type==='bright'?' bright':''}`}>{l.val}</span>}
                </div>
              );
            })}
            <div className="manifest-line" style={{marginTop:8}}>
              <span className="ml-key" style={{color:'var(--steel-dim)',minWidth:'76px'}}>status:</span>
              <span className="ml-val accent">running<span className="manifest-cursor"/></span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
);

// ── USE CASES SECTION ──
const UseCasesSection = () => (
  <div className="usecases-wrap">
    <div className="usecases-inner">
      <div className="usecases-hd section-hd sr">
        <div className="section-kicker">BUILT FOR EVERY BUILDER</div>
        <div className="section-title">One platform.<br/><em>Every scope of ambition.</em></div>
        <div className="section-sub">From embedding agents in your product to launching a standalone AI assistant or delivering solutions to clients — Nenjo gives every builder the same powerful foundation.</div>
      </div>
      <div className="uc-grid sr sr-d1">
        {[
          {
            persona: 'Product Developers',
            name: <>Embed agents<br/><em>inside your product.</em></>,
            body: 'Use the Nenjo SDK to wire agents directly into your application. Your knowledge graph keeps them informed; manifests keep their behaviour consistent across every user and environment.',
            builds: [
              { t: 'Custom AI features', d: 'built with the Nenjo SDK — agents that live inside your product.' },
              { t: 'Context-aware co-pilots', d: "scoped to each user's permissions and session." },
              { t: 'Onboarding & support agents', d: 'that stay current as your product evolves.' },
            ],
          },
          {
            persona: 'AI Product Builders',
            name: <>Launch a standalone<br/><em>AI assistant.</em></>,
            body: 'Build OpenClaw-style long-running agent products on Nenjo. Persistent memory, portable manifests, and a live runtime give you everything needed to ship a fully-featured AI assistant.',
            builds: [
              { t: 'Long-running agent products', d: 'with persistent memory and continuous operation.' },
              { t: 'Multi-agent coordination', d: 'for complex tasks that span tools, time, and context.' },
              { t: 'White-label AI assistants', d: 'deployable to any environment with full observability.' },
            ],
          },
          {
            persona: 'Businesses & Consultants',
            name: <>Deliver AI solutions<br/><em>to your clients.</em></>,
            body: "Whether you're a solo entrepreneur or a growing agency, Nenjo gives you the infrastructure to build, deploy, and maintain AI solutions for clients — without reinventing the stack each time.",
            builds: [
              { t: 'Repeatable client deployments', d: 'using portable manifests that adapt to each business.' },
              { t: 'Operations automation', d: 'for support, workflows, and internal processes.' },
              { t: 'Managed agent services', d: 'you maintain centrally, hot-swap without client downtime.' },
            ],
          },
        ].map((c, i) => (
          <div key={i} className="uc-card">
            <div className="uc-persona">{c.persona}</div>
            <div className="uc-name">{c.name}</div>
            <div className="uc-body">{c.body}</div>
            <div className="uc-builds">
              {c.builds.map((b, j) => (
                <div key={j} className="uc-build">
                  <div className="uc-build-mark"/>
                  <div><strong>{b.t}</strong> — {b.d}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

// ── SCROLL HERO ──
const HeroScroll = () => {
  const stageRef = useRef(null);
  const [sectionIdx, setSectionIdx] = useState(0);
  const [showDots, setShowDots] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      const el = stageRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const totalH = el.offsetHeight - window.innerHeight;
      const scrolled = -rect.top;
      const progress = Math.max(0, Math.min(1, scrolled / totalH));
      const idx = Math.min(SECTIONS.length - 1, Math.floor(progress * SECTIONS.length));
      setSectionIdx(idx);
      setShowDots(scrolled > 60 && scrolled < totalH + window.innerHeight * 0.5);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const sec = SECTIONS[sectionIdx];
  const kanjiLabels = ['念', '制', '働', '具', '創'];

  return (
    <>
      <div className={`prog-dots${showDots?' show':''}`}>
        {SECTIONS.map((s,i) => (
          <div key={i} className={`prog-dot${i===sectionIdx?' on':''}`}
               onClick={() => {
                 const el = stageRef.current;
                 if (!el) return;
                 const totalH = el.offsetHeight - window.innerHeight;
                 const target = el.offsetTop + (i / SECTIONS.length) * totalH + 20;
                 window.scrollTo({ top: target, behavior: 'smooth' });
               }}/>
        ))}
      </div>

      <div ref={stageRef} className="scroll-stage" style={{height:`${SECTIONS.length * 100}vh`}}>
        <div className="scroll-sticky">
          <div className="scroll-bg-grid"/>
          <div className="scroll-bg-glow"/>
          <div className="scroll-kanji" style={{opacity: sectionIdx===0?1:0.6}}>
            {kanjiLabels[sectionIdx]}
          </div>
          <div className="scroll-inner">
            <div className="graph-stage">
              <div className="graph-3d" style={{transform:sec.transform3d}}>
                <HeroGraph highlightIds={sec.highlight}/>
              </div>
            </div>
            <div className="text-panels">
              {SECTIONS.map((s,i) => (
                <div key={s.id} className={`tpanel${i===sectionIdx?' on':''}`}>
                  <div className="tp-kicker">{s.kicker}</div>
                  <div className="tp-h">{s.headline}</div>
                  <div className="tp-b">{s.body}</div>
                  {s.detail && <div className="tp-detail">{s.detail}</div>}
                  {s.tags && <div className="tp-tags">{s.tags.map((t,j)=><span key={j} className="tp-tag">{t}</span>)}</div>}
                  {i===0 && (
                    <div className="tp-btns">
                      <a className="btn-a" href="/dashboard/login">Start building →</a>
                      <a className="btn-b" href="#how">How it works</a>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

// ── NAV ──
const Nav = () => (
  <nav className="nav">
    <div className="nav-brand">
      <img src={LANDING_LOGO} width="17" height="17" style={{opacity:.8}} alt=""/>
      NENJO
    </div>
    <div className="nav-links">
      <a href="/docs" aria-label="Developer documentation" title="Developer documentation">
        <BookOpen size={16} strokeWidth={1.7} />
      </a>
      <a
        href="https://github.com/nenjo-ai/nenjo"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Nenjo GitHub repository"
        title="Nenjo GitHub repository"
      >
        <Github size={16} strokeWidth={1.7} />
      </a>
    </div>
    <a className="nav-cta" href="/dashboard/login">ENTER</a>
  </nav>
);

// ── MANIFESTO ──
const Manifesto = () => (
  <div className="manifesto sr">
    <div className="manifesto-bg"/>
    <div className="manifesto-kanji">念助</div>
    <div className="manifesto-inner">
      <div className="manifesto-eyebrow">NENJO · PHILOSOPHY</div>
      <div className="manifesto-quote">
        "Mindful assistance — agents that work<br/>with purpose and precision."
      </div>
      <div className="manifesto-etymology">
        <div className="etym-item">
          <div className="etym-char">念</div>
          <div className="etym-text">
            <div className="etym-rom">NEN</div>
            <div className="etym-def">Thought, mindfulness, attention.<br/>The focused intention behind every action.</div>
          </div>
        </div>
        <div className="etym-item">
          <div className="etym-char">助</div>
          <div className="etym-text">
            <div className="etym-rom">JO</div>
            <div className="etym-def">Help, assistance, support.<br/>The act of empowering others to achieve more.</div>
          </div>
        </div>
      </div>
    </div>
  </div>
);

// ── VALUE PROP ──
const ValueProp = () => (
  <section className="section sr" style={{borderTop:'1px solid var(--rule)'}}>
    <div className="section-hd">
      <div className="section-kicker">WHY NENJO</div>
      <div className="section-title">Your next advantage<br/><em>isn't headcount — it's agents.</em></div>
    </div>
    <div className="vp-grid" style={{background:'var(--rule)'}}>
      {[
        {n:'01', title:'Launch in hours, not months', body:'Bootstrap agentic workflows without deep technical expertise. Automate repetitive work, reduce overhead, and give your team back time for what matters.', tags:['Cost reduction','Time saving','Easy to bootstrap']},
        {n:'02', title:'Secure by default', body:'Zero trust architecture, end-to-end encryption. The platform never sees your agent prompts or context — your business logic stays yours, always.', tags:['Zero trust','E2E encryption','Private by design']},
        {n:'03', title:'Built for interoperability', body:'A peer-to-peer mesh network connects your agents for seamless interoperability, full observability across every call, and a living system that improves continuously.', tags:['Peer mesh','Observability','Continuous improvement']},
      ].map((c,i) => (
        <div key={i} className="vp-card">
          <div className="vp-n">{c.n}</div>
          <div className="vp-title">{c.title}</div>
          <div className="vp-body">{c.body}</div>
          <div className="vp-tags">{c.tags.map((t,j)=><span key={j} className="vp-tag">{t}</span>)}</div>
        </div>
      ))}
    </div>
  </section>
);

// ── HOW IT WORKS ──
const HowItWorks = () => (
  <section className="section sr" id="how" style={{borderTop:'1px solid var(--rule)'}}>
    <div className="section-hd">
      <div className="section-kicker">HOW IT WORKS</div>
      <div className="section-title">Up and running <em>fast.</em></div>
      <div className="section-sub">Three steps from signup to a live agentic system in your environment.</div>
    </div>
    <div className="how-grid">
      {[
        {n:'01', title:'Run your workers', body:'Deploy worker agents to your own environment. They handle chat, tasks, and long-running jobs continuously — hot-swappable while live, never dropping work.', ex:'> nenjo run'},
        {n:'02', title:'Chat with Nenji', body:'Use Nenji to rapidly bootstrap workflows by translating operational goals into agents, manifests, routines, and the context they need to run reliably.', ex:'→  "Create a customer support workflow for my SaaS"'},
        {n:'03', title:'Evolve without downtime', body:"Update your agent's behaviour any time. Hot-swap takes effect immediately — running tasks are uninterrupted, no restarts, no dropped work.", ex:'manifest_changed(rt=context_block, inline=true)'},
      ].map((s,i) => (
        <div key={i} className="how-step">
          <div className="how-n">{s.n}</div>
          <div className="how-title">{s.title}</div>
          <div className="how-body">{s.body}</div>
          <div className="how-ex">{s.ex}</div>
        </div>
      ))}
    </div>
  </section>
);

// ── AGENT TYPES ──
const AgentTypes = () => (
  <section className="section sr" id="agents" style={{borderTop:'1px solid var(--rule)'}}>
    <div className="section-hd">
      <div className="section-kicker">AGENT TYPES</div>
      <div className="section-title">Three roles.<br/><em>One fabric.</em></div>
    </div>
    <div className="agents-grid" style={{background:'var(--rule)'}}>
      {[
        {
          shape:<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="7.5" stroke="currentColor" strokeWidth="1.1"/><circle cx="9" cy="9" r="2.8" fill="currentColor"/></svg>,
          type:'WORKERS', name:'Chat & Task Workers',
          body:'Worker agents handle tasks end-to-end — chat, messages, long-running jobs. Hosted in your own environment, hot-swappable while live.',
          note:'Requires hosting in your own environment.',
          tags:['Follow-ups','Chat','Long-running tasks'],
        },
        {
          shape:<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="1.5" y="1.5" width="15" height="15" stroke="currentColor" strokeWidth="1.1"/><rect x="5.5" y="5.5" width="7" height="7" fill="currentColor"/></svg>,
          type:'TOOL SERVICES', name:'Secure Tool Environments',
          body:'Services are not agents — execution environments outside the agent harness. A security boundary giving agents controlled, auditable access to external tools and APIs.',
          note:'Isolation layer: sits outside the agent harness.',
          tags:['CRM access','API calls','Data reads'],
        },
        {
          shape:<svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="1" y="9" width="11.3" height="11.3" stroke="currentColor" strokeWidth="1.1" transform="rotate(-45 1 9)"/></svg>,
          type:'CUSTOM APPS', name:'Your Product, Your Logic',
          body:'Custom apps are built by your team on Nenjo. Technical skill needed for hosting and wiring — Nenjo handles orchestration, state, and live updates.',
          note:'Requires development and hosting skill.',
          tags:['Onboarding','Portals','Automation'],
        },
      ].map((a,i) => (
        <div key={i} className="agent-card">
          <div className="agent-glyph">{a.shape}</div>
          <div className="agent-type">{a.type}</div>
          <div className="agent-name">{a.name}</div>
          <div className="agent-body">{a.body}</div>
          <div className="agent-note"><span style={{color:'var(--accent)',flexShrink:0}}>→</span>{a.note}</div>
          <div className="agent-tags">{a.tags.map((t,j)=><span key={j} className="agent-tag">{t}</span>)}</div>
        </div>
      ))}
    </div>
  </section>
);

// ── CTA ──
const CTA = () => (
  <div style={{borderTop:'1px solid var(--rule)'}} id="cta">
    <div className="cta">
      <div className="cta-kanji">念助</div>
      <div className="cta-glow"/>
      <div className="cta-inner">
        <div className="cta-eyebrow">GET STARTED</div>
        <div className="cta-headline">Own your<br/><em>agent stack.</em></div>
        <p className="cta-sub">Launch production-ready agents in hours. Define them as files, update them live, and build systems where agents do more than run — they help operate.</p>
        <div className="cta-btns">
          <a className="btn-a" href="/dashboard/login">Enter Nenjo →</a>
          <a className="btn-b" href="/docs">Read the docs</a>
        </div>
      </div>
    </div>
  </div>
);

// ── APP ──
const App = () => {
  const [tw, setTw] = useState(()=>{
    try{const s=localStorage.getItem('nenjo-p3-tw');return s?{...TWEAK_DEFAULTS,...JSON.parse(s)}:TWEAK_DEFAULTS;}
    catch{return TWEAK_DEFAULTS;}
  });

  useEffect(()=>{
    try{localStorage.setItem('nenjo-p3-tw',JSON.stringify(tw));}catch{}
    
  },[tw]);



  useEffect(()=>{
    const io = new IntersectionObserver(entries=>{
      entries.forEach(e=>{
        if(e.isIntersecting){e.target.classList.add('visible');io.unobserve(e.target);}
      });
    },{threshold:0.07});
    document.querySelectorAll('.sr').forEach(el=>io.observe(el));
    return()=>io.disconnect();
  },[]);


  return (
    <main className="nenjo-landing" data-palette={tw.palette}>
      <Nav/>
      <SplashHero taglineId={tw.tagline}/>
      <LayersSections/>
      <UseCasesSection/>
      <HowItWorks/>
      <ValueProp/>
      <Manifesto/>
      <CTA/>
      <footer className="footer">
        <div className="footer-brand">
          <img src={LANDING_LOGO} width="15" height="15" style={{opacity:.5}} alt=""/>
          NENJO
        </div>
        <div className="footer-r">© 2026 NENJO LABS · BETA</div>
      </footer>
    </main>
  );
};

export default function LandingPage() {
  return <App/>;
}
