import { useState, useEffect, useRef } from "react";

const API = "http://localhost:8000";
const SCALE_X = 1000 / 1666.7;
const SCALE_Y = 780 / 1300;
const toSVG = (xk, yk) => ({ x: xk * SCALE_X, y: yk * SCALE_Y });

// ── Map entities from Boreal_passage_coordinates.csv ─────────────────────────
const BASES = {
  north: [
    { id: "NVB", name: "Northern Vanguard Base", ...toSVG(198.3, 335),   x_km: 198.3,  y_km: 335 },
    { id: "HRC", name: "Highridge Command",      ...toSVG(838.3, 75),    x_km: 838.3,  y_km: 75 },
    { id: "BWP", name: "Boreal Watch Post",      ...toSVG(1158.3, 385),  x_km: 1158.3, y_km: 385 },
  ],
  south: [
    { id: "FWS", name: "Firewatch Station", ...toSVG(1398.3, 1071.7), x_km: 1398.3, y_km: 1071.7 },
    { id: "SRD", name: "Southern Redoubt",  ...toSVG(321.7,  1238.3), x_km: 321.7,  y_km: 1238.3 },
    { id: "SPB", name: "Spear Point Base",  ...toSVG(918.3,  835),    x_km: 918.3,  y_km: 835 },
  ],
};

const TARGETS = {
  north: [
    { id: "ARK", name: "Arktholm",  type: "capital",    ...toSVG(418.3,  95),     x_km: 418.3,  y_km: 95,     priority: 10 },
    { id: "VLB", name: "Valbrek",   type: "major_city", ...toSVG(1423.3, 213.3),  x_km: 1423.3, y_km: 213.3,  priority: 6 },
    { id: "NDV", name: "Nordvik",   type: "major_city", ...toSVG(140,    323.3),  x_km: 140,    y_km: 323.3,  priority: 6 },
  ],
  south: [
    { id: "MER", name: "Meridia",   type: "capital",    ...toSVG(1225,   1208.3), x_km: 1225,   y_km: 1208.3, priority: 10 },
    { id: "CLH", name: "Callhaven", type: "major_city", ...toSVG(96.7,   1150),   x_km: 96.7,   y_km: 1150,   priority: 6 },
    { id: "SOL", name: "Solano",    type: "major_city", ...toSVG(576.7,  1236.7), x_km: 576.7,  y_km: 1236.7, priority: 6 },
  ],
};

const ALL_BASES = [...BASES.north, ...BASES.south];
const THREAT_TYPES = ["Ballistic missile", "Strike aircraft", "Cruise missile", "Armed drone", "Fighter jet"];

// Naval ships — positioned in the Boreal Passage (open sea between island groups)
const SHIPS = [
  { id: "SNS-1", name: "SNS Ironclad",  x_km: 180,  y_km: 700, ...toSVG(180,  700) },
  { id: "SNS-2", name: "SNS Resolute",  x_km: 700,  y_km: 670, ...toSVG(700,  670) },
  { id: "SNS-3", name: "SNS Vigilant",  x_km: 1250, y_km: 640, ...toSVG(1250, 640) },
];
const SHIP_SAM_RANGE_SVG   = 350 * SCALE_Y;  // 350km max SAM range
const SHIP_RADAR_RANGE_SVG = 220 * SCALE_Y;  // 220km onboard fire-control radar — auto-engages on entry
const GROUND_DEF_RANGE_SVG = 300 * SCALE_Y;  // 300km ground SAM range
const CIWS_RANGE_SVG        = 15  * SCALE_Y;  // 15km CIWS last-resort auto-fire
const SHIP_HIT_RADIUS       = 18;             // SVG px — threat this close triggers hit
const NORTH_CITY_IDS        = new Set(["ARK", "VLB", "NDV"]); // only these trigger city-hit path
let threatCounter = 1;

// Radar stations — on the three north-passage islands in the Boreal Passage
// SVG screen positions derived from island polygon centroids (north land group, translate(0,-40))
const RADAR_STATIONS = [
  { id: "RAD-NW", label: "RW", svgX: 182, svgY: 376, range_km: 360 },  // NW island
  { id: "RAD-NC", label: "RC", svgX: 394, svgY: 296, range_km: 360 },  // NC island
  { id: "RAD-NE", label: "RE", svgX: 694, svgY: 233, range_km: 360 },  // NE island
].map(r => ({ ...r, x: r.svgX, y: r.svgY, range_svg: r.range_km * SCALE_Y }));

// ── Helpers ──────────────────────────────────────────────────────────────────
function spawnTowardTarget(spawnX, spawnY, target, type) {
  const dx = target.x - spawnX;
  const dy = target.y - spawnY;
  const len = Math.sqrt(dx * dx + dy * dy);
  const animSpd = 0.28 + Math.random() * 0.18;  // ~20-30s to reach target at 60fps
  const id = `T${String(threatCounter++).padStart(3, "0")}`;

  // Real-world speed and ETA from km coordinates
  const speed_km_h = Math.floor(600 + Math.random() * 900);
  const dx_km = target.x_km - spawnX / SCALE_X;
  const dy_km = target.y_km - spawnY / SCALE_Y;
  const dist_km = Math.sqrt(dx_km ** 2 + dy_km ** 2);
  const eta_seconds = Math.round(dist_km / speed_km_h * 3600);

  return {
    id, type,
    x: spawnX, y: spawnY,
    x_km: spawnX / SCALE_X, y_km: spawnY / SCALE_Y,
    vx: (dx / len) * animSpd, vy: (dy / len) * animSpd,
    target_id: target.id, target_name: target.name,
    target_x: target.x, target_y: target.y,
    dist_km: Math.round(dist_km),
    speed: speed_km_h,
    heading: Math.round((Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360),
    eta: eta_seconds,
    classification: "HOSTILE",
    civilian_nearby: Math.random() > 0.78,
    detected: false,
    age: 0,
  };
}

function randomThreat() {
  const target = TARGETS.north[Math.floor(Math.random() * TARGETS.north.length)];
  const spawnX = 40 + Math.random() * 920;
  const spawnY = 660 + Math.random() * 55;
  return spawnTowardTarget(spawnX, spawnY, target, THREAT_TYPES[Math.floor(Math.random() * THREAT_TYPES.length)]);
}

function randomCivilian() {
  const fromLeft = Math.random() > 0.5;
  return {
    id: `CA${Math.floor(Math.random() * 9000 + 1000)}`,
    x: fromLeft ? -10 : 1010, y: 270 + Math.random() * 240,
    vx: fromLeft ? 1.1 + Math.random() * 0.7 : -(1.1 + Math.random() * 0.7),
    vy: (Math.random() - 0.5) * 0.3,
    speed: Math.floor(700 + Math.random() * 200),
    altitude: Math.floor(8000 + Math.random() * 4000),
    heading: fromLeft ? 90 : 270, squawk: "2000",
  };
}

// ── Threat type icons ────────────────────────────────────────────────────────
function ThreatIcon({ type, color, angle }) {
  const c = color;
  if (type === "Armed drone") {
    return (
      <g transform={`rotate(${angle})`}>
        <circle r="2.5" fill={c} />
        {[45, 135, 225, 315].map(a => {
          const r = a * Math.PI / 180, ex = Math.cos(r) * 7, ey = Math.sin(r) * 7;
          return (
            <g key={a}>
              <line x1={Math.cos(r)*2.5} y1={Math.sin(r)*2.5} x2={ex} y2={ey}
                stroke={c} strokeWidth="1.5" strokeLinecap="round" />
              <circle cx={ex} cy={ey} r="2.5" fill="none" stroke={c} strokeWidth="1" />
            </g>
          );
        })}
      </g>
    );
  }
  if (type === "Ballistic missile" || type === "Cruise missile") {
    return (
      <g transform={`rotate(${angle})`}>
        <polygon points="0,-11 -2,-5 2,-5" fill={c} />
        <rect x="-2" y="-5" width="4" height="9" rx="0.5" fill={c} />
        <polygon points="-2,3 -5,9 -1.5,6" fill={c} opacity="0.8" />
        <polygon points="2,3 5,9 1.5,6" fill={c} opacity="0.8" />
        {type === "Ballistic missile" && (
          <ellipse cx="0" cy="9" rx="1.5" ry="2.5" fill="#facc15" opacity="0.7" />
        )}
      </g>
    );
  }
  if (type === "Strike aircraft" || type === "Fighter jet") {
    const ws = type === "Fighter jet" ? 10 : 9;
    return (
      <g transform={`rotate(${angle})`}>
        <polygon points="0,-11 -1.5,4 1.5,4" fill={c} />
        <polygon points={`-1.5,-2 -${ws},5 -1.5,5`} fill={c} opacity="0.85" />
        <polygon points={`1.5,-2 ${ws},5 1.5,5`} fill={c} opacity="0.85" />
        <polygon points="-1.5,4 -4,8.5 -1,6.5" fill={c} opacity="0.7" />
        <polygon points="1.5,4 4,8.5 1,6.5" fill={c} opacity="0.7" />
        <ellipse cx="0" cy="-6" rx="1" ry="1.8" fill="#000" opacity="0.35" />
      </g>
    );
  }
  return <polygon points="0,-8 -6,5 6,5" fill={c} stroke="#000" strokeWidth="0.8" transform={`rotate(${angle})`} />;
}

const confColor  = c => c >= 85 ? "#4ade80" : c >= 65 ? "#facc15" : "#f87171";
const prioColor  = p => p === "immediate" ? "#f87171" : p === "urgent" ? "#facc15" : "#4ade80";
const fuelColor  = f => f >= 70 ? "#4ade80" : f >= 40 ? "#facc15" : "#f87171";
const riskColor  = r => r === "critical" ? "#f87171" : r === "high" ? "#ff8855" : r === "medium" ? "#facc15" : "#4ade80";

const formatETA = s => {
  if (s <= 0) return "EXPIRED";
  const m = Math.floor(s / 60), sec = s % 60;
  return m > 0 ? `${m}m ${String(sec).padStart(2,"0")}s` : `${sec}s`;
};

// ── App ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [threats,          setThreats]          = useState([]);
  const [civilians,        setCivilians]        = useState([randomCivilian(), randomCivilian(), randomCivilian()]);
  const [decisions,        setDecisions]        = useState([]);
  const [intercepts,       setIntercepts]       = useState([]);
  const [pending,          setPending]          = useState([]);
  const [selected,         setSelected]         = useState(null);
  const [running,          setRunning]          = useState(true);   // always on
  const [autoMode,         setAutoMode]         = useState(false);  // auto-wave toggle
  const autoModeRef = useRef(false);
  const warModeRef  = useRef(false);
  const [loading,          setLoading]          = useState(false);
  const [apiStatus,        setApiStatus]        = useState("checking");
  const [aiStatus,         setAiStatus]         = useState("unknown"); // "online"|"offline"|"unknown"
  const [tab,              setTab]              = useState("feed");
  const [showRanges,       setShowRanges]       = useState(false);
  const [aircraftStatus,   setAircraftStatus]   = useState([]);
  const [shipStatus,       setShipStatus]       = useState(SHIPS.map(s => ({ ...s, sam_count: 10, ciws_rounds: 200 })));
  const shipStatusRef      = useRef(SHIPS.map(s => ({ ...s, sam_count: 10, ciws_rounds: 200 })));
  const [threatenedTargets,setThreatenedTargets]= useState(new Set());
  const [hitCities,        setHitCities]        = useState({});  // cityId → hit timestamp
  const [overrideBase,       setOverrideBase]       = useState({});
  const [waveLog,            setWaveLog]            = useState([]);
  const [forecast,           setForecast]           = useState(null);
  const [hoveredId,          setHoveredId]          = useState(null);
  const [expandedReasoning,  setExpandedReasoning]  = useState(new Set());
  const [sessionCost,        setSessionCost]        = useState(0);
  const [explosions,         setExplosions]         = useState([]);
  const [interceptedCount,  setInterceptedCount]   = useState(0);
  const [missedCount,       setMissedCount]        = useState(0);
  const [timeline,          setTimeline]           = useState([]);
  const [interceptors,      setInterceptors]      = useState([]);
  const [warMode,           setWarMode]           = useState(false);
  const frameRef    = useRef(null);
  const tickRef     = useRef(0);
  const threatPosRef = useRef({});
  const threatsRef   = useRef([]);    // always-current snapshot for interceptor collision checks
  const decidedThreatsRef  = useRef(new Set());   // tracks which threats have had callDecide fired
  const callDecideFnRef    = useRef(null);         // always-current callDecide (avoids stale closure in loop)
  const autoEngagedRef     = useRef(new Set());    // threats auto-engaged by ground/CIWS (no Gemini needed)
  const pendingThreatIds   = useRef(new Set());    // threat IDs currently awaiting human approval — no auto-fire
  const cityHitProcessed   = useRef(new Set());    // threat IDs whose city-hit explosion has been triggered
  const shipHitProcessed   = useRef(new Set());    // threat IDs that have hit a ship
  const [radarsActive,     setRadarsActive]     = useState(true);
  const radarsActiveRef    = useRef(true);
  const spyInPassageRef    = useRef(false);        // true when a spy aircraft is in the radar zone

  // Speed in SVG px/frame
  const INTERCEPT_SPEED = { fighter: 1.4, interceptor: 1.8, drone: 0.8, ship_sam: 2.0, ship_ciws: 2.8, ground_defense: 1.6 };

  const spawnInterceptor = (decision, threatObj) => {
    const assetType = decision.recommended_asset_type || "fighter";
    const platformId = decision.recommended_base;
    const tid = decision.threat_id;
    const cur = (tid && threatPosRef.current[tid]) || { x: threatObj?.x ?? 500, y: threatObj?.y ?? 650 };

    // Find launch origin: north base → ship → ground strip → nearest base fallback
    let origin = BASES.north.find(b => b.id === platformId)
              || SHIPS.find(s => s.id === platformId)
              || BASES.north.find(b => platformId?.startsWith(b.id));

    // Hard fallback: nearest north base to the threat (never silently bail)
    if (!origin) {
      origin = [...BASES.north].sort((a, b) => {
        const da = Math.hypot(a.x - cur.x, a.y - cur.y);
        const db = Math.hypot(b.x - cur.x, b.y - cur.y);
        return da - db;
      })[0];
    }
    if (!origin) return;

    const dx = cur.x - origin.x, dy = cur.y - origin.y;
    const len = Math.sqrt(dx*dx + dy*dy) || 1;
    const spd = INTERCEPT_SPEED[assetType] || 1.4;
    setInterceptors(p => [...p.slice(-14), {
      id: `icp-${decision.decision_id}-${Date.now()}`,
      assetType,
      weapon: decision.recommended_weapon || "",
      x: origin.x, y: origin.y,
      vx: (dx/len)*spd, vy: (dy/len)*spd,
      targetId: tid,
      baseId: platformId || origin.id,
      age: 0,
    }]);
  };

  const toggleReasoning = id => setExpandedReasoning(s => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  const markIntercepted = (threatId) => {
    const pos = threatPosRef.current[threatId];
    if (pos) {
      setExplosions(p => [...p.slice(-20), { id: `exp-${Date.now()}-${threatId}`, x: pos.x, y: pos.y, age: 0 }]);
    }
    setThreats(prev => {
      const th = prev.find(t => t.id === threatId);
      if (th && !th.intercepted) {
        setInterceptedCount(c => c + 1);
        setTimeline(t => [{
          id: `int-${threatId}-${Date.now()}`, type: "intercepted", time: Date.now(),
          label: `${th.type} intercepted → ${th.target_name}`,
          threatType: th.type,
        }, ...t.slice(0, 99)]);
      }
      return prev.map(t =>
        t.id === threatId && !t.intercepted
          ? { ...t, intercepted: true, intercepted_at: t.age, vx: (Math.random()-0.5)*2.5, vy: -(Math.random()*1.5+0.5) }
          : t
      );
    });
  };

  useEffect(() => {
    fetch(`${API}/`).then(r => setApiStatus(r.ok ? "online" : "offline")).catch(() => setApiStatus("offline"));
  }, []);

  useEffect(() => {
    const fetch_ = () =>
      fetch(`${API}/state/aircraft`).then(r => r.json())
        .then(d => { if (d.bases) setAircraftStatus(d.bases); }).catch(() => {});
      fetch(`${API}/state/summary`).then(r => r.json())
        .then(d => {
          if (d.ships) {
            // Backend returns x_km/y_km — add SVG pixel coords before storing
            const ships = d.ships.map(s => ({
              ...s,
              x: s.x_km * SCALE_X,
              y: s.y_km * SCALE_Y,
            }));
            setShipStatus(ships);
            shipStatusRef.current = ships;
          }
        }).catch(() => {});
    fetch_();
    const iv = setInterval(fetch_, 5000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    const fetch_ = () =>
      fetch(`${API}/state/summary`).then(r => r.json())
        .then(d => { if (d.session_costs) setSessionCost(d.session_costs.total_usd || 0); }).catch(() => {});
    const iv = setInterval(fetch_, 8000);
    return () => clearInterval(iv);
  }, []);

  // Poll pending approvals queue
  useEffect(() => {
    const fetch_ = () =>
      fetch(`${API}/pending`).then(r => r.json())
        .then(d => {
          if (d.pending) {
            setPending(d.pending);
            // Keep ref in sync so animation loop can check without stale closure
            pendingThreatIds.current = new Set(d.pending.map(p => p.threat?.id).filter(Boolean));
          }
        }).catch(() => {});
    fetch_();
    const iv = setInterval(fetch_, 2000);
    return () => clearInterval(iv);
  }, []);

  // No auto-approve — HOLD items stay until the human explicitly approves or rejects

  // Fetch wave forecast whenever waveLog changes (debounced to 30s minimum)
  useEffect(() => {
    if (waveLog.length === 0) return;
    const logWithNow = waveLog.map(w => ({ ...w, now: Date.now() }));
    fetch(`${API}/forecast`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wave_log: logWithNow, base_count: aircraftStatus.length }),
    }).then(r => r.json()).then(setForecast).catch(() => {});
  }, [waveLog]);

  useEffect(() => {
    const fetch_ = () =>
      fetch(`${API}/civilian`).then(r => r.json()).then(data => {
        if (data.flights?.length > 0) {
          const mapped = data.flights.slice(0, 6).map(f => ({
            id: f.callsign,
            x: ((f.lng - 10) / 14) * 1000, y: ((69 - f.lat) / 14) * 780,
            vx: Math.cos(f.heading * Math.PI / 180) * 1.2,
            vy: Math.sin(f.heading * Math.PI / 180) * 1.2,
            speed: f.speed, altitude: f.altitude, heading: f.heading, squawk: f.squawk,
          })).filter(f => f.x > 0 && f.x < 1000 && f.y > 0 && f.y < 780);
          if (mapped.length > 0) setCivilians(mapped);
        }
      }).catch(() => {});
    fetch_();
    const iv = setInterval(fetch_, 15000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    const loop = () => {
      tickRef.current++;
      const t = tickRef.current;
      // Auto-wave: only when AUTO mode is enabled
      if (autoModeRef.current && t % 280 === 0) spawnThreat();
      // Only spawn new civilians in peacetime; war mode clears and halts civilian traffic
      if (!warModeRef.current && t % 420 === 0) setCivilians(p => [...p.slice(-6), randomCivilian()]);
      // Spy flights: auto-spawn during wartime, every ~2700 frames (~45s), only if none active
      if (warModeRef.current && t % 2700 === 0 && !spyInPassageRef.current) spawnSpyFlight();

      setExplosions(prev => prev.map(e => ({ ...e, age: e.age + 1 })).filter(e => e.cityHit ? e.age < 90 : e.age < 55));

      setThreats(prev => {
        const next = prev.map(th => {
          if (th.intercepted) {
            return { ...th, x: th.x + th.vx, y: th.y + th.vy, vx: th.vx * 0.91, vy: th.vy + 0.18, age: th.age + 1 };
          }
          if (th.hit) {
            return { ...th, hit_age: (th.hit_age || 0) + 1 };
          }
          const moved = { ...th, x: th.x + th.vx, y: th.y + th.vy, age: th.age + 1 };
          // City impact — only for north city targets, not ships
          if (NORTH_CITY_IDS.has(th.target_id) &&
              Math.hypot(moved.x - th.target_x, moved.y - th.target_y) < 16) {
            return { ...moved, hit: true, hit_age: 0, x: th.target_x, y: th.target_y, vx: 0, vy: 0 };
          }
          return moved;
        }).filter(th => {
          if (th.intercepted) return (th.age - th.intercepted_at) < 90;
          if (th.hit)         return (th.hit_age || 0) < 80;
          return th.x > -40 && th.x < 1040 && th.y > -40 && th.y < 830;
        });

        // Keep refs up-to-date for interceptor logic
        const posMap = {};
        next.forEach(th => { posMap[th.id] = { x: th.x, y: th.y }; });
        threatPosRef.current = posMap;
        threatsRef.current = next;

        setThreatenedTargets(new Set(next.filter(th => !th.intercepted).map(th => th.target_id)));
        return next;
      });

      setCivilians(prev => {
        const moved = prev
          .map(c => ({ ...c, x: c.x + c.vx, y: c.y + c.vy }))
          .filter(c => c.x > -50 && c.x < 1050);

        // EMCON: spy aircraft in passage zone → silence radars
        const spyNowPresent = moved.some(c => c.isSpy && c.y > 280 && c.y < 590);
        if (spyNowPresent !== spyInPassageRef.current) {
          spyInPassageRef.current = spyNowPresent;
          radarsActiveRef.current = !spyNowPresent;
          setTimeout(() => {
            setRadarsActive(!spyNowPresent);
            setTimeline(tl => [{
              id: `emcon-${Date.now()}`, type: "emcon", time: Date.now(),
              label: spyNowPresent
                ? "⚠ EMCON: radars silenced — spy aircraft in range"
                : "✓ EMCON LIFTED: radars restored",
            }, ...tl.slice(0, 99)]);
          }, 0);
        }
        return moved;
      });
      // ── Radar detection (outside setThreats so state updater stays pure) ──────
      // Read current positions from ref — threatsRef updated synchronously above
      if (radarsActiveRef.current) {
        const nowDetected = [];
        threatsRef.current.forEach(th => {
          if (th.detected || th.intercepted || decidedThreatsRef.current.has(th.id)) return;
          for (const rad of RADAR_STATIONS) {
            const ddx = th.x - rad.x, ddy = th.y - rad.y;
            if (Math.sqrt(ddx*ddx + ddy*ddy) <= rad.range_svg) {
              decidedThreatsRef.current.add(th.id);
              // Overwrite stale spawn km coords with current SVG-derived position
              nowDetected.push({ ...th, x_km: th.x / SCALE_X, y_km: th.y / SCALE_Y });
              break;
            }
          }
        });
        if (nowDetected.length > 0) {
          // Mark as detected in state (pure updater — no side effects)
          const ids = new Set(nowDetected.map(th => th.id));
          setThreats(prev => prev.map(th => ids.has(th.id) ? { ...th, detected: true } : th));
          // Fire AI decisions and timeline events
          setTimeout(() => {
            nowDetected.forEach(th => {
              callDecideFnRef.current?.(th);
              setTimeline(tl => [{
                id: `th-${th.id}-${Date.now()}`, type: "threat", time: Date.now(),
                label: `RADAR CONTACT: ${th.type} → ${th.target_name}`, threatType: th.type,
              }, ...tl.slice(0, 99)]);
            });
          }, 0);
        }
      }

      // ── Auto-fire: ground SAM and ship CIWS — collect ALL new interceptors first,
      //    then add in ONE setInterceptors call (batching avoids React overwriting earlier ones)
      if (warModeRef.current) {
        const autoNew = [];
        threatsRef.current.forEach(th => {
          // Skip if not active, already handled, or radar already triggered a decision for this threat.
          // decidedThreatsRef is populated synchronously at detection — blocks auto-fire immediately,
          // before callDecide's HTTP response arrives (which can take 200ms+).
          if (!th.detected || th.intercepted || th.hit || autoEngagedRef.current.has(th.id)) return;
          if (decidedThreatsRef.current.has(th.id)) return; // a decision (AI or human) is in progress

          // Ground defense — nearest north base in range
          for (const base of BASES.north) {
            const dist = Math.hypot(th.x - base.x, th.y - base.y);
            if (dist <= GROUND_DEF_RANGE_SVG) {
              autoEngagedRef.current.add(th.id);
              const dx = th.x - base.x, dy = th.y - base.y, len = Math.hypot(dx, dy) || 1;
              autoNew.push({
                id: `gnd-${base.id}-${th.id}-${Date.now()}`,
                assetType: "ground_defense", weapon: "ground_cannon",
                x: base.x, y: base.y, vx: (dx/len)*1.6, vy: (dy/len)*1.6,
                targetId: th.id, baseId: base.id, age: 0,
              });
              break;
            }
          }
          if (autoEngagedRef.current.has(th.id)) return;

          // Ship SAM — fire-control radar: auto-engage any threat entering ship radar bubble
          for (const ship of SHIPS) {
            const st = shipStatusRef.current.find(s => s.id === ship.id);
            if (!st || (st.sam_count ?? 0) <= 0) continue;
            const dist = Math.hypot(th.x - ship.x, th.y - ship.y);
            if (dist <= SHIP_RADAR_RANGE_SVG) {
              autoEngagedRef.current.add(th.id);
              const dx = th.x - ship.x, dy = th.y - ship.y, len = Math.hypot(dx, dy) || 1;
              autoNew.push({
                id: `sam-${ship.id}-${th.id}-${Date.now()}`,
                assetType: "ship_sam", weapon: "ship_sam",
                x: ship.x, y: ship.y, vx: (dx/len)*2.0, vy: (dy/len)*2.0,
                targetId: th.id, baseId: ship.id, age: 0,
              });
              // Decrement locally — backend syncs on next poll
              const updated = shipStatusRef.current.map(s =>
                s.id === ship.id ? { ...s, sam_count: Math.max(0, s.sam_count - 1) } : s
              );
              shipStatusRef.current = updated;
              setShipStatus(updated);
              break;
            }
          }
          if (autoEngagedRef.current.has(th.id)) return;

          // Ship CIWS — last resort at very close range
          for (const ship of SHIPS) {
            const st = shipStatusRef.current.find(s => s.id === ship.id);
            if (!st || (st.ciws_rounds ?? 200) <= 0) continue;
            const dist = Math.hypot(th.x - ship.x, th.y - ship.y);
            if (dist <= CIWS_RANGE_SVG) {
              autoEngagedRef.current.add(th.id);
              const dx = th.x - ship.x, dy = th.y - ship.y, len = Math.hypot(dx, dy) || 1;
              autoNew.push({
                id: `ciws-${ship.id}-${th.id}-${Date.now()}`,
                assetType: "ship_ciws", weapon: "ship_ciws",
                x: ship.x, y: ship.y, vx: (dx/len)*2.8, vy: (dy/len)*2.8,
                targetId: th.id, baseId: ship.id, age: 0,
              });
              break;
            }
          }
        });
        // Single batched update — all new auto-fire interceptors in one call
        if (autoNew.length > 0) {
          setInterceptors(p => [...p, ...autoNew].slice(-20));
        }
      }

      // ── City impact detection (outside setThreats to keep updater pure) ──────
      {
        const justHit = [];
        threatsRef.current.forEach(th => {
          if (th.hit && !cityHitProcessed.current.has(th.id) && NORTH_CITY_IDS.has(th.target_id)) {
            cityHitProcessed.current.add(th.id);
            justHit.push(th);
          }
        });
        if (justHit.length > 0) {
          setTimeout(() => {
            justHit.forEach(th => {
              setMissedCount(c => c + 1);
              // Large city-strike explosion
              setExplosions(p => [...p.slice(-20),
                { id: `city-${th.id}-${Date.now()}`, x: th.target_x, y: th.target_y, age: 0, cityHit: true },
              ]);
              setHitCities(h => ({ ...h, [th.target_id]: Date.now() }));
              setTimeline(tl => [{
                id: `hit-${th.id}-${Date.now()}`, type: "missed", time: Date.now(),
                label: `${th.type} STRUCK ${th.target_name}`, threatType: th.type,
              }, ...tl.slice(0, 99)]);
            });
          }, 0);
        }
      }

      // ── Ship hit detection ────────────────────────────────────────────────────
      {
        const shipHits = []; // { shipId, x, y }
        threatsRef.current.forEach(th => {
          // Skip: already intercepted, already processed as ship/city hit, or targeting a north city
          if (th.intercepted || shipHitProcessed.current.has(th.id) || NORTH_CITY_IDS.has(th.target_id)) return;
          for (const ship of SHIPS) {
            if (Math.hypot(th.x - ship.x, th.y - ship.y) < SHIP_HIT_RADIUS) {
              shipHitProcessed.current.add(th.id);
              cityHitProcessed.current.add(th.id); // prevent city-impact path from also firing
              shipHits.push({ shipId: ship.id, threatId: th.id, x: ship.x, y: ship.y, type: th.type });
              break;
            }
          }
        });
        if (shipHits.length > 0) {
          // Mark threats as hit at ship position
          const hitIds = new Set(shipHits.map(h => h.threatId));
          setThreats(prev => prev.map(th =>
            hitIds.has(th.id) ? { ...th, hit: true, hit_age: 0, x: th.x, y: th.y, vx: 0, vy: 0 } : th
          ));
          setTimeout(() => {
            shipHits.forEach(h => {
              // Damage ship — decrement SAMs
              setShipStatus(prev => prev.map(s =>
                s.id === h.shipId
                  ? { ...s, sam_count: Math.max(0, (s.sam_count || 0) - 4), ciws_rounds: Math.max(0, (s.ciws_rounds ?? 200) - 80) }
                  : s
              ));
              setExplosions(p => [...p.slice(-20),
                { id: `ship-hit-${h.threatId}-${Date.now()}`, x: h.x, y: h.y, age: 0, cityHit: true },
              ]);
              setMissedCount(c => c + 1);
              setTimeline(tl => [{
                id: `shiphit-${h.threatId}-${Date.now()}`, type: "missed", time: Date.now(),
                label: `${h.type} STRUCK ${h.shipId} — ship damaged!`, threatType: h.type,
              }, ...tl.slice(0, 99)]);
            });
          }, 0);
        }
      }

      setIntercepts(prev => prev.map(i => ({ ...i, age: i.age + 1 })).filter(i => i.age < 160));

      // Move interceptors with homing guidance — steer toward threat's current position each frame
      setInterceptors(prev => {
        const hit = new Set();
        const moved = prev.map(icp => {
          const curPos = threatPosRef.current[icp.targetId];
          // If threat no longer tracked (intercepted/gone), keep coasting
          if (!curPos) {
            return { ...icp, x: icp.x + icp.vx, y: icp.y + icp.vy, age: icp.age + 1 };
          }
          const dx = curPos.x - icp.x, dy = curPos.y - icp.y;
          const dist = Math.sqrt(dx*dx + dy*dy);
          if (dist < 28) {
            // Close enough — intercept
            markIntercepted(icp.targetId);
            hit.add(icp.id);
            return icp;
          }
          // Recalculate velocity toward current threat position (homing)
          const spd = INTERCEPT_SPEED[icp.assetType] || 1.4;
          const vx = (dx/dist) * spd;
          const vy = (dy/dist) * spd;
          return { ...icp, x: icp.x + vx, y: icp.y + vy, vx, vy, age: icp.age + 1 };
        });
        return moved.filter(i => !hit.has(i.id) && i.age < 600 && i.x > -100 && i.x < 1100 && i.y > -100 && i.y < 900);
      });
      frameRef.current = requestAnimationFrame(loop);
    };
    frameRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameRef.current);
  }, []);  // runs once — always on

  const spawnThreat = () => {
    const th = randomThreat();
    setThreats(p => [...p.slice(-15), th]);
    // callDecide fires when th enters radar range (handled in animation loop)
    setWaveLog(w => [...w, { time: Date.now(), count: 1, targets: [th.target_name], types: [th.type], outcomes: [] }]);
  };

  const spawnSpyFlight = () => {
    // Reconnaissance aircraft crosses the passage laterally — triggers EMCON
    const fromLeft = Math.random() > 0.5;
    const recId = `REC-${Math.floor(Math.random() * 90 + 10)}`;
    setCivilians(p => [...p.slice(-8), {
      id: recId,
      isSpy: true,
      x: fromLeft ? -15 : 1015,
      y: 310 + Math.random() * 100,   // passage zone — inside radar range
      vx: fromLeft ? 2.2 : -2.2,
      vy: (Math.random() - 0.5) * 0.3,
      speed: 820, altitude: 12000, heading: fromLeft ? 90 : 270, squawk: "none",
    }]);
    setTimeline(tl => [{
      id: `spy-${Date.now()}`, type: "emcon", time: Date.now(),
      label: `ELINT WARNING: reconnaissance aircraft ${recId} entering passage`,
    }, ...tl.slice(0, 99)]);
  };

  const handleApprove = async (decisionId) => {
    const override = overrideBase[decisionId];
    const url = `${API}/approve/${decisionId}${override ? `?override_base=${override}` : ""}`;
    try {
      await fetch(url, { method: "POST" });
      // Move from pending to decisions feed
      const item = pending.find(p => p.decision_id === decisionId);
      if (item) {
        const d = { ...item.decision, decision_id: item.decision_id, threat_id: item.threat.id,
                    threat_type: item.threat.type, timestamp: item.created_at, status: "approved" };
        const base = ALL_BASES.find(b => b.id === (override || d.recommended_base));
        if (base) setIntercepts(p => [...p.slice(-12), { id: d.decision_id, x1: base.x, y1: base.y, x2: item.threat.x, y2: item.threat.y, age: 0 }]);
        spawnInterceptor({ ...d, recommended_base: override || d.recommended_base, threat_id: item.threat.id }, item.threat);
        setDecisions(p => [d, ...p.slice(0, 19)]);
      }
      setPending(p => {
        const updated = p.filter(x => x.decision_id !== decisionId);
        pendingThreatIds.current = new Set(updated.map(x => x.threat?.id).filter(Boolean));
        return updated;
      });
      setOverrideBase(o => { const n = { ...o }; delete n[decisionId]; return n; });
    } catch (e) { console.error(e); }
  };

  const handleReject = async (decisionId) => {
    try {
      await fetch(`${API}/reject/${decisionId}`, { method: "POST" });
      setPending(p => {
        const updated = p.filter(x => x.decision_id !== decisionId);
        pendingThreatIds.current = new Set(updated.map(x => x.threat?.id).filter(Boolean));
        return updated;
      });
    } catch (e) { console.error(e); }
  };

  const callDecide = async (threat) => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/decide`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(threat),
      });
      const d = await res.json();
      // Track whether Gemini is actually responding (fallback flag means AI is down)
      setAiStatus(d.fallback ? "offline" : "online");
      if (d.status === "pending_approval") {
        // Block auto-fire immediately — don't wait for next 2s poll cycle
        pendingThreatIds.current.add(threat.id);
        setTab("feed");
      } else {
        const base = ALL_BASES.find(b => b.id === d.recommended_base);
        if (base) setIntercepts(p => [...p.slice(-12), { id: d.decision_id, x1: base.x, y1: base.y, x2: threat.x, y2: threat.y, age: 0 }]);
        spawnInterceptor(d, threat);
        setDecisions(p => [d, ...p.slice(0, 19)]);
      }
    } catch {
      // Backend offline — spatial fallback: pick nearest north base
      const sorted = BASES.north.map(b => {
        const dx = b.x - threat.x, dy = b.y - threat.y;
        return { base: b, dist: Math.sqrt(dx*dx + dy*dy) };
      }).sort((a,b) => a.dist - b.dist);
      const base = sorted[0].base;
      const mock = {
        decision_id: `D${String(Math.floor(Math.random()*9999)).padStart(4,"0")}`,
        threat_id: threat.id, threat_type: threat.type,
        recommended_base: base.id, recommended_base_name: base.name,
        recommended_asset_type: "fighter", recommended_weapon: "long_range_missile",
        confidence: 38 + Math.floor(Math.random() * 28),  // 38–65%: ~40% go to HOLD
        reasoning: `Offline fallback: ${base.name} selected as nearest base (${Math.round(sorted[0].dist)} SVG units).`,
        alternatives_rejected: [], trade_offs: "No AI coverage analysis — operating offline.",
        civilian_risk: threat.civilian_nearby ? "medium" : "none", civilian_note: "",
        future_risk: "Reconnect backend for full AI decision support.",
        priority: "urgent", timestamp: Date.now() / 1000,
        status: "auto_executed",
      };
      setIntercepts(p => [...p.slice(-12), { id: mock.decision_id, x1: base.x, y1: base.y, x2: threat.x, y2: threat.y, age: 0 }]);
      spawnInterceptor(mock, threat);  // also spawn interceptor in offline mode
      setDecisions(p => [mock, ...p.slice(0, 19)]);
    }
    setLoading(false);
  };
  // Always-current ref so animation loop can call callDecide without stale closure
  callDecideFnRef.current = callDecide;

  const injectThreat = () => { const th = randomThreat(); setThreats(p => [...p.slice(-15), th]); /* radar handles callDecide */ };

  const injectScenario = () => {
    // Variable wave size 2–7
    const waveSize = 2 + Math.floor(Math.random() * 6);

    // Attack strategy — varies each wave based on prior pattern
    const strategy = Math.random();
    let targetPool;
    if (strategy < 0.30) {
      // Saturation: all threats on one city (pressure one defense node)
      const primary = TARGETS.north[Math.floor(Math.random() * TARGETS.north.length)];
      targetPool = Array(waveSize).fill(primary);
    } else if (strategy < 0.60) {
      // Focused: ~70% on one city, rest on another
      const primary   = TARGETS.north[Math.floor(Math.random() * TARGETS.north.length)];
      const secondary = TARGETS.north.filter(t => t.id !== primary.id)[Math.floor(Math.random() * 2)];
      targetPool = Array.from({ length: waveSize }, (_, i) =>
        Math.random() < 0.70 ? primary : secondary
      );
    } else {
      // Dispersal: random mix across all north cities
      targetPool = Array.from({ length: waveSize }, () =>
        TARGETS.north[Math.floor(Math.random() * TARGETS.north.length)]
      );
    }

    // Threat type composition — weight by wave number (escalation)
    const MISSILE_TYPES  = ["Ballistic missile", "Cruise missile"];
    const AIRCRAFT_TYPES = ["Strike aircraft", "Fighter jet"];
    const ALL_TYPES      = [...MISSILE_TYPES, ...AIRCRAFT_TYPES, "Armed drone"];
    const waveTypes = Array.from({ length: waveSize }, () =>
      ALL_TYPES[Math.floor(Math.random() * ALL_TYPES.length)]
    );

    // Occasionally retarget some threats toward ships (naval interdiction)
    // ~20% chance per threat after wave 2, ships add a layer of tactical complexity
    const activeShips = shipStatus.filter(s => s.sam_count > 0);
    const finalTargets = targetPool.map(t => {
      if (activeShips.length > 0 && waveLog.length >= 1 && Math.random() < 0.20) {
        const ship = activeShips[Math.floor(Math.random() * activeShips.length)];
        // Return a ship-as-target object compatible with spawnTowardTarget
        return { id: ship.id, name: ship.name, x: ship.x, y: ship.y, x_km: ship.x_km, y_km: ship.y_km };
      }
      return t;
    });

    // Spawn positions spread across full south border
    const wave = finalTargets.map((target, i) => {
      const spawnX = 30 + Math.random() * 940;
      const spawnY = 660 + Math.random() * 60;
      return spawnTowardTarget(spawnX, spawnY, target, waveTypes[i]);
    });

    wave.forEach((th, i) => {
      setTimeout(() => { setThreats(p => [...p.slice(-20), th]); }, i * 500);
    });

    // Activate war mode on first wave
    if (!warModeRef.current) {
      warModeRef.current = true;
      setWarMode(true);
      setTimeout(() => {
        setCivilians(prev => prev.slice(0, 1));
      }, 3000);
    }

    const newEntry = {
      time: Date.now(),
      count: wave.length,
      targets: wave.map(t => t.target_name),
      types:   waveTypes,
      outcomes: [],  // filled in after intercept results
    };
    setWaveLog(w => {
      const updated = [...w, newEntry];
      setTimeout(() => {
        fetch(`${API}/forecast`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ wave_log: updated.map(x => ({...x, now: Date.now()})), base_count: 3 }),
        }).then(r => r.json()).then(setForecast).catch(() => {});
      }, 800);
      return updated;
    });
    setTimeline(t => [{
      id: `wave-${Date.now()}`, type: "wave", time: Date.now(),
      label: `Wave ${waveLog.length + 1}: ${wave.length} threats — ${[...new Set(wave.map(t => t.target_name))].join(", ")}`,
    }, ...t.slice(0, 99)]);
  };

  const northStatus = aircraftStatus.filter(b => BASES.north.find(nb => nb.id === b.id));
  const coverageGaps = northStatus.filter(b => b.available.length === 0).map(b => b.id);
  const RANGE_SVG = 700 * SCALE_X;

  // Highlight state — derived from whichever card is hovered
  const hl = (() => {
    if (!hoveredId) return null;
    const d = decisions.find(x => x.decision_id === hoveredId);
    if (d) return { baseId: d.recommended_base, threatId: d.threat_id };
    const p = pending.find(x => x.decision_id === hoveredId);
    if (p) return { baseId: p.decision?.recommended_base, threatId: p.threat?.id };
    return null;
  })();
  const dim = hl !== null;

  return (
    <div style={{ fontFamily: "'Courier New', monospace", background: "#06182e", color: "#ddeef8", minHeight: "100vh", display: "flex", flexDirection: "column", fontSize: 13 }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 16px", borderBottom: "1px solid #1a3a56", background: "#09203a", flexWrap: "wrap", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#4ade80", boxShadow: "0 0 8px #4ade8066", flexShrink: 0 }} />
          <span style={{ fontSize: 10, letterSpacing: 3, color: "#6ab4d8", fontWeight: "bold" }}>BOREAL PASSAGE AIR DEFENSE COMMAND</span>
          <span style={{ fontSize: 9, padding: "2px 7px", background: apiStatus === "online" ? "#0d3020" : "#301010", color: apiStatus === "online" ? "#4ade80" : "#f87171", border: `1px solid ${apiStatus === "online" ? "#4ade80" : "#f87171"}44`, borderRadius: 2, letterSpacing: 1 }}>
            API {apiStatus.toUpperCase()}
          </span>
          <span style={{ fontSize: 9, padding: "2px 7px", background: aiStatus === "online" ? "#0d3020" : aiStatus === "offline" ? "#2a1800" : "#101830", color: aiStatus === "online" ? "#4ade80" : aiStatus === "offline" ? "#facc15" : "#5a8ab0", border: `1px solid ${aiStatus === "online" ? "#4ade8044" : aiStatus === "offline" ? "#facc1566" : "#1e3a5644"}`, borderRadius: 2, letterSpacing: 1 }}>
            AI {aiStatus === "online" ? "ONLINE" : aiStatus === "offline" ? "⚠ OFFLINE — FALLBACK" : "…"}
          </span>
          <span style={{ fontSize: 9, padding: "2px 8px", background: warMode ? "#2a0808" : "#0a1e12", color: warMode ? "#f87171" : "#4ade80", border: `1px solid ${warMode ? "#f87171" : "#4ade80"}44`, borderRadius: 2, letterSpacing: 1 }}>
            {warMode ? "⚠ AIRSPACE CLOSED" : "✓ AIRSPACE OPEN"}
          </span>
          {!radarsActive && (
            <span style={{ fontSize: 9, padding: "2px 8px", background: "#2a1800", color: "#facc15", border: "1px solid #facc1566", borderRadius: 2, letterSpacing: 1, fontWeight: "bold" }}>
              ⚠ EMCON — RADARS SILENT
            </span>
          )}
          {coverageGaps.length > 0 && (
            <span style={{ fontSize: 9, padding: "2px 7px", background: "#2a1500", color: "#f87171", border: "1px solid #f87171", letterSpacing: 1 }}>
              ⚠ BASE DEPLETED: {coverageGaps.join(" ")}
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={() => setShowRanges(r => !r)}
            style={{ background: showRanges ? "#0d2a44" : "#0a1e32", border: `1px solid ${showRanges ? "#3fc1ff" : "#1e4060"}`, color: showRanges ? "#3fc1ff" : "#6aaac8", padding: "5px 12px", fontSize: 9, letterSpacing: 1, cursor: "pointer", borderRadius: 3 }}>
            ◎ RANGES
          </button>
          <button onClick={injectThreat}
            style={{ background: "#2a0e0e", border: "1px solid #f87171", color: "#f87171", padding: "5px 14px", fontSize: 9, letterSpacing: 2, cursor: "pointer", borderRadius: 3 }}>
            + THREAT
          </button>
          <button onClick={spawnSpyFlight}
            style={{ background: "#1a1400", border: "1px solid #facc1566", color: "#a08800", padding: "5px 12px", fontSize: 9, letterSpacing: 1, cursor: "pointer", borderRadius: 3 }}>
            ◇ SPY RECON
          </button>
          <button onClick={injectScenario}
            style={{ background: "#2a2000", border: "2px solid #facc15", color: "#facc15", padding: "5px 18px", fontSize: 10, letterSpacing: 2, cursor: "pointer", borderRadius: 3, fontWeight: "bold" }}>
            ⚡ LAUNCH WAVE
          </button>
        </div>
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* ── MAP ── */}
        <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
          <svg width="100%" viewBox="0 0 1000 780" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
                <path d="M 50 0 L 0 0 0 50" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="0.5" />
              </pattern>
              <radialGradient id="threatGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#f87171" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#f87171" stopOpacity="0" />
              </radialGradient>
            </defs>

            <rect width="1000" height="780" fill="#0b2240" />
            <rect width="1000" height="780" fill="url(#grid)" />

            {/* North land */}
            <g transform="translate(0,-40)">
              <polygon fill="#1e4020" stroke="#0d1a0d" strokeWidth="1.5"
                points="0,40 1000,40 1000,210 920,228 860,214 800,210 742,245 678,230 616,218 556,252 488,234 428,228 366,260 302,232 236,240 178,270 118,244 54,252 0,268" />
              <polygon fill="#1e4020" stroke="#0d1a0d" strokeWidth="1"
                points="355,308 378,296 410,298 424,318 436,336 426,362 406,368 386,374 362,358 354,338" />
              <polygon fill="#1e4020" stroke="#0d1a0d" strokeWidth="1"
                points="678,254 692,244 710,248 716,264 722,278 712,294 696,296 680,298 668,284 668,268" />
              <polygon fill="#1e4020" stroke="#0d1a0d" strokeWidth="1.2"
                points="148,395 160,382 180,378 196,386 212,394 220,412 216,430 198,456 182,454 166,452 152,438 148,420" />
            </g>

            {/* South land */}
            <g transform="translate(0,40)">
              <polygon fill="#2e2810" stroke="#181208" strokeWidth="1.5"
                points="0,740 1000,740 1000,600 948,576 882,588 818,602 756,568 688,582 624,600 560,566 492,586 428,606 362,572 294,582 232,608 168,578 98,590 30,608 0,598" />
              <polygon fill="#2e2810" stroke="#181208" strokeWidth="1"
                points="818,388 842,376 870,382 876,402 882,420 866,440 846,440 826,440 810,424 812,406" />
              <polygon fill="#2e2810" stroke="#181208" strokeWidth="1"
                points="238,494 256,482 276,488 280,506 284,522 270,536 253,536 236,534 224,520 226,504" />
              <polygon fill="#2e2810" stroke="#181208" strokeWidth="1"
                points="530,496 546,480 568,466 566,444 564,424 542,416 526,430 510,444 510,478 530,496" />
            </g>

            {/* Country / passage labels */}
            <text x="500" y="28"  fill="rgba(160,220,160,0.35)" fontSize="10" fontWeight="bold" textAnchor="middle" letterSpacing="5">COUNTRY X — NORTHERN TERRITORIES</text>
            <text x="500" y="770" fill="rgba(220,200,140,0.35)" fontSize="10" fontWeight="bold" textAnchor="middle" letterSpacing="5">COUNTRY Y — SOUTHERN UNION</text>
            <text x="500" y="410" fill="rgba(180,210,240,0.08)" fontSize="28" fontWeight="bold" textAnchor="middle" letterSpacing="6">THE BOREAL PASSAGE</text>

            {/* Range rings */}
            {showRanges && BASES.north.map(b => (
              <g key={`rng-${b.id}`}>
                <circle cx={b.x} cy={b.y} r={RANGE_SVG} fill="none" stroke="#3fc1ff" strokeWidth="0.6" strokeDasharray="6 5" opacity="0.18" />
                <text x={b.x} y={b.y - RANGE_SVG + 11} fill="rgba(63,193,255,0.25)" fontSize="7" textAnchor="middle">700 km</text>
              </g>
            ))}

            {/* Radar stations — on the north passage islands */}
            {RADAR_STATIONS.map((rad, ri) => {
              const col = radarsActive ? "#22c55e" : "#facc15";
              const colFade = radarsActive ? "rgba(34,197,94," : "rgba(250,204,21,";
              return (
                <g key={rad.id} opacity={radarsActive ? 0.8 : 0.6}>
                  {/* Detection range ring */}
                  <circle cx={rad.x} cy={rad.y} r={rad.range_svg} fill="none" stroke={col} strokeWidth="0.7"
                    strokeDasharray={radarsActive ? "8 6" : "4 4"} opacity={radarsActive ? 0.16 : 0.22}>
                    <animate attributeName="opacity"
                      values={radarsActive ? "0.12;0.22;0.12" : "0.18;0.08;0.18"}
                      dur={`${3 + ri * 0.7}s`} repeatCount="indefinite" />
                  </circle>
                  {/* Sweep line — only when radars active */}
                  {radarsActive && (
                    <line x1={rad.x} y1={rad.y} x2={rad.x} y2={rad.y - rad.range_svg}
                      stroke={col} strokeWidth="1" opacity="0.2" strokeLinecap="round">
                      <animateTransform attributeName="transform" type="rotate"
                        from={`0 ${rad.x} ${rad.y}`} to={`360 ${rad.x} ${rad.y}`}
                        dur={`${5 + ri}s`} repeatCount="indefinite" />
                    </line>
                  )}
                  {/* Station icon */}
                  <circle cx={rad.x} cy={rad.y} r="4" fill={col} opacity="0.6" />
                  <line x1={rad.x} y1={rad.y - 4} x2={rad.x} y2={rad.y - 10} stroke={col} strokeWidth="1" opacity="0.7" />
                  <line x1={rad.x - 5} y1={rad.y - 9} x2={rad.x + 5} y2={rad.y - 9} stroke={col} strokeWidth="0.8" opacity="0.7" />
                  <text x={rad.x + 7} y={rad.y + 3} fill={`${colFade}0.55)`} fontSize="6" letterSpacing="0.5">
                    {radarsActive ? rad.label : "EMCON"}
                  </text>
                </g>
              );
            })}

            {/* Threat trajectory lines — only for detected threats */}
            {threats.filter(th => th.detected).map(th => {
              const isHl = hl?.threatId === th.id;
              return (
                <line key={`traj-${th.id}`} x1={th.x} y1={th.y} x2={th.target_x} y2={th.target_y}
                  stroke={isHl ? "#f87171" : "rgba(248,113,113,0.14)"}
                  strokeWidth={isHl ? 1.5 : 1} strokeDasharray="5 7"
                  opacity={dim && !isHl ? 0.06 : 1} />
              );
            })}

            {/* Intercept lines */}
            {intercepts.map(i => {
              const isHl = i.id === hoveredId;
              const baseOpacity = Math.max(0, 1 - i.age / 160);
              return (
                <line key={i.id} x1={i.x1} y1={i.y1} x2={i.x2} y2={i.y2}
                  stroke={isHl ? "#facc15" : "#facc15"} strokeWidth={isHl ? 2 : 1}
                  strokeDasharray="5 3"
                  opacity={dim ? (isHl ? Math.min(1, baseOpacity * 3) : 0.05) : baseOpacity} />
              );
            })}

            {/* North protection targets */}
            {TARGETS.north.map(t => {
              const sz = t.type === "capital" ? 18 : 13;
              const cx = t.x, cy = t.y;
              const threatened = threatenedTargets.has(t.id);
              const hitTs = hitCities[t.id];
              const isHit = hitTs && (Date.now() - hitTs) < 8000;  // 8s damage flash
              const targetDim = dim ? 0.25 : 1;
              return (
                <g key={t.id} opacity={targetDim} style={{ transition: "opacity 0.25s" }}>
                  {/* Threat warning ring */}
                  {threatened && !isHit && <circle cx={cx} cy={cy} r={sz * 1.9} fill="none" stroke="#f87171" strokeWidth="1" strokeDasharray="3 3" opacity="0.65" />}
                  {/* City-hit damage ring — red pulsing */}
                  {isHit && (
                    <circle cx={cx} cy={cy} r={sz * 2.8} fill="none" stroke="#f87171" strokeWidth="2" opacity="0.8">
                      <animate attributeName="r" values={`${sz*2};${sz*4};${sz*2}`} dur="0.8s" repeatCount="indefinite" />
                      <animate attributeName="opacity" values="0.8;0.1;0.8" dur="0.8s" repeatCount="indefinite" />
                    </circle>
                  )}
                  <rect x={cx - sz/2} y={cy - sz/2} width={sz} height={sz}
                    fill={isHit ? "#f87171" : t.type === "capital" ? "#ffcc00" : "#dde"}
                    stroke={isHit ? "#ff0000" : threatened ? "#f87171" : "#111"}
                    strokeWidth={isHit ? 3 : threatened ? 2 : (t.type === "capital" ? 1.8 : 1.2)} rx="2">
                    {isHit && <animate attributeName="fill" values="#f87171;#ff0000;#f87171" dur="0.5s" repeatCount="indefinite" />}
                  </rect>
                  {isHit && <text x={cx} y={cy + 3} fill="#fff" fontSize="8" textAnchor="middle" fontWeight="bold">✕</text>}
                  <text x={cx} y={cy + sz/2 + 9}
                    fill={isHit ? "#f87171" : t.type === "capital" ? "rgba(255,204,0,0.8)" : "rgba(230,230,255,0.5)"}
                    fontSize="6.5" textAnchor="middle" letterSpacing="0.3" fontWeight={isHit ? "bold" : "normal"}>
                    {isHit ? `${t.name.toUpperCase()} HIT` : t.name.toUpperCase()}
                  </text>
                </g>
              );
            })}

            {/* South targets (enemy side — dimmed) */}
            {TARGETS.south.map(t => {
              const sz = t.type === "capital" ? 16 : 11;
              return (
                <g key={t.id} opacity="0.45">
                  <rect x={t.x - sz/2} y={t.y - sz/2} width={sz} height={sz}
                    fill={t.type === "capital" ? "#cc9900" : "#998"} stroke="#111"
                    strokeWidth={t.type === "capital" ? 1.5 : 1} rx="2" />
                  <text x={t.x} y={t.y + sz/2 + 9} fill="rgba(200,190,140,0.4)" fontSize="6.5" textAnchor="middle">
                    {t.name.toUpperCase()}
                  </text>
                </g>
              );
            })}

            {/* North bases */}
            {BASES.north.map(b => {
              const st = aircraftStatus.find(s => s.id === b.id);
              const avail = st ? st.available.length : null;
              const depleted = avail === 0;
              const col = depleted ? "#f87171" : "#3fc1ff";
              const isHl = hl?.baseId === b.id;
              return (
                <g key={b.id} opacity={dim && !isHl ? 0.1 : 1} style={{ transition: "opacity 0.25s" }}>
                  {isHl && (
                    <circle cx={b.x} cy={b.y} r="32" fill="none" stroke="#3fc1ff" strokeWidth="1.5" opacity="0.5">
                      <animate attributeName="r" values="28;40;28" dur="1.4s" repeatCount="indefinite" />
                      <animate attributeName="opacity" values="0.5;0.1;0.5" dur="1.4s" repeatCount="indefinite" />
                    </circle>
                  )}
                  {/* Ground SAM engagement ring */}
                  <circle cx={b.x} cy={b.y} r={GROUND_DEF_RANGE_SVG} fill="none"
                    stroke="#facc15" strokeWidth={showRanges ? 0.7 : 0.3}
                    strokeDasharray="4 6" opacity={showRanges ? 0.2 : 0.06} />
                  <circle cx={b.x} cy={b.y} r="26" fill="none" stroke={col} strokeWidth={isHl ? 1.2 : 0.5} strokeDasharray="4 3" opacity={isHl ? 0.7 : 0.35} />
                  <polygon points={`${b.x},${b.y-11} ${b.x-9},${b.y+6} ${b.x+9},${b.y+6}`} fill={col} stroke="#000" strokeWidth="1" />
                  <text x={b.x} y={b.y+22} fill={col} fontSize="7" textAnchor="middle" opacity="0.85">{b.name}</text>
                  {avail !== null && (
                    <text x={b.x+13} y={b.y-7} fill={col} fontSize="8" textAnchor="middle" fontWeight="bold">{avail}</text>
                  )}
                  {/* Ground defense SAM battery icon — south side of base */}
                  {(() => {
                    const gndAmmo = st?.ground_ammo ?? 8;
                    const gcol = gndAmmo > 3 ? "#facc15" : gndAmmo > 0 ? "#f97316" : "#f87171";
                    return (
                      <g opacity={0.85}>
                        {/* SAM launcher arms */}
                        <line x1={b.x - 8} y1={b.y + 8} x2={b.x - 8} y2={b.y + 14} stroke={gcol} strokeWidth="1.5" />
                        <line x1={b.x - 8} y1={b.y + 11} x2={b.x - 3} y2={b.y + 7} stroke={gcol} strokeWidth="1" />
                        <line x1={b.x + 8} y1={b.y + 8} x2={b.x + 8} y2={b.y + 14} stroke={gcol} strokeWidth="1.5" />
                        <line x1={b.x + 8} y1={b.y + 11} x2={b.x + 3} y2={b.y + 7} stroke={gcol} strokeWidth="1" />
                        <text x={b.x} y={b.y + 32} fill={gcol} fontSize="5.5" textAnchor="middle" letterSpacing="0.5">
                          GND ×{gndAmmo}
                        </text>
                      </g>
                    );
                  })()}
                </g>
              );
            })}

            {/* South bases (enemy — dim) */}
            {BASES.south.map(b => (
              <g key={b.id} opacity={dim ? 0.06 : 0.55} style={{ transition: "opacity 0.25s" }}>
                <circle cx={b.x} cy={b.y} r="22" fill="none" stroke="#ff8855" strokeWidth="0.5" strokeDasharray="4 3" opacity="0.3" />
                <polygon points={`${b.x},${b.y-11} ${b.x-9},${b.y+6} ${b.x+9},${b.y+6}`} fill="#ff8855" stroke="#000" strokeWidth="1" />
                <text x={b.x} y={b.y+22} fill="#ff8855" fontSize="7" textAnchor="middle" opacity="0.7">{b.name}</text>
              </g>
            ))}

            {/* Naval ships — in the Boreal Passage */}
            {shipStatus.map(ship => {
              const depleted = ship.sam_count === 0;
              const col = depleted ? "#f87171" : "#38bdf8";
              return (
                <g key={ship.id} opacity={dim ? 0.15 : 1}>
                  {/* Max SAM range — outer ring, only when showRanges */}
                  {showRanges && (
                    <circle cx={ship.x} cy={ship.y} r={SHIP_SAM_RANGE_SVG} fill="none"
                      stroke={col} strokeWidth="0.5" strokeDasharray="8 6" opacity="0.12" />
                  )}
                  {/* Fire-control radar ring — always visible, pulsing */}
                  <circle cx={ship.x} cy={ship.y} r={SHIP_RADAR_RANGE_SVG} fill="none"
                    stroke={col} strokeWidth="0.7" strokeDasharray="5 4"
                    opacity={depleted ? 0.05 : 0.18}>
                    <animate attributeName="opacity" values="0.12;0.25;0.12" dur="3s" repeatCount="indefinite" />
                  </circle>
                  {/* Rotating radar sweep — fire-control radar */}
                  {!depleted && (
                    <line x1={ship.x} y1={ship.y} x2={ship.x} y2={ship.y - SHIP_RADAR_RANGE_SVG}
                      stroke={col} strokeWidth="1" opacity="0.25" strokeLinecap="round">
                      <animateTransform attributeName="transform" type="rotate"
                        from={`0 ${ship.x} ${ship.y}`} to={`360 ${ship.x} ${ship.y}`}
                        dur="4s" repeatCount="indefinite" />
                    </line>
                  )}
                  {/* Ship hull — proper vessel silhouette */}
                  <polygon
                    points={`${ship.x+16},${ship.y+3} ${ship.x+18},${ship.y} ${ship.x+16},${ship.y-3} ${ship.x-14},${ship.y-3} ${ship.x-18},${ship.y} ${ship.x-14},${ship.y+3}`}
                    fill={col} fillOpacity="0.15" stroke={col} strokeWidth="1.2" />
                  {/* Bridge / superstructure */}
                  <rect x={ship.x - 4} y={ship.y - 7} width="10" height="4"
                    fill={col} fillOpacity="0.3" stroke={col} strokeWidth="0.8" />
                  {/* Mast */}
                  <line x1={ship.x + 1} y1={ship.y - 7} x2={ship.x + 1} y2={ship.y - 14}
                    stroke={col} strokeWidth="1" opacity="0.9" />
                  <line x1={ship.x - 3} y1={ship.y - 12} x2={ship.x + 5} y2={ship.y - 12}
                    stroke={col} strokeWidth="0.8" opacity="0.7" />
                  {/* SAM launcher turrets */}
                  {!depleted && [-8, 6].map(ox => (
                    <g key={ox}>
                      <circle cx={ship.x + ox} cy={ship.y} r="2.5"
                        fill={col} fillOpacity="0.4" stroke={col} strokeWidth="0.8" />
                      <line x1={ship.x + ox} y1={ship.y} x2={ship.x + ox} y2={ship.y - 5}
                        stroke={col} strokeWidth="1.2" opacity="0.9" />
                    </g>
                  ))}
                  <text x={ship.x} y={ship.y + 18} fill={col} fontSize="7"
                    textAnchor="middle" fontWeight="bold" opacity="0.9">{ship.name}</text>
                  <text x={ship.x} y={ship.y + 27} fill={depleted ? "#f87171" : "rgba(56,189,248,0.65)"}
                    fontSize="6.5" textAnchor="middle">
                    {depleted ? "⚠ NO SAMs" : `SAM ×${ship.sam_count}`}
                  </text>
                </g>
              );
            })}

            {/* Civilians + spy flights */}
            {civilians.map(c => c.isSpy ? (
              <g key={c.id} transform={`translate(${c.x},${c.y})`} opacity={dim ? 0.15 : 1}>
                {/* Spy aircraft — amber diamond */}
                <polygon points="0,-8 6,0 0,8 -6,0" fill="#facc1522" stroke="#facc15" strokeWidth="1.2" />
                <circle r="14" fill="none" stroke="#facc15" strokeWidth="0.5" strokeDasharray="3 3" opacity="0.4">
                  <animate attributeName="r" values="12;18;12" dur="2s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.4;0.1;0.4" dur="2s" repeatCount="indefinite" />
                </circle>
                <text y="-12" fill="#facc15" fontSize="7" textAnchor="middle" fontWeight="bold">{c.id}</text>
                <text y="18" fill="rgba(250,204,21,0.6)" fontSize="6" textAnchor="middle">RECON</text>
              </g>
            ) : (
              <g key={c.id} transform={`translate(${c.x},${c.y})`} opacity={dim ? 0.07 : 1} style={{ transition: "opacity 0.25s" }}>
                <circle r="5" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="1" />
                <circle r="2" fill="rgba(255,255,255,0.55)" />
                <text y="14" fill="rgba(255,255,255,0.28)" fontSize="7" textAnchor="middle">{c.id}</text>
              </g>
            ))}

            {/* Interceptor vehicles — aircraft, ship SAMs, and ground fire */}
            {interceptors.map(icp => {
              const angle = Math.atan2(icp.vy, icp.vx) * 180 / Math.PI + 90;
              const isHl  = hl?.baseId === icp.baseId;
              const isShip   = icp.assetType === "ship_sam";
              const isCIWS   = icp.assetType === "ship_ciws";
              const isGround = icp.assetType === "ground_defense";
              const col = isCIWS ? "#fb923c" : isShip ? "#38bdf8" : isGround ? "#facc15" : "#3fc1ff";
              const iconType = icp.assetType === "interceptor"    ? "Cruise missile"
                             : icp.assetType === "drone"           ? "Armed drone"
                             : icp.assetType === "ship_sam"        ? "Ballistic missile"
                             : icp.assetType === "ship_ciws"       ? "Cruise missile"
                             : icp.assetType === "ground_defense"  ? "Cruise missile"
                             : "Strike aircraft";
              const trail = Math.min(icp.age * 0.4, 12);
              return (
                <g key={icp.id} transform={`translate(${icp.x},${icp.y})`}
                  opacity={dim && !isHl ? 0.15 : 1} style={{ transition: "opacity 0.2s" }}>
                  {/* CIWS: rapid tracer bursts instead of a single trail */}
                  {isCIWS ? [0,1,2,3].map(i => (
                    <line key={i} x1={i*2} y1={0} x2={-icp.vx*(trail+i*2)} y2={-icp.vy*(trail+i*2)}
                      stroke={col} strokeWidth="1.5" opacity={0.6 - i*0.12} strokeLinecap="round" />
                  )) : (
                    <line x1={0} y1={0} x2={-icp.vx * trail} y2={-icp.vy * trail}
                      stroke={col} strokeWidth={isShip || isGround ? 2 : 1.5} opacity="0.4" strokeLinecap="round" />
                  )}
                  <circle r="8" fill="none" stroke={col} strokeWidth="0.5" opacity="0.2" />
                  {!isCIWS && <ThreatIcon type={iconType} color={col} angle={angle} />}
                  {isCIWS && <circle r="3" fill={col} opacity="0.9" />}
                  <text y="-15" fill={`${col}99`} fontSize="6" textAnchor="middle">
                    {isCIWS ? "CIWS" : isShip ? "SAM" : isGround ? "GND" : icp.baseId}
                  </text>
                </g>
              );
            })}

            {/* Threats */}
            {threats.map(th => {
              const isHl = hl?.threatId === th.id;
              const dwnAge = th.intercepted ? th.age - th.intercepted_at : 0;
              const dwnOpacity = th.intercepted ? Math.max(0, 1 - dwnAge / 75) : 1;
              const tumbleAngle = th.intercepted
                ? dwnAge * 11
                : Math.atan2(th.vy, th.vx) * 180 / Math.PI + 90;

              // Hit threats are handled by the city explosion + city flash — don't double-render
              if (th.hit) return null;

              // Undetected: render as anonymous radar blip — operator sees contact but doesn't know type/target
              if (!th.detected && !th.intercepted) {
                const blipR = 4 + 2 * Math.sin(th.age * 0.18);
                return (
                  <g key={th.id} transform={`translate(${th.x},${th.y})`} opacity={dim ? 0.06 : 0.45}>
                    <circle r={blipR + 6} fill="none" stroke="#facc15" strokeWidth="0.5" opacity="0.3">
                      <animate attributeName="r" values={`${blipR+4};${blipR+12};${blipR+4}`} dur="1.8s" repeatCount="indefinite" />
                      <animate attributeName="opacity" values="0.3;0.0;0.3" dur="1.8s" repeatCount="indefinite" />
                    </circle>
                    <circle r={blipR} fill="#facc1544" stroke="#facc15" strokeWidth="0.8" />
                    <text y="-9" fill="rgba(250,204,21,0.5)" fontSize="6" textAnchor="middle">?</text>
                  </g>
                );
              }

              return (
                <g key={th.id} transform={`translate(${th.x},${th.y})`}
                  opacity={(dim && !isHl ? 0.1 : 1) * dwnOpacity}
                  style={{ transition: th.intercepted ? "none" : "opacity 0.25s" }}>
                  {isHl && !th.intercepted && (
                    <circle r="22" fill="none" stroke="#f87171" strokeWidth="1" opacity="0.4">
                      <animate attributeName="r" values="16;28;16" dur="1.2s" repeatCount="indefinite" />
                      <animate attributeName="opacity" values="0.5;0.1;0.5" dur="1.2s" repeatCount="indefinite" />
                    </circle>
                  )}
                  <circle r={isHl && !th.intercepted ? 18 : 14} fill="url(#threatGlow)"
                    opacity={th.intercepted ? 0.2 : 0.5 + 0.5 * Math.sin(th.age * 0.15)} />
                  {th.intercepted && dwnAge < 40 && [0,72,144,216,288].map(a => {
                    const r2 = a * Math.PI / 180, d2 = dwnAge * 0.6;
                    return <line key={a} x1={0} y1={0} x2={Math.cos(r2)*d2} y2={Math.sin(r2)*d2}
                      stroke="#facc15" strokeWidth="1" opacity={0.8 - dwnAge/40} />;
                  })}
                  <ThreatIcon
                    type={th.type}
                    color={th.intercepted ? "#555" : isHl ? "#ff6060" : "#f87171"}
                    angle={tumbleAngle} />
                  {!th.intercepted && (
                    <>
                      <text y="-13" fill={isHl ? "#ff6060" : "#f87171"} fontSize="7.5" textAnchor="middle" fontWeight="bold">{th.id}</text>
                      <text y="21" fill="rgba(248,113,113,0.55)" fontSize="6.5" textAnchor="middle">→ {th.target_name} · {formatETA(Math.max(0, th.eta - Math.floor(th.age / 60)))}</text>
                    </>
                  )}
                  {th.intercepted && dwnAge < 20 && (
                    <text y="-16" fill="#facc15" fontSize="8" textAnchor="middle" fontWeight="bold">✕</text>
                  )}
                </g>
              );
            })}

            {/* Explosion bursts */}
            {explosions.map(e => {
              const dur = e.cityHit ? 90 : 55;
              const p = e.age / dur;
              const flash = e.age < (e.cityHit ? 14 : 8);
              const s = e.cityHit ? 3.5 : 1;  // city strikes are much larger
              return (
                <g key={e.id} transform={`translate(${e.x},${e.y})`}>
                  {flash && <circle r={(e.cityHit ? 40 : 20) - e.age * (e.cityHit ? 2 : 1.5)} fill="#ffffff" opacity={(( e.cityHit ? 14 : 8) - e.age) / (e.cityHit ? 14 : 8) * 0.95} />}
                  {e.cityHit && flash && <circle r={30 - e.age} fill="#ff6600" opacity={0.5} />}
                  <circle r={4*s + p * 34*s} fill="none" stroke="#facc15" strokeWidth={2.5*s * (1-p)} opacity={(1-p) * 0.9} />
                  <circle r={2*s + p * 22*s} fill="none" stroke="#f87171" strokeWidth={2*s * (1-p)} opacity={(1-p) * 0.8} />
                  <circle r={p * 12*s} fill="none" stroke="#ff8855" strokeWidth={1.5*s * (1-p)} opacity={(1-p) * 0.5} />
                  {(e.cityHit ? [0,30,60,90,120,150,180,210,240,270,300,330] : [0,60,120,180,240,300]).map(angle => {
                    const rad = angle * Math.PI / 180;
                    const dist = p * 28 * s;
                    return (
                      <circle key={angle}
                        cx={Math.cos(rad) * dist} cy={Math.sin(rad) * dist}
                        r={Math.max(0, (e.cityHit ? 3 : 2) - p * 1.5)} fill="#facc15" opacity={1-p} />
                    );
                  })}
                  {e.cityHit && e.age > 5 && e.age < 40 && (
                    <text y={-40 - p * 20} fill="#f87171" fontSize="9" textAnchor="middle" fontWeight="bold" opacity={1-p}>CITY HIT</text>
                  )}
                </g>
              );
            })}

            {/* Scale bar */}
            <line x1="840" y1="752" x2="960" y2="752" stroke="white" strokeWidth="1.5" opacity="0.18" />
            <line x1="840" y1="747" x2="840" y2="757" stroke="white" strokeWidth="1.5" opacity="0.18" />
            <line x1="960" y1="747" x2="960" y2="757" stroke="white" strokeWidth="1.5" opacity="0.18" />
            <text x="900" y="767" fill="rgba(255,255,255,0.22)" fontSize="9" textAnchor="middle">200 km</text>

            {/* Legend */}
            <g transform="translate(14,742)">
              <circle cx="5" cy="5" r="4" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="1" />
              <text x="13" y="9" fill="rgba(255,255,255,0.3)" fontSize="8">Civilian</text>
              <polygon points="38,1 32,11 44,11" fill="#3fc1ff" opacity="0.7" />
              <text x="48" y="9" fill="rgba(63,193,255,0.45)" fontSize="8">N. Base</text>
              <polygon points="88,1 82,11 94,11" fill="#ff8855" opacity="0.7" />
              <text x="98" y="9" fill="rgba(255,136,85,0.45)" fontSize="8">S. Base</text>
              <polygon points="138,5 132,11 144,11" fill="#f87171" opacity="0.7" />
              <text x="148" y="9" fill="rgba(248,113,113,0.45)" fontSize="8">Threat</text>
              <rect x="188" y="1" width="9" height="9" fill="#ffcc00" stroke="#111" strokeWidth="0.8" rx="1" />
              <text x="201" y="9" fill="rgba(255,204,0,0.45)" fontSize="8">Capital</text>
              <rect x="230" y="2" width="7" height="7" fill="#dde" stroke="#111" strokeWidth="0.7" rx="0.5" />
              <text x="241" y="9" fill="rgba(255,255,255,0.3)" fontSize="8">City</text>
            </g>
          </svg>
        </div>

        {/* ── RIGHT PANEL ── */}
        <div style={{ width: 330, background: "#0a1e34", borderLeft: "1px solid #1a3a56", display: "flex", flexDirection: "column", flexShrink: 0 }}>

          {/* Situation awareness strip — one-glance status */}
          <div style={{ display: "flex", gap: 0, borderBottom: "1px solid #0a1820", background: "#081c30" }}>
            {[
              { label: "THREATS", val: threats.filter(t => t.detected && !t.intercepted).length, color: threats.filter(t=>t.detected&&!t.intercepted).length > 0 ? "#f87171" : "#5aaac8" },
              { label: "HOLD",    val: pending.length,  color: pending.length > 0 ? "#facc15" : "#5aaac8" },
              { label: "RATE",    val: interceptedCount + missedCount > 0 ? `${Math.round(interceptedCount/(interceptedCount+missedCount)*100)}%` : "—", color: (() => { const r=interceptedCount+missedCount>0?interceptedCount/(interceptedCount+missedCount)*100:null; return r===null?"#5aaac8":r>=70?"#4ade80":r>=40?"#facc15":"#f87171"; })() },
              { label: "SPENT",   val: sessionCost>=1e6?`$${(sessionCost/1e6).toFixed(1)}M`:sessionCost>=1000?`$${Math.round(sessionCost/1000)}K`:"$0", color: sessionCost>5e6?"#f87171":sessionCost>1e6?"#facc15":"#4a7a6a" },
            ].map(({ label, val, color }) => (
              <div key={label} style={{ flex: 1, padding: "5px 0", textAlign: "center", borderRight: "1px solid #0a1820" }}>
                <div style={{ fontSize: 7.5, color: "#7ab8d0", letterSpacing: 1, marginBottom: 1 }}>{label}</div>
                <div style={{ fontSize: 14, fontWeight: "bold", color, lineHeight: 1 }}>{val}</div>
              </div>
            ))}
          </div>

          {/* Tab bar — HOLD removed, pending items live inside FEED */}
          <div style={{ display: "flex", borderBottom: "1px solid #0d2238", background: "#0b1e32" }}>
            {[["feed","FEED"],["state","BASES"],["stats","STATS"],["log","LOG"]].map(([t, label]) => {
              const activeColor = t==="stats"?"#4ade80":t==="log"?"#facc15":"#3fc1ff";
              return (
                <button key={t} onClick={() => setTab(t)}
                  style={{ flex: 1, padding: "7px 0", position: "relative", background: tab===t?"#0d2238":"transparent", border: "none", borderBottom: tab===t?`2px solid ${activeColor}`:"2px solid transparent", color: tab===t?activeColor:"#5a9ab8", fontSize: 8, letterSpacing: 1, cursor: "pointer", fontFamily: "inherit", fontWeight: tab===t?"bold":"normal" }}>
                  {label}
                  {t==="feed" && pending.length>0 && (
                    <span style={{ position:"absolute", top:3, right:3, background:"#facc15", color:"#000", borderRadius:"50%", width:13, height:13, fontSize:7.5, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:"bold" }}>
                      {pending.length}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* ── DECISIONS feed (lighter card theme) ── */}
          {tab === "feed" && (
            <div style={{ flex: 1, overflowY: "auto", padding: "6px 8px", display: "flex", flexDirection: "column", gap: 6 }}>

              {/* AI wave forecast intel card */}
              {forecast && waveLog.length > 0 && (
                <div style={{ background: "#0e1a0a", border: "1px solid #1e3a14", borderLeft: "3px solid #4ade80", borderRadius: 4, padding: "8px 10px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 9, color: "#4ade80" }}>◈</span>
                      <span style={{ fontSize: 7.5, color: "#4ade80", letterSpacing: 2, fontWeight: "bold" }}>AI WAVE FORECAST</span>
                    </div>
                    <span style={{ fontSize: 7, padding: "1px 6px", background: riskColor(forecast.risk_level)+"22", color: riskColor(forecast.risk_level), border: `1px solid ${riskColor(forecast.risk_level)}44`, borderRadius: 2, letterSpacing: 1 }}>
                      {(forecast.risk_level||"unknown").toUpperCase()}
                    </span>
                  </div>

                  {/* Next wave ETA — hero number */}
                  <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 6 }}>
                    <div>
                      <div style={{ fontSize: 7, color: "#2a5a2a", letterSpacing: 1, marginBottom: 1 }}>NEXT WAVE IN ~</div>
                      <div style={{ fontSize: 26, fontWeight: "bold", color: forecast.next_wave_estimate_min != null ? "#4ade80" : "#2a5a2a", lineHeight: 1 }}>
                        {forecast.next_wave_estimate_min != null ? `${forecast.next_wave_estimate_min}m` : "—"}
                      </div>
                    </div>
                    <div style={{ flex: 1 }}>
                      {forecast.predicted_targets?.length > 0 && (
                        <div style={{ marginBottom: 3 }}>
                          <span style={{ fontSize: 7, color: "#2a5a2a", letterSpacing: 1 }}>TARGET  </span>
                          <span style={{ fontSize: 8.5, color: "#facc15" }}>{forecast.predicted_targets.join(", ")}</span>
                        </div>
                      )}
                      {forecast.predicted_wave_size != null && (
                        <div style={{ marginBottom: 3 }}>
                          <span style={{ fontSize: 7, color: "#2a5a2a", letterSpacing: 1 }}>WAVE SIZE  </span>
                          <span style={{ fontSize: 8.5, color: "#f87171" }}>~{forecast.predicted_wave_size} threats</span>
                        </div>
                      )}
                      {forecast.threat_types_expected?.length > 0 && (
                        <div style={{ marginBottom: 3, display: "flex", alignItems: "center", gap: 4 }}>
                          <span style={{ fontSize: 7, color: "#2a5a2a", letterSpacing: 1 }}>EXPECT  </span>
                          <div style={{ display: "flex", gap: 4 }}>
                            {forecast.threat_types_expected.map(tt => (
                              <span key={tt} style={{ display: "flex", alignItems: "center", gap: 2 }}>
                                <svg width="10" height="10" viewBox="-12 -12 24 24">
                                  <ThreatIcon type={tt} color="#f87171" angle={0} />
                                </svg>
                                <span style={{ fontSize: 7.5, color: "#a8ccd8" }}>{tt.split(" ")[0]}</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Readiness recommendation */}
                  {forecast.recommended_readiness && (
                    <div style={{ fontSize: 8, color: "#5a9a5a", lineHeight: 1.5, paddingTop: 5, borderTop: "1px solid #1a3010" }}>
                      {forecast.recommended_readiness}
                    </div>
                  )}
                </div>
              )}

              {/* HOLD items — Arktholm (priority 10) first, then by ETA ascending */}
              {[...pending].sort((a, b) => {
                const priA = a.threat?.target_name === "Arktholm" ? 10 : 6;
                const priB = b.threat?.target_name === "Arktholm" ? 10 : 6;
                if (priB !== priA) return priB - priA;           // higher priority first
                return (a.threat?.eta || 999) - (b.threat?.eta || 999);  // sooner ETA first
              }).map(p => {
                const d = p.decision;
                const elapsed   = Math.floor((Date.now() / 1000) - p.created_at);
                const totalEta  = p.threat.eta || 600;
                const remaining = Math.max(0, totalEta - elapsed);
                const etaColor  = remaining < 120 ? "#f87171" : remaining < 300 ? "#facc15" : "#4ade80";
                const isCapital = p.threat?.target_name === "Arktholm";
                return (
                  <div key={p.decision_id}
                    onMouseEnter={() => setHoveredId(p.decision_id)}
                    onMouseLeave={() => setHoveredId(null)}
                    style={{ background: isCapital ? "#1a0800" : "#1a1200", border: `1px solid ${isCapital ? "#f87171" : "#3a2800"}`, borderLeft: `3px solid ${isCapital ? "#f87171" : "#facc15"}`, borderRadius: 4, overflow: "hidden" }}>
                    {isCapital && (
                      <div style={{ background: "#f871711a", borderBottom: "1px solid #f8717140", padding: "3px 10px", display: "flex", alignItems: "center", gap: 5 }}>
                        <span style={{ fontSize: 7.5, color: "#f87171", fontWeight: "bold", letterSpacing: 2 }}>★ CAPITAL — PRIORITY INTERCEPT</span>
                      </div>
                    )}
                    {/* Top strip: threat + ETA */}
                    <div style={{ padding: "8px 10px 6px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
                          <svg width="13" height="13" viewBox="-12 -12 24 24">
                            <ThreatIcon type={p.threat.type} color={isCapital ? "#f87171" : "#facc15"} angle={0} />
                          </svg>
                          <span style={{ fontSize: 9, color: "#f8f0c0", fontWeight: "bold", letterSpacing: 1 }}>{p.threat.id}</span>
                          <span style={{ fontSize: 7, padding: "1px 6px", background: isCapital ? "#3a0808" : "#3a2800", color: isCapital ? "#f87171" : "#facc15", border: `1px solid ${isCapital ? "#f8717160" : "#facc1560"}`, borderRadius: 2, letterSpacing: 1 }}>REVIEW</span>
                        </div>
                        <div style={{ fontSize: 9, color: "#d4c060", marginBottom: 3 }}>
                          {p.threat.type} → <span style={{ color: isCapital ? "#ff9090" : "#ffe060", fontWeight: "bold" }}>{p.threat.target_name}</span>
                        </div>
                        {p.approval_reasons.map((r, i) => (
                          <div key={i} style={{ fontSize: 7.5, color: "#a09030", marginBottom: 1 }}>⚠ {r}</div>
                        ))}
                      </div>
                      {/* ETA — primary signal */}
                      <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 8 }}>
                        <div style={{ fontSize: 7, color: "#7a6a30", letterSpacing: 1, marginBottom: 1 }}>IMPACT IN</div>
                        <div style={{ fontSize: 24, fontWeight: "bold", color: etaColor, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{formatETA(remaining)}</div>
                        <div style={{ fontSize: 7, color: remaining < 60 ? "#f87171" : "#7a6a30", marginTop: 2, fontWeight: remaining < 60 ? "bold" : "normal" }}>
                          {remaining < 60 ? "⚠ CRITICAL — DECIDE NOW" : "AWAITING DECISION"}
                        </div>
                      </div>
                    </div>
                    {/* ETA bar */}
                    <div style={{ height: 2, background: "#1a1000" }}>
                      <div style={{ width:`${(remaining/totalEta)*100}%`, height:"100%", background: etaColor, transition:"width 1s linear" }} />
                    </div>
                    {/* Recommendation */}
                    <div style={{ padding: "5px 10px 3px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <span style={{ fontSize: 9, color: "#3fc1ff", fontWeight: "bold" }}>{d.recommended_base_name?.split(" ").slice(0,2).join(" ")}</span>
                        <span style={{ fontSize: 7.5, color: "#3a6070", marginLeft: 6 }}>{(d.recommended_weapon||"").replace(/_/g," ")} · {d.recommended_asset_type}</span>
                      </div>
                      <span style={{ fontSize: 8, color: confColor(d.confidence), fontWeight: "bold" }}>{d.confidence}%</span>
                    </div>
                    {/* Override dropdown + action buttons */}
                    <div style={{ padding: "4px 8px 8px", display: "flex", gap: 5 }}>
                      <select value={overrideBase[p.decision_id]||""} onChange={e => setOverrideBase(o=>({...o,[p.decision_id]:e.target.value||undefined}))}
                        style={{ flex: 1, background:"#0d1820", border:"1px solid #1a2e3a", color: overrideBase[p.decision_id]?"#3fc1ff":"#5a9ab8", padding:"3px 6px", fontSize:8, fontFamily:"inherit", borderRadius:2 }}>
                        <option value="">AI: {d.recommended_base}</option>
                        {BASES.north.map(b => <option key={b.id} value={b.id}>{b.id} — {b.name}</option>)}
                      </select>
                      <button onClick={()=>handleApprove(p.decision_id)}
                        style={{ padding:"4px 10px", background:"#071f0f", border:"1px solid #4ade80", color:"#4ade80", fontSize:8, letterSpacing:1, cursor:"pointer", fontFamily:"inherit", borderRadius:2 }}>
                        ✓ APPROVE
                      </button>
                      <button onClick={()=>handleReject(p.decision_id)}
                        style={{ padding:"4px 8px", background:"#160808", border:"1px solid #664444", color:"#aa6666", fontSize:8, cursor:"pointer", fontFamily:"inherit", borderRadius:2 }}>
                        ✕
                      </button>
                    </div>
                  </div>
                );
              })}

              {loading && (
                <div style={{ padding: "6px 10px", background: "#0a1c2c", border: "1px solid #1a3040", borderRadius: 4, fontSize: 8, color: "#facc15", letterSpacing: 1, display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ animation: "spin 1s linear infinite", display: "inline-block" }}>◌</span> AI PROCESSING...
                </div>
              )}
              {decisions.length === 0 && !loading && (
                <div style={{ padding: "60px 0", textAlign: "center", color: "#4a7890", fontSize: 10, letterSpacing: 1 }}>NO ACTIVE THREATS</div>
              )}
              {decisions.map((d, i) => {
                const isSelected = selected === d.decision_id;
                const isHovered  = hoveredId === d.decision_id;
                const pCol = prioColor(d.priority);
                return (
                  <div key={d.decision_id}
                    onMouseEnter={() => setHoveredId(d.decision_id)}
                    onMouseLeave={() => setHoveredId(null)}
                    style={{
                      background: isSelected ? "#1a3454" : isHovered ? "#162e4a" : "#122840",
                      border: `1px solid ${isSelected ? "#2e5278" : isHovered ? "#264870" : "#1e3e60"}`,
                      borderLeft: `3px solid ${pCol}`,
                      borderRadius: 4,
                      overflow: "hidden",
                      cursor: "pointer",
                      transition: "background 0.15s, border-color 0.15s",
                    }}>

                    {/* Card header: threat icon + ID + priority + time */}
                    <div onClick={() => setSelected(isSelected ? null : d.decision_id)}
                      style={{ padding: "8px 10px 6px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          {/* Inline threat icon */}
                          <svg width="14" height="14" viewBox="-12 -12 24 24" style={{ flexShrink: 0 }}>
                            <ThreatIcon type={d.threat_type} color="#f87171" angle={0} />
                          </svg>
                          <span style={{ fontSize: 9, color: "#e8f0f5", letterSpacing: 1, fontWeight: "bold" }}>{d.threat_id}</span>
                          <span style={{ fontSize: 7, padding: "1px 5px", background: pCol+"28", color: pCol, border: `1px solid ${pCol}55`, borderRadius: 2, letterSpacing: 1 }}>
                            {(d.priority||"urgent").toUpperCase()}
                          </span>
                          {d.status === "approved"      && <span style={{ fontSize: 7, color: "#4ade80", letterSpacing: 0.5 }}>✓ HUM</span>}
                          {d.status === "auto_executed" && <span style={{ fontSize: 7, color: "#3fc1ff", letterSpacing: 0.5 }}>⚡ AUTO</span>}
                        </div>
                        <span style={{ fontSize: 7.5, color: "#3a5a70", fontVariantNumeric: "tabular-nums" }}>{new Date(d.timestamp*1000).toLocaleTimeString("en-GB")}</span>
                      </div>

                      {/* Threat type → target + base */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                        <span style={{ fontSize: 9.5, color: "#b8d4e0" }}>{d.threat_type}</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <span style={{ fontSize: 7, color: "#5aaac8" }}>→</span>
                          <span style={{ fontSize: 9.5, color: "#3fc1ff", fontWeight: "bold" }}>
                            {d.recommended_base_name?.split(" ").slice(0,2).join(" ")}
                          </span>
                        </div>
                      </div>

                      {/* Weapon + asset type + confidence bar */}
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 7.5, color: "#3a6070", flexShrink: 0 }}>
                          {(d.recommended_weapon||"").replace(/_/g," ")} · {d.recommended_asset_type}
                        </span>
                        <div style={{ flex: 1, height: 3, background: "#0d2238", borderRadius: 2 }}>
                          <div style={{ width:`${d.confidence}%`, height:"100%", background:confColor(d.confidence), borderRadius:2, transition:"width 0.5s" }} />
                        </div>
                        <span style={{ fontSize: 8.5, color: confColor(d.confidence), fontWeight:"bold", minWidth:24 }}>{d.confidence}%</span>
                      </div>
                    </div>

                    {/* Expand toggle */}
                    <div onClick={() => setSelected(isSelected ? null : d.decision_id)}
                      style={{ padding: "3px 10px 4px", borderTop: "1px solid #0d1e2a", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}>
                      <span style={{ fontSize: 7, color: "#5a9ab8", letterSpacing: 1 }}>{isSelected ? "▲ HIDE DETAIL" : "▼ SHOW REASONING"}</span>
                      {d.estimated_cost_usd && <span style={{ fontSize: 7.5, color: "#facc15" }}>${(d.estimated_cost_usd/1000).toFixed(0)}K</span>}
                    </div>

                    {/* Expanded detail — progressive disclosure */}
                    {isSelected && (
                      <div style={{ padding: "8px 10px 10px", borderTop: "1px solid #0d1e2a", background: "#0f2238" }}>
                        {d.cost_rationale && <Section label="COST" color="#a07830">{d.cost_rationale}</Section>}
                        <Section label="REASONING" color="#a8ccd8">{d.reasoning}</Section>
                        {d.alternatives_rejected?.length > 0 && (
                          <div style={{ marginBottom: 8 }}>
                            <Label>ALTERNATIVES REJECTED</Label>
                            {d.alternatives_rejected.map((alt, j) => (
                              <div key={j} style={{ fontSize: 8.5, color: "#4a6070", marginBottom: 3, paddingLeft: 8, borderLeft: "2px solid #0d2030" }}>
                                <span style={{ color: "#8ab0c4" }}>{alt.base}</span> — {alt.reason}
                              </div>
                            ))}
                          </div>
                        )}
                        {d.trade_offs && <Section label="TRADE-OFFS" color="#c0a040">{d.trade_offs}</Section>}
                        {d.civilian_note && <Section label={`CIVILIAN ${(d.civilian_risk||"").toUpperCase()}`} color="#facc15">{d.civilian_note}</Section>}
                        {d.future_risk && <Section label="FUTURE RISK" color="#4ade80">{d.future_risk}</Section>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* HOLD panel removed — pending decisions appear at top of FEED tab */}
          {false && [].map(p => {
                const d = p.decision;
                const elapsed  = Math.floor((Date.now() / 1000) - p.created_at);
                const totalEta = p.threat.eta || 600;
                const remaining = Math.max(0, totalEta - elapsed);
                const etaColor  = remaining < 120 ? "#f87171" : remaining < 300 ? "#facc15" : "#4ade80";
                const pct       = (remaining / totalEta) * 100;
                const isHovered = hoveredId === p.decision_id;
                return (
                  <div key={p.decision_id}
                    onMouseEnter={() => setHoveredId(p.decision_id)}
                    onMouseLeave={() => setHoveredId(null)}
                    style={{ borderBottom: "1px solid #0d1e2a", borderLeft: `3px solid ${etaColor}`,
                      background: isHovered ? "#080f18" : "#050c14",
                      transition: "background 0.15s" }}>

                    {/* ── Zone 1: THREAT CONTEXT ─────────────────────── */}
                    <div style={{ padding: "10px 14px 8px", borderBottom: "1px solid #0a1620" }}>
                      {/* Primary row: threat ID | priority | ETA */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <span style={{ fontSize: 10, color: "#f87171", letterSpacing: 1, fontWeight: "bold" }}>{p.threat.id}</span>
                          <span style={{ fontSize: 7, padding: "1px 6px", background: prioColor(d.priority) + "22", color: prioColor(d.priority), border: `1px solid ${prioColor(d.priority)}44`, letterSpacing: 1 }}>
                            {(d.priority || "urgent").toUpperCase()}
                          </span>
                        </div>
                        {/* ETA — the primary prioritisation signal */}
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 7, color: "#5aaac8", letterSpacing: 1, marginBottom: 1 }}>IMPACT IN</div>
                          <div style={{ fontSize: 22, fontWeight: "bold", color: etaColor, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
                            {formatETA(remaining)}
                          </div>
                        </div>
                      </div>

                      {/* ETA progress bar */}
                      <div style={{ height: 2, background: "#0d2238", borderRadius: 2, marginBottom: 6 }}>
                        <div style={{ width: `${pct}%`, height: "100%", background: etaColor, borderRadius: 2, transition: "width 1s linear" }} />
                      </div>

                      {/* Threat context: type · distance · speed → target */}
                      <div style={{ fontSize: 9, color: "#9abccc" }}>
                        <span style={{ color: "#b8d4e0" }}>{p.threat.type}</span>
                        {p.threat.dist_km && <span style={{ color: "#3a6070" }}> · {p.threat.dist_km} km · {p.threat.speed} km/h</span>}
                        <span style={{ color: "#3a6070" }}> → </span>
                        <span style={{ color: "#facc15", fontWeight: "bold" }}>{p.threat.target_name}</span>
                      </div>
                    </div>

                    {/* ── Zone 2: HOLD REASONS ───────────────────────── */}
                    <div style={{ padding: "8px 14px", borderBottom: "1px solid #0a1620", background: "rgba(250,204,21,0.03)" }}>
                      <div style={{ fontSize: 7, color: "#6a5a00", letterSpacing: 2, marginBottom: 5 }}>WHY HELD FOR REVIEW</div>
                      {p.approval_reasons.map((r, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 6, marginBottom: 4 }}>
                          <span style={{ color: "#facc15", fontSize: 10, flexShrink: 0, marginTop: 1 }}>⚠</span>
                          <span style={{ fontSize: 9, color: "#c0a030", lineHeight: 1.4 }}>{r}</span>
                        </div>
                      ))}
                    </div>

                    {/* ── Zone 3: AI RECOMMENDATION ─────────────────── */}
                    <div style={{ padding: "8px 14px", borderBottom: "1px solid #0a1620" }}>
                      <div style={{ fontSize: 7, color: "#1e4a5a", letterSpacing: 2, marginBottom: 6 }}>AI RECOMMENDS</div>

                      {/* Base name — the most important decision output */}
                      <div style={{ fontSize: 13, color: "#3fc1ff", fontWeight: "bold", marginBottom: 3 }}>{d.recommended_base_name}</div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                        <span style={{ fontSize: 9, color: "#4a8a9a" }}>
                          {(d.recommended_weapon || "").replace(/_/g, " ")} · {d.recommended_asset_type}
                        </span>
                        <span style={{ fontSize: 9, color: confColor(d.confidence), fontWeight: "bold" }}>{d.confidence}%</span>
                      </div>

                      {/* Confidence bar */}
                      <div style={{ height: 3, background: "#0d2238", borderRadius: 2, marginBottom: 8 }}>
                        <div style={{ width: `${d.confidence}%`, height: "100%", background: confColor(d.confidence), borderRadius: 2 }} />
                      </div>

                      {/* Collapsible reasoning */}
                      <button onClick={() => toggleReasoning(p.decision_id)}
                        style={{ background: "none", border: "none", color: "#5aaac8", fontSize: 8, cursor: "pointer", padding: 0, letterSpacing: 1, fontFamily: "inherit" }}>
                        {expandedReasoning.has(p.decision_id) ? "▲ HIDE REASONING" : "▼ SHOW REASONING"}
                      </button>
                      {expandedReasoning.has(p.decision_id) && (
                        <div style={{ marginTop: 6, fontSize: 9, color: "#5a8a9a", lineHeight: 1.6, paddingLeft: 8, borderLeft: "2px solid #0d2030" }}>
                          <div style={{ marginBottom: 4 }}>{d.reasoning}</div>
                          {d.trade_offs && <div style={{ color: "#8a7030" }}>{d.trade_offs}</div>}
                          {d.alternatives_rejected?.length > 0 && (
                            <div style={{ marginTop: 4 }}>
                              {d.alternatives_rejected.map((alt, j) => (
                                <div key={j} style={{ color: "#6ab0cc", marginTop: 2 }}>
                                  <span style={{ color: "#5a7a8a" }}>{alt.base}</span>: {alt.reason}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* ── Zone 4: CONTROLS ───────────────────────────── */}
                    <div style={{ padding: "8px 14px" }}>
                      {/* Override selector */}
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ fontSize: 7, color: "#1e4a5a", letterSpacing: 2, marginBottom: 4 }}>OVERRIDE BASE (OPTIONAL)</div>
                        <select
                          value={overrideBase[p.decision_id] || ""}
                          onChange={e => setOverrideBase(o => ({ ...o, [p.decision_id]: e.target.value || undefined }))}
                          style={{ width: "100%", background: "#112538", border: "1px solid #0d2030", color: overrideBase[p.decision_id] ? "#3fc1ff" : "#5a9ab8", padding: "5px 8px", fontSize: 9, cursor: "pointer", fontFamily: "inherit" }}>
                          <option value="">AI choice: {d.recommended_base}</option>
                          {BASES.north.map(b => (
                            <option key={b.id} value={b.id}>{b.id} — {b.name}</option>
                          ))}
                        </select>
                      </div>

                      {/* Primary CTAs — large hit targets, clear affordance */}
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => handleApprove(p.decision_id)}
                          style={{ flex: 2, padding: "9px 0", background: "#071f0f", border: "1px solid #4ade80", color: "#4ade80", fontSize: 9, letterSpacing: 2, cursor: "pointer", fontFamily: "inherit", fontWeight: "bold" }}>
                          ✓ APPROVE & DEPLOY
                        </button>
                        <button onClick={() => handleReject(p.decision_id)}
                          style={{ flex: 1, padding: "9px 0", background: "#160808", border: "1px solid #664444", color: "#aa6666", fontSize: 9, letterSpacing: 1, cursor: "pointer", fontFamily: "inherit" }}>
                          ✕ REJECT
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}

          {/* Base status */}
          {tab === "state" && (
            <div style={{ flex: 1, overflowY: "auto", padding: 14 }}>
              {/* ── Naval fleet status ── */}
              <div style={{ marginBottom: 14, padding: 10, border: "1px solid #0d2238", background: "#0a1e30" }}>
                <div style={{ fontSize: 7, color: "#1e4a60", letterSpacing: 2, marginBottom: 8 }}>NAVAL FLEET — BOREAL PASSAGE</div>
                {shipStatus.map(ship => {
                  const samPct = Math.round((ship.sam_count / 12) * 100);
                  const ciwsPct = Math.round(((ship.ciws_rounds ?? 200) / 200) * 100);
                  const destroyed = ship.sam_count === 0 && (ship.ciws_rounds ?? 200) === 0;
                  const damaged = !destroyed && ship.sam_count < 6;
                  const col = destroyed ? "#f87171" : damaged ? "#f97316" : "#38bdf8";
                  return (
                    <div key={ship.id} style={{ marginBottom: 10, paddingBottom: 8, borderBottom: "1px solid #0a1820" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                        <span style={{ fontSize: 8, fontWeight: "bold", color: col, letterSpacing: 1 }}>{ship.id}</span>
                        <span style={{ fontSize: 7.5, color: destroyed ? "#f87171" : damaged ? "#f97316" : "#4ade80" }}>
                          {destroyed ? "⚠ DESTROYED" : damaged ? "DAMAGED" : "ACTIVE"}
                        </span>
                      </div>
                      <div style={{ fontSize: 7.5, color: "#3a6070", marginBottom: 5 }}>{ship.name}</div>
                      <div style={{ marginBottom: 3 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 1 }}>
                          <span style={{ fontSize: 7, color: "#2a5570" }}>SAM MISSILES</span>
                          <span style={{ fontSize: 7.5, color: col }}>{ship.sam_count} / 12</span>
                        </div>
                        <div style={{ height: 3, background: "#0d2238", borderRadius: 2 }}>
                          <div style={{ width: `${samPct}%`, height: "100%", background: col, borderRadius: 2, transition: "width 0.4s" }} />
                        </div>
                      </div>
                      <div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 1 }}>
                          <span style={{ fontSize: 7, color: "#2a5570" }}>CIWS ROUNDS</span>
                          <span style={{ fontSize: 7.5, color: "#fb923c" }}>{ship.ciws_rounds ?? 200} / 200</span>
                        </div>
                        <div style={{ height: 3, background: "#0d2238", borderRadius: 2 }}>
                          <div style={{ width: `${ciwsPct}%`, height: "100%", background: "#fb923c", borderRadius: 2, transition: "width 0.4s" }} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* ── Air bases ── */}
              {(northStatus.length > 0 ? northStatus : BASES.north.map(b => ({ ...b, available: [], deployed: [] }))).map(base => (
                <div key={base.id} style={{ marginBottom: 14, padding: 10, border: "1px solid #0d1e2a", background: "#112538" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                    <span style={{ fontSize: 9, fontWeight: "bold", color: "#3fc1ff", letterSpacing: 1 }}>{base.id}</span>
                    <span style={{ fontSize: 8, color: "#5aaac8" }}>
                      <span style={{ color: "#4ade80" }}>{base.available.length} RDY</span>
                      {base.deployed?.length > 0 && <span style={{ color: "#facc15", marginLeft: 6 }}>{base.deployed.length} DEPLOYED</span>}
                    </span>
                  </div>
                  <div style={{ fontSize: 10, color: "#5a7a8a", marginBottom: 8 }}>{base.name}</div>

                  {base.available.length === 0 && (
                    <div style={{ fontSize: 9, color: "#f87171", letterSpacing: 1, marginBottom: 6 }}>⚠ NO ASSETS AVAILABLE</div>
                  )}

                  {base.available.map(a => (
                    <div key={a.id} style={{ marginBottom: 6 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                        <span style={{ fontSize: 8, color: "#6a9ab0" }}>{a.id} · {a.type}</span>
                        <span style={{ fontSize: 8, color: fuelColor(a.fuel_pct) }}>{a.fuel_pct}%</span>
                      </div>
                      <div style={{ height: 3, background: "#0d2238", borderRadius: 2 }}>
                        <div style={{ width: `${a.fuel_pct}%`, height: "100%", background: fuelColor(a.fuel_pct), borderRadius: 2 }} />
                      </div>
                      <div style={{ fontSize: 7, color: "#5a9ab8", marginTop: 1 }}>{a.range_km} km range · {a.weapons?.join(", ").replace(/_/g," ")}</div>
                    </div>
                  ))}

                  {/* Weapon inventory */}
                  {base.weapons_inventory && (
                    <div style={{ marginTop: 8, paddingTop: 6, borderTop: "1px solid #0a1820" }}>
                      <div style={{ fontSize: 7, color: "#1e4050", letterSpacing: 2, marginBottom: 4 }}>WEAPON INVENTORY</div>
                      {Object.entries(base.weapons_inventory).map(([w, count]) => {
                        const low = count <= 2 && w !== "cannon";
                        const critical = count <= 1 && w.includes("missile");
                        return (
                          <div key={w} style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                            <span style={{ fontSize: 8, color: "#3a6070" }}>{w.replace(/_/g, " ")}</span>
                            <span style={{ fontSize: 8, fontWeight: "bold", color: critical ? "#f87171" : low ? "#facc15" : "#4a8a7a" }}>
                              {count} {critical ? "⚠" : ""}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Fuel stock */}
                  {base.fuel_pct !== undefined && (
                    <div style={{ marginTop: 6 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                        <span style={{ fontSize: 7, color: "#1e4050", letterSpacing: 2 }}>FUEL STOCK</span>
                        <span style={{ fontSize: 8, color: fuelColor(base.fuel_pct) }}>{base.fuel_pct}%  ({(base.fuel_stock_liters||0).toLocaleString()}L)</span>
                      </div>
                      <div style={{ height: 3, background: "#0d2238", borderRadius: 2 }}>
                        <div style={{ width: `${base.fuel_pct}%`, height: "100%", background: fuelColor(base.fuel_pct), borderRadius: 2 }} />
                      </div>
                    </div>
                  )}

                  {/* Resource warnings */}
                  {base.resource_warnings?.length > 0 && (
                    <div style={{ marginTop: 6 }}>
                      {base.resource_warnings.map((w, i) => (
                        <div key={i} style={{ fontSize: 8, color: w.startsWith("CRITICAL") ? "#f87171" : "#facc15", marginTop: 2 }}>⚠ {w}</div>
                      ))}
                    </div>
                  )}

                  {base.ground_ammo !== undefined && (
                    <div style={{ fontSize: 8, color: "#5a8aa0", marginTop: 4, borderTop: "1px solid #0a1820", paddingTop: 4 }}>
                      GND DEFENSE: {base.ground_ammo} rounds
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ── STATS tab ── */}
          {tab === "stats" && (() => {
            const total = interceptedCount + missedCount;
            const rate  = total > 0 ? Math.round(interceptedCount / total * 100) : null;
            const rateColor = rate === null ? "#6ab0cc" : rate >= 70 ? "#4ade80" : rate >= 40 ? "#facc15" : "#f87171";
            const typeMap = {};
            timeline.forEach(ev => {
              if (!ev.threatType) return;
              if (!typeMap[ev.threatType]) typeMap[ev.threatType] = { detected: 0, intercepted: 0, missed: 0 };
              if (ev.type === "threat" || ev.type === "intercepted" || ev.type === "missed") typeMap[ev.threatType].detected++;
              if (ev.type === "intercepted") typeMap[ev.threatType].intercepted++;
              if (ev.type === "missed")      typeMap[ev.threatType].missed++;
            });
            return (
              <div style={{ flex: 1, overflowY: "auto" }}>
                <div style={{ padding: "16px 14px 12px", borderBottom: "1px solid #0a1820" }}>
                  <div style={{ fontSize: 7, color: "#5aaac8", letterSpacing: 2, marginBottom: 10 }}>MISSION INTERCEPT RATE</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 10 }}>
                    <div style={{ fontSize: 48, fontWeight: "bold", color: rateColor, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
                      {rate !== null ? `${rate}%` : "—"}
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: "#4ade80", marginBottom: 3 }}>✓ {interceptedCount} intercepted</div>
                      <div style={{ fontSize: 10, color: "#f87171" }}>✗ {missedCount} reached target</div>
                      <div style={{ fontSize: 9, color: "#6ab0cc", marginTop: 3 }}>{total} total threats</div>
                    </div>
                  </div>
                  <div style={{ height: 8, background: "#0d2238", borderRadius: 4, overflow: "hidden" }}>
                    {total > 0 && (
                      <div style={{ display: "flex", height: "100%" }}>
                        <div style={{ width:`${interceptedCount/total*100}%`, background:"#4ade80", transition:"width 0.5s" }} />
                        <div style={{ width:`${missedCount/total*100}%`, background:"#f87171", transition:"width 0.5s" }} />
                      </div>
                    )}
                  </div>
                </div>
                {Object.keys(typeMap).length > 0 && (
                  <div style={{ padding: "12px 14px" }}>
                    <div style={{ fontSize: 7, color: "#5aaac8", letterSpacing: 2, marginBottom: 10 }}>BY THREAT TYPE</div>
                    {Object.entries(typeMap).map(([type, s]) => {
                      const tr = s.detected > 0 ? Math.round(s.intercepted / s.detected * 100) : 0;
                      const tc = tr >= 70 ? "#4ade80" : tr >= 40 ? "#facc15" : "#f87171";
                      return (
                        <div key={type} style={{ marginBottom: 10 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <svg width="11" height="11" viewBox="-12 -12 24 24">
                                <ThreatIcon type={type} color="#9abccc" angle={0} />
                              </svg>
                              <span style={{ fontSize: 8.5, color: "#a8ccd8" }}>{type}</span>
                            </div>
                            <span style={{ fontSize: 8, color: tc, fontWeight: "bold" }}>{s.intercepted}/{s.detected} · {tr}%</span>
                          </div>
                          <div style={{ height: 4, background: "#0d2238", borderRadius: 2, overflow: "hidden" }}>
                            <div style={{ width:`${tr}%`, height:"100%", background:tc, transition:"width 0.5s", borderRadius:2 }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {Object.keys(typeMap).length === 0 && (
                  <div style={{ padding: "40px 0", textAlign: "center", color: "#4a7890", fontSize: 9, letterSpacing: 1 }}>NO DATA YET</div>
                )}
              </div>
            );
          })()}

          {/* ── LOG tab ── */}
          {tab === "log" && (
            <div style={{ flex: 1, overflowY: "auto" }}>
              {timeline.length === 0 && (
                <div style={{ padding: "60px 0", textAlign: "center", color: "#4a7890", fontSize: 9, letterSpacing: 1 }}>NO EVENTS YET</div>
              )}
              {timeline.map(ev => {
                const cfg = {
                  intercepted: { icon: "✓", label: "INTERCEPT", bg: "#0c2416", border: "#1a4828", iconColor: "#4ade80", textColor: "#5ac870" },
                  missed:      { icon: "✗", label: "MISS",      bg: "#280a0a", border: "#4a1818", iconColor: "#f87171", textColor: "#d06060" },
                  wave:        { icon: "⚡", label: "WAVE",      bg: "#201a00", border: "#4a3c00", iconColor: "#facc15", textColor: "#d0a820" },
                  threat:      { icon: "↑", label: "DETECT",    bg: "#102030", border: "#1e3850", iconColor: "#7ab8d0", textColor: "#7ab8d0" },
                  hold:        { icon: "⏸", label: "HOLD",      bg: "#201800", border: "#4a3800", iconColor: "#facc15", textColor: "#c0a030" },
                  approved:    { icon: "👤", label: "APPROVED",  bg: "#0a2012", border: "#144020", iconColor: "#4ade80", textColor: "#5ab870" },
                  rejected:    { icon: "⛔", label: "REJECTED",  bg: "#200a0a", border: "#3a1010", iconColor: "#f87171", textColor: "#c06060" },
                  emcon:       { icon: "◇",  label: "EMCON",     bg: "#201000", border: "#503800", iconColor: "#facc15", textColor: "#c09010" },
                }[ev.type] || { icon: "·", label: ev.type.toUpperCase(), bg: "#102030", border: "#1e3850", iconColor: "#4a7890", textColor: "#4a7890" };

                const ts = new Date(ev.time);
                const timeStr = ts.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });

                return (
                  <div key={ev.id} style={{ display: "flex", borderBottom: "1px solid #0a1620" }}>
                    {/* Color stripe */}
                    <div style={{ width: 3, background: cfg.iconColor, flexShrink: 0, opacity: 0.6 }} />
                    <div style={{ flex: 1, padding: "7px 10px", background: cfg.bg }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                          <span style={{ fontSize: 10, color: cfg.iconColor }}>{cfg.icon}</span>
                          <span style={{ fontSize: 7, color: cfg.iconColor, letterSpacing: 1.5, fontWeight: "bold", background: cfg.border, padding: "1px 5px", borderRadius: 2 }}>
                            {cfg.label}
                          </span>
                          {ev.threatType && (
                            <svg width="10" height="10" viewBox="-12 -12 24 24" style={{ opacity: 0.7 }}>
                              <ThreatIcon type={ev.threatType} color={cfg.iconColor} angle={0} />
                            </svg>
                          )}
                        </div>
                        <span style={{ fontSize: 8, color: "#5a9ab8", fontVariantNumeric: "tabular-nums", fontFamily: "monospace" }}>{timeStr}</span>
                      </div>
                      <div style={{ fontSize: 8.5, color: cfg.textColor, lineHeight: 1.5 }}>{ev.label}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Bottom bar — minimal, info already in status strip ── */}
          <div style={{ padding: "6px 12px", borderTop: "1px solid #0a1820", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#081c30" }}>
            <span style={{ fontSize: 7.5, color: "#4a7898" }}>{decisions.length} decisions · {civilians.length} civilian acft</span>
            <span style={{ fontSize: 7.5, color: "#4a7898" }}>{new Date().toLocaleTimeString("en-GB")}</span>
          </div>

          {/* Wave forecast panel */}
          <div style={{ borderTop: "1px solid #0d1e2a", padding: "10px 14px", background: "#081c30" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: 8, color: "#5aaac8", letterSpacing: 2 }}>WAVE FORECAST</span>
              {forecast?.risk_level && (
                <span style={{ fontSize: 8, padding: "1px 6px", background: riskColor(forecast.risk_level) + "22", color: riskColor(forecast.risk_level), border: `1px solid ${riskColor(forecast.risk_level)}44`, letterSpacing: 1 }}>
                  {forecast.risk_level.toUpperCase()}
                </span>
              )}
            </div>

            {waveLog.length === 0 ? (
              <div style={{ fontSize: 9, color: "#4a7890", letterSpacing: 1 }}>AWAITING FIRST WAVE DATA</div>
            ) : (
              <>
                {/* Client-side heuristics */}
                <div style={{ display: "flex", gap: 12, marginBottom: 6 }}>
                  <div>
                    <div style={{ fontSize: 7, color: "#4a7898", letterSpacing: 1 }}>WAVES</div>
                    <div style={{ fontSize: 16, color: "#facc15", lineHeight: 1.2 }}>{waveLog.length}</div>
                  </div>
                  {waveLog.length >= 2 && (() => {
                    const intervals = [];
                    for (let i = 1; i < waveLog.length; i++)
                      intervals.push((waveLog[i].time - waveLog[i-1].time) / 60000);
                    const avg = intervals.reduce((a,b) => a+b, 0) / intervals.length;
                    const sinceLastMin = (Date.now() - waveLog[waveLog.length-1].time) / 60000;
                    const nextIn = Math.max(0, avg - sinceLastMin);
                    return (
                      <>
                        <div>
                          <div style={{ fontSize: 7, color: "#4a7898", letterSpacing: 1 }}>AVG INTERVAL</div>
                          <div style={{ fontSize: 16, color: "#facc15", lineHeight: 1.2 }}>{avg.toFixed(1)}m</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 7, color: "#4a7898", letterSpacing: 1 }}>NEXT WAVE ~</div>
                          <div style={{ fontSize: 16, color: nextIn < 1 ? "#f87171" : "#facc15", lineHeight: 1.2, fontWeight: "bold" }}>
                            {nextIn < 0.5 ? "NOW" : `${nextIn.toFixed(1)}m`}
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>

                {/* AI forecast fields */}
                {forecast ? (
                  <>
                    {forecast.predicted_targets?.length > 0 && (
                      <div style={{ fontSize: 9, color: "#a8ccd8", marginBottom: 4 }}>
                        <span style={{ color: "#5aaac8", fontSize: 8 }}>PREDICTED TARGET  </span>
                        {forecast.predicted_targets.join(", ")}
                      </div>
                    )}
                    {forecast.threat_types_expected?.length > 0 && (
                      <div style={{ fontSize: 9, color: "#a8ccd8", marginBottom: 4 }}>
                        <span style={{ color: "#5aaac8", fontSize: 8 }}>EXPECTED TYPES  </span>
                        {forecast.threat_types_expected.join(", ")}
                      </div>
                    )}
                    {forecast.recommended_readiness && (
                      <div style={{ fontSize: 9, color: "#4ade80", lineHeight: 1.5, marginBottom: 4 }}>
                        {forecast.recommended_readiness}
                      </div>
                    )}
                    {forecast.reasoning && (
                      <div style={{ fontSize: 8, color: "#6ab0cc", lineHeight: 1.5 }}>{forecast.reasoning}</div>
                    )}
                  </>
                ) : (
                  <div style={{ fontSize: 8, color: "#4a7890" }}>Fetching AI forecast...</div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Label({ children }) {
  return <div style={{ fontSize: 8.5, color: "#7ac8e0", letterSpacing: 1.5, marginBottom: 5, fontWeight: "bold" }}>{children}</div>;
}

function Section({ label, color, children }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <Label>{label}</Label>
      <div style={{ fontSize: 10, color, lineHeight: 1.6 }}>{children}</div>
    </div>
  );
}
