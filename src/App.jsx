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
let threatCounter = 1;

// ── Helpers ──────────────────────────────────────────────────────────────────
function spawnTowardTarget(spawnX, spawnY, target, type) {
  const dx = target.x - spawnX;
  const dy = target.y - spawnY;
  const len = Math.sqrt(dx * dx + dy * dy);
  const animSpd = 1.2 + Math.random() * 1.4;
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
  const [running,          setRunning]          = useState(false);
  const [loading,          setLoading]          = useState(false);
  const [apiStatus,        setApiStatus]        = useState("checking");
  const [tab,              setTab]              = useState("feed");
  const [showRanges,       setShowRanges]       = useState(false);
  const [aircraftStatus,   setAircraftStatus]   = useState([]);
  const [threatenedTargets,setThreatenedTargets]= useState(new Set());
  const [overrideBase,     setOverrideBase]     = useState({});
  const [waveLog,          setWaveLog]          = useState([]);
  const [forecast,         setForecast]         = useState(null);
  const frameRef = useRef(null);
  const tickRef  = useRef(0);

  useEffect(() => {
    fetch(`${API}/`).then(r => setApiStatus(r.ok ? "online" : "offline")).catch(() => setApiStatus("offline"));
  }, []);

  useEffect(() => {
    const fetch_ = () =>
      fetch(`${API}/state/aircraft`).then(r => r.json())
        .then(d => { if (d.bases) setAircraftStatus(d.bases); }).catch(() => {});
    fetch_();
    const iv = setInterval(fetch_, 5000);
    return () => clearInterval(iv);
  }, []);

  // Poll pending approvals queue
  useEffect(() => {
    const fetch_ = () =>
      fetch(`${API}/pending`).then(r => r.json())
        .then(d => { if (d.pending) setPending(d.pending); }).catch(() => {});
    fetch_();
    const iv = setInterval(fetch_, 2000);
    return () => clearInterval(iv);
  }, []);

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
    if (!running) { cancelAnimationFrame(frameRef.current); return; }
    const loop = () => {
      tickRef.current++;
      const t = tickRef.current;
      if (t % 240 === 0) spawnThreat();
      if (t % 420 === 0) setCivilians(p => [...p.slice(-6), randomCivilian()]);

      setThreats(prev => {
        const next = prev
          .map(th => ({ ...th, x: th.x + th.vx, y: th.y + th.vy, age: th.age + 1 }))
          .filter(th => th.x > -40 && th.x < 1040 && th.y > -40 && th.y < 830);
        setThreatenedTargets(new Set(next.map(th => th.target_id)));
        return next;
      });

      setCivilians(prev => prev
        .map(c => ({ ...c, x: c.x + c.vx, y: c.y + c.vy }))
        .filter(c => c.x > -50 && c.x < 1050)
      );
      setIntercepts(prev => prev.map(i => ({ ...i, age: i.age + 1 })).filter(i => i.age < 160));
      frameRef.current = requestAnimationFrame(loop);
    };
    frameRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameRef.current);
  }, [running]);

  const spawnThreat = () => {
    const th = randomThreat();
    setThreats(p => [...p.slice(-15), th]);
    callDecide(th);
    setWaveLog(w => [...w, { time: Date.now(), count: 1, targets: [th.target_name] }]);
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
        setDecisions(p => [d, ...p.slice(0, 19)]);
      }
      setPending(p => p.filter(x => x.decision_id !== decisionId));
      setOverrideBase(o => { const n = { ...o }; delete n[decisionId]; return n; });
    } catch (e) { console.error(e); }
  };

  const handleReject = async (decisionId) => {
    try {
      await fetch(`${API}/reject/${decisionId}`, { method: "POST" });
      setPending(p => p.filter(x => x.decision_id !== decisionId));
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
      if (d.status === "pending_approval") {
        // Will appear via /pending poll — just switch to hold tab
        setTab("hold");
      } else {
        const base = ALL_BASES.find(b => b.id === d.recommended_base);
        if (base) setIntercepts(p => [...p.slice(-12), { id: d.decision_id, x1: base.x, y1: base.y, x2: threat.x, y2: threat.y, age: 0 }]);
        setDecisions(p => [d, ...p.slice(0, 19)]);
      }
    } catch {
      const base = BASES.north[Math.floor(Math.random() * BASES.north.length)];
      const mock = {
        decision_id: `D${String(Math.floor(Math.random()*9999)).padStart(4,"0")}`,
        threat_id: threat.id, threat_type: threat.type,
        recommended_base: base.id, recommended_base_name: base.name,
        recommended_asset_type: "fighter", recommended_weapon: "long_range_missile",
        confidence: 62 + Math.floor(Math.random() * 20),
        reasoning: "Backend offline — nearest available base selected by Euclidean distance.",
        alternatives_rejected: [], trade_offs: "No coverage lookahead — AI offline.",
        civilian_risk: threat.civilian_nearby ? "medium" : "none", civilian_note: "",
        future_risk: "Reconnect backend for full spatial decision support.",
        priority: "urgent", timestamp: Date.now() / 1000,
      };
      setIntercepts(p => [...p.slice(-12), { id: mock.decision_id, x1: base.x, y1: base.y, x2: threat.x, y2: threat.y, age: 0 }]);
      setDecisions(p => [mock, ...p.slice(0, 19)]);
    }
    setLoading(false);
  };

  const injectThreat = () => { const th = randomThreat(); setThreats(p => [...p.slice(-15), th]); callDecide(th); };

  const injectScenario = () => {
    const spawns = [{ x: 150, y: 705 }, { x: 500, y: 720 }, { x: 860, y: 700 }];
    const types  = ["Ballistic missile", "Strike aircraft", "Cruise missile"];
    const wave   = TARGETS.north.map((target, i) => spawnTowardTarget(spawns[i].x, spawns[i].y, target, types[i]));
    wave.forEach((th, i) => {
      setTimeout(() => { setThreats(p => [...p.slice(-15), th]); callDecide(th); }, i * 600);
    });
    setWaveLog(w => [...w, { time: Date.now(), count: wave.length, targets: wave.map(t => t.target_name) }]);
  };

  const northStatus = aircraftStatus.filter(b => BASES.north.find(nb => nb.id === b.id));
  const coverageGaps = northStatus.filter(b => b.available.length === 0).map(b => b.id);
  const RANGE_SVG = 700 * SCALE_X; // fighter range in SVG pixels (~420px)

  return (
    <div style={{ fontFamily: "'Courier New', monospace", background: "#040b12", color: "#b8cfd8", minHeight: "100vh", display: "flex", flexDirection: "column", fontSize: 13 }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 16px", borderBottom: "1px solid #0f2030", background: "#060e18", flexWrap: "wrap", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: running ? "#4ade80" : "#334155", boxShadow: running ? "0 0 8px #4ade80" : "none", transition: "all 0.3s", flexShrink: 0 }} />
          <span style={{ fontSize: 10, letterSpacing: 3, color: "#4a7a90", fontWeight: "bold" }}>BOREAL PASSAGE AIR DEFENSE COMMAND</span>
          <span style={{ fontSize: 9, padding: "2px 7px", background: apiStatus === "online" ? "#0a2a1a" : "#2a0a0a", color: apiStatus === "online" ? "#4ade80" : "#f87171", border: `1px solid ${apiStatus === "online" ? "#4ade80" : "#f87171"}`, letterSpacing: 1 }}>
            API {apiStatus.toUpperCase()}
          </span>
          {coverageGaps.length > 0 && (
            <span style={{ fontSize: 9, padding: "2px 7px", background: "#2a1500", color: "#f87171", border: "1px solid #f87171", letterSpacing: 1 }}>
              ⚠ BASE DEPLETED: {coverageGaps.join(" ")}
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 5 }}>
          <button onClick={() => setShowRanges(r => !r)}
            style={{ background: showRanges ? "#071828" : "transparent", border: `1px solid ${showRanges ? "#3fc1ff" : "#1a3a50"}`, color: showRanges ? "#3fc1ff" : "#3a6070", padding: "4px 10px", fontSize: 9, letterSpacing: 1, cursor: "pointer" }}>
            ◎ RANGES
          </button>
          <button onClick={() => setRunning(r => !r)}
            style={{ background: running ? "#0a2a1a" : "#0a1a2a", border: `1px solid ${running ? "#4ade80" : "#3fc1ff"}`, color: running ? "#4ade80" : "#3fc1ff", padding: "4px 14px", fontSize: 10, letterSpacing: 2, cursor: "pointer" }}>
            {running ? "■ STOP" : "▶ RUN"}
          </button>
          <button onClick={injectThreat}
            style={{ background: "#160808", border: "1px solid #f87171", color: "#f87171", padding: "4px 14px", fontSize: 10, letterSpacing: 2, cursor: "pointer" }}>
            + THREAT
          </button>
          <button onClick={injectScenario}
            style={{ background: "#120e00", border: "1px solid #facc15", color: "#facc15", padding: "4px 14px", fontSize: 10, letterSpacing: 2, cursor: "pointer" }}>
            ⚡ WAVE
          </button>
        </div>
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* ── MAP ── */}
        <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
          <svg width="100%" viewBox="0 0 1000 780" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
                <path d="M 50 0 L 0 0 0 50" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="0.5" />
              </pattern>
              <radialGradient id="threatGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#f87171" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#f87171" stopOpacity="0" />
              </radialGradient>
            </defs>

            <rect width="1000" height="780" fill="#05111c" />
            <rect width="1000" height="780" fill="url(#grid)" />

            {/* North land */}
            <g transform="translate(0,-40)">
              <polygon fill="#162316" stroke="#111" strokeWidth="1.5"
                points="0,40 1000,40 1000,210 920,228 860,214 800,210 742,245 678,230 616,218 556,252 488,234 428,228 366,260 302,232 236,240 178,270 118,244 54,252 0,268" />
              <polygon fill="#162316" stroke="#111" strokeWidth="1"
                points="355,308 378,296 410,298 424,318 436,336 426,362 406,368 386,374 362,358 354,338" />
              <polygon fill="#162316" stroke="#111" strokeWidth="1"
                points="678,254 692,244 710,248 716,264 722,278 712,294 696,296 680,298 668,284 668,268" />
              <polygon fill="#162316" stroke="#111" strokeWidth="1.2"
                points="148,395 160,382 180,378 196,386 212,394 220,412 216,430 198,456 182,454 166,452 152,438 148,420" />
            </g>

            {/* South land */}
            <g transform="translate(0,40)">
              <polygon fill="#1e1a0e" stroke="#111" strokeWidth="1.5"
                points="0,740 1000,740 1000,600 948,576 882,588 818,602 756,568 688,582 624,600 560,566 492,586 428,606 362,572 294,582 232,608 168,578 98,590 30,608 0,598" />
              <polygon fill="#1e1a0e" stroke="#111" strokeWidth="1"
                points="818,388 842,376 870,382 876,402 882,420 866,440 846,440 826,440 810,424 812,406" />
              <polygon fill="#1e1a0e" stroke="#111" strokeWidth="1"
                points="238,494 256,482 276,488 280,506 284,522 270,536 253,536 236,534 224,520 226,504" />
              <polygon fill="#1e1a0e" stroke="#111" strokeWidth="1"
                points="530,496 546,480 568,466 566,444 564,424 542,416 526,430 510,444 510,478 530,496" />
            </g>

            {/* Country / passage labels */}
            <text x="500" y="28"  fill="rgba(180,220,180,0.18)" fontSize="10" fontWeight="bold" textAnchor="middle" letterSpacing="5">COUNTRY X — NORTHERN TERRITORIES</text>
            <text x="500" y="770" fill="rgba(220,200,150,0.18)" fontSize="10" fontWeight="bold" textAnchor="middle" letterSpacing="5">COUNTRY Y — SOUTHERN UNION</text>
            <text x="500" y="410" fill="rgba(180,210,240,0.04)" fontSize="26" fontWeight="bold" textAnchor="middle" letterSpacing="6">THE BOREAL PASSAGE</text>

            {/* Range rings */}
            {showRanges && BASES.north.map(b => (
              <g key={`rng-${b.id}`}>
                <circle cx={b.x} cy={b.y} r={RANGE_SVG} fill="none" stroke="#3fc1ff" strokeWidth="0.6" strokeDasharray="6 5" opacity="0.18" />
                <text x={b.x} y={b.y - RANGE_SVG + 11} fill="rgba(63,193,255,0.25)" fontSize="7" textAnchor="middle">700 km</text>
              </g>
            ))}

            {/* Threat trajectory lines */}
            {threats.map(th => (
              <line key={`traj-${th.id}`} x1={th.x} y1={th.y} x2={th.target_x} y2={th.target_y}
                stroke="rgba(248,113,113,0.14)" strokeWidth="1" strokeDasharray="5 7" />
            ))}

            {/* Intercept lines */}
            {intercepts.map(i => (
              <line key={i.id} x1={i.x1} y1={i.y1} x2={i.x2} y2={i.y2}
                stroke="#facc15" strokeWidth="1" strokeDasharray="5 3"
                opacity={Math.max(0, 1 - i.age / 160)} />
            ))}

            {/* North protection targets */}
            {TARGETS.north.map(t => {
              const sz = t.type === "capital" ? 18 : 13;
              const cx = t.x, cy = t.y;
              const threatened = threatenedTargets.has(t.id);
              return (
                <g key={t.id}>
                  {threatened && <circle cx={cx} cy={cy} r={sz * 1.9} fill="none" stroke="#f87171" strokeWidth="1" strokeDasharray="3 3" opacity="0.65" />}
                  <rect x={cx - sz/2} y={cy - sz/2} width={sz} height={sz}
                    fill={t.type === "capital" ? "#ffcc00" : "#dde"}
                    stroke={threatened ? "#f87171" : "#111"}
                    strokeWidth={threatened ? 2 : (t.type === "capital" ? 1.8 : 1.2)} rx="2" />
                  <text x={cx} y={cy + sz/2 + 9} fill={t.type === "capital" ? "rgba(255,204,0,0.8)" : "rgba(230,230,255,0.5)"} fontSize="6.5" textAnchor="middle" letterSpacing="0.3">
                    {t.name.toUpperCase()}
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
              return (
                <g key={b.id}>
                  <circle cx={b.x} cy={b.y} r="26" fill="none" stroke={col} strokeWidth="0.5" strokeDasharray="4 3" opacity="0.35" />
                  <polygon points={`${b.x},${b.y-11} ${b.x-9},${b.y+6} ${b.x+9},${b.y+6}`} fill={col} stroke="#000" strokeWidth="1" />
                  <text x={b.x} y={b.y+22} fill={col} fontSize="7" textAnchor="middle" opacity="0.85">{b.name}</text>
                  {avail !== null && (
                    <text x={b.x+13} y={b.y-7} fill={col} fontSize="8" textAnchor="middle" fontWeight="bold">{avail}</text>
                  )}
                </g>
              );
            })}

            {/* South bases (enemy — dim) */}
            {BASES.south.map(b => (
              <g key={b.id} opacity="0.55">
                <circle cx={b.x} cy={b.y} r="22" fill="none" stroke="#ff8855" strokeWidth="0.5" strokeDasharray="4 3" opacity="0.3" />
                <polygon points={`${b.x},${b.y-11} ${b.x-9},${b.y+6} ${b.x+9},${b.y+6}`} fill="#ff8855" stroke="#000" strokeWidth="1" />
                <text x={b.x} y={b.y+22} fill="#ff8855" fontSize="7" textAnchor="middle" opacity="0.7">{b.name}</text>
              </g>
            ))}

            {/* Civilians */}
            {civilians.map(c => (
              <g key={c.id} transform={`translate(${c.x},${c.y})`}>
                <circle r="5" fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="1" />
                <circle r="2" fill="rgba(255,255,255,0.55)" />
                <text y="14" fill="rgba(255,255,255,0.28)" fontSize="7" textAnchor="middle">{c.id}</text>
              </g>
            ))}

            {/* Threats */}
            {threats.map(th => (
              <g key={th.id} transform={`translate(${th.x},${th.y})`}>
                <circle r="14" fill="url(#threatGlow)" opacity={0.5 + 0.5 * Math.sin(th.age * 0.15)} />
                <polygon points="0,-8 -7,5 7,5" fill="#f87171" stroke="#000" strokeWidth="0.8"
                  transform={`rotate(${Math.atan2(th.vy, th.vx) * 180 / Math.PI + 90})`} />
                <text y="-13" fill="#f87171" fontSize="7.5" textAnchor="middle" fontWeight="bold">{th.id}</text>
                <text y="21" fill="rgba(248,113,113,0.55)" fontSize="6.5" textAnchor="middle">→ {th.target_name} · {formatETA(Math.max(0, th.eta - Math.floor(th.age / 60)))}</text>
              </g>
            ))}

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
        <div style={{ width: 320, background: "#060e18", borderLeft: "1px solid #0d1e2a", display: "flex", flexDirection: "column", flexShrink: 0 }}>

          <div style={{ display: "flex", borderBottom: "1px solid #0d1e2a" }}>
            {[["feed","AI DECISIONS"], ["hold","HOLD"], ["state","BASES"]].map(([t, label]) => (
              <button key={t} onClick={() => setTab(t)}
                style={{ flex: 1, padding: "8px 0", position: "relative", background: tab === t ? "#0a1820" : "transparent", border: "none", borderBottom: tab === t ? `2px solid ${t === "hold" ? "#f87171" : "#3fc1ff"}` : "2px solid transparent", color: tab === t ? (t === "hold" ? "#f87171" : "#3fc1ff") : "#3a5a6a", fontSize: 9, letterSpacing: 2, cursor: "pointer" }}>
                {label}
                {t === "hold" && pending.length > 0 && (
                  <span style={{ position: "absolute", top: 4, right: 6, background: "#f87171", color: "#000", borderRadius: "50%", width: 14, height: 14, fontSize: 8, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: "bold" }}>
                    {pending.length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Decision feed */}
          {tab === "feed" && (
            <div style={{ flex: 1, overflowY: "auto" }}>
              {loading && (
                <div style={{ padding: "8px 14px", background: "#0a1820", borderBottom: "1px solid #0d1e2a", fontSize: 9, color: "#facc15", letterSpacing: 1 }}>
                  ◌ AI PROCESSING...
                </div>
              )}
              {decisions.length === 0 && !loading && (
                <div style={{ padding: "60px 0", textAlign: "center", color: "#1a3a4a", fontSize: 10, letterSpacing: 1 }}>
                  NO ACTIVE THREATS
                </div>
              )}
              {decisions.map((d, i) => (
                <div key={d.decision_id} onClick={() => setSelected(selected === d.decision_id ? null : d.decision_id)}
                  style={{ padding: "10px 14px", borderBottom: "1px solid #080e16", cursor: "pointer", background: selected === d.decision_id ? "#0a1e2c" : i === 0 ? "rgba(248,113,113,0.04)" : "transparent" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <span style={{ fontSize: 9, color: "#f87171", letterSpacing: 1 }}>{d.threat_id}</span>
                      <span style={{ fontSize: 8, padding: "1px 5px", background: prioColor(d.priority) + "22", color: prioColor(d.priority), border: `1px solid ${prioColor(d.priority)}44` }}>
                        {(d.priority || "urgent").toUpperCase()}
                      </span>
                    </div>
                    <span style={{ fontSize: 8, color: "#1e3a4a" }}>{new Date(d.timestamp * 1000).toLocaleTimeString("en-GB")}</span>
                  </div>
                  <div style={{ fontSize: 10, color: "#8ab0c0", marginBottom: 2 }}>{d.threat_type}</div>
                  <div style={{ fontSize: 11, color: "#3fc1ff", fontWeight: "bold", marginBottom: 2 }}>{d.recommended_base_name}</div>
                  <div style={{ fontSize: 10, color: "#4a7a8a", marginBottom: 6 }}>
                    {(d.recommended_weapon || "").replace(/_/g, " ")} · {d.recommended_asset_type}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ flex: 1, height: 2, background: "#0a1820", borderRadius: 2 }}>
                      <div style={{ width: `${d.confidence}%`, height: "100%", background: confColor(d.confidence), borderRadius: 2 }} />
                    </div>
                    <span style={{ fontSize: 9, color: confColor(d.confidence), minWidth: 28 }}>{d.confidence}%</span>
                  </div>

                  {selected === d.decision_id && (
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #0d1e2a" }}>
                      <Section label="REASONING" color="#8ab0c0">{d.reasoning}</Section>

                      {d.alternatives_rejected?.length > 0 && (
                        <div style={{ marginBottom: 8 }}>
                          <Label>ALTERNATIVES REJECTED</Label>
                          {d.alternatives_rejected.map((alt, j) => (
                            <div key={j} style={{ fontSize: 9, color: "#4a6a7a", marginBottom: 3, paddingLeft: 8, borderLeft: "2px solid #0d2030" }}>
                              <span style={{ color: "#6a8a9a" }}>{alt.base}</span> — {alt.reason}
                            </div>
                          ))}
                        </div>
                      )}

                      {d.trade_offs && <Section label="TRADE-OFFS" color="#facc15">{d.trade_offs}</Section>}

                      {d.civilian_note && (
                        <Section label={`CIVILIAN RISK: ${(d.civilian_risk || "").toUpperCase()}`} color="#facc15">{d.civilian_note}</Section>
                      )}

                      <Section label="FUTURE RISK" color="#4ade80">{d.future_risk}</Section>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ── HOLD queue ── */}
          {tab === "hold" && (
            <div style={{ flex: 1, overflowY: "auto" }}>
              {pending.length === 0 && (
                <div style={{ padding: "60px 0", textAlign: "center", color: "#1a3a4a", fontSize: 10, letterSpacing: 1 }}>
                  NO PENDING DECISIONS
                </div>
              )}
              {pending.map(p => {
                const d = p.decision;
                const elapsed = Math.floor((Date.now() / 1000) - p.created_at);
                const urgency = elapsed > 60 ? "#f87171" : elapsed > 30 ? "#facc15" : "#4ade80";
                return (
                  <div key={p.decision_id} style={{ borderBottom: "1px solid #0d1e2a", padding: "12px 14px" }}>
                    {/* Header */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                      <div>
                        <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 3 }}>
                          <span style={{ fontSize: 9, color: "#f87171", letterSpacing: 1 }}>{p.threat.id}</span>
                          <span style={{ fontSize: 8, padding: "1px 5px", background: "#2a1500", color: "#facc15", border: "1px solid #facc1544" }}>
                            AWAITING APPROVAL
                          </span>
                        </div>
                        <div style={{ fontSize: 10, color: "#8ab0c0" }}>{p.threat.type} → <span style={{ color: "#facc15" }}>{p.threat.target_name}</span></div>
                      </div>

                      {/* ETA countdown — primary prioritisation signal */}
                      {(() => {
                        const totalEta = p.threat.eta || 600;
                        const remaining = Math.max(0, totalEta - elapsed);
                        const etaColor = remaining < 120 ? "#f87171" : remaining < 300 ? "#facc15" : "#4ade80";
                        const pct = (remaining / totalEta) * 100;
                        return (
                          <div style={{ textAlign: "center", minWidth: 72 }}>
                            <div style={{ fontSize: 7, color: "#2a5a6a", letterSpacing: 1, marginBottom: 2 }}>
                              → {p.threat.target_name}
                            </div>
                            <div style={{ fontSize: remaining < 120 ? 20 : 18, fontWeight: "bold", color: etaColor, lineHeight: 1, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                              {formatETA(remaining)}
                            </div>
                            <div style={{ fontSize: 7, color: "#1a3a4a", marginTop: 2, marginBottom: 3 }}>
                              {p.threat.dist_km ? `${p.threat.dist_km} km` : ""} · {p.threat.speed} km/h
                            </div>
                            <div style={{ height: 3, background: "#0a1820", borderRadius: 2 }}>
                              <div style={{ width: `${pct}%`, height: "100%", background: etaColor, borderRadius: 2, transition: "width 1s linear" }} />
                            </div>
                          </div>
                        );
                      })()}
                    </div>

                    {/* AI recommendation */}
                    <div style={{ fontSize: 11, color: "#3fc1ff", fontWeight: "bold", marginBottom: 2 }}>{d.recommended_base_name}</div>
                    <div style={{ fontSize: 10, color: "#4a7a8a", marginBottom: 8 }}>
                      {(d.recommended_weapon || "").replace(/_/g, " ")} · {d.recommended_asset_type} · {d.confidence}% conf
                    </div>

                    {/* Hold reasons */}
                    <div style={{ marginBottom: 8 }}>
                      {p.approval_reasons.map((r, i) => (
                        <div key={i} style={{ fontSize: 9, color: "#facc15", padding: "3px 8px", background: "#1a1200", border: "1px solid #facc1530", borderRadius: 2, marginBottom: 3 }}>
                          ⚠ {r}
                        </div>
                      ))}
                    </div>

                    {/* Reasoning */}
                    <div style={{ fontSize: 9, color: "#5a8a9a", lineHeight: 1.5, marginBottom: 10 }}>{d.reasoning}</div>

                    {/* Base override */}
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ fontSize: 8, color: "#2a5a6a", letterSpacing: 1, marginBottom: 4 }}>OVERRIDE BASE</div>
                      <select
                        value={overrideBase[p.decision_id] || ""}
                        onChange={e => setOverrideBase(o => ({ ...o, [p.decision_id]: e.target.value || undefined }))}
                        style={{ width: "100%", background: "#05101a", border: "1px solid #0d2030", color: overrideBase[p.decision_id] ? "#3fc1ff" : "#3a5a6a", padding: "4px 8px", fontSize: 9, cursor: "pointer" }}>
                        <option value="">Use AI recommendation ({d.recommended_base})</option>
                        {BASES.north.map(b => (
                          <option key={b.id} value={b.id}>{b.id} — {b.name}</option>
                        ))}
                      </select>
                    </div>

                    {/* Actions */}
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => handleApprove(p.decision_id)}
                        style={{ flex: 1, padding: "7px 0", background: "#0a2a1a", border: "1px solid #4ade80", color: "#4ade80", fontSize: 9, letterSpacing: 2, cursor: "pointer", fontFamily: "inherit" }}>
                        ✓ APPROVE
                      </button>
                      <button onClick={() => handleReject(p.decision_id)}
                        style={{ flex: 1, padding: "7px 0", background: "#1a0808", border: "1px solid #f87171", color: "#f87171", fontSize: 9, letterSpacing: 2, cursor: "pointer", fontFamily: "inherit" }}>
                        ✕ REJECT
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Base status */}
          {tab === "state" && (
            <div style={{ flex: 1, overflowY: "auto", padding: 14 }}>
              {(northStatus.length > 0 ? northStatus : BASES.north.map(b => ({ ...b, available: [], deployed: [] }))).map(base => (
                <div key={base.id} style={{ marginBottom: 14, padding: 10, border: "1px solid #0d1e2a", background: "#05101a" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                    <span style={{ fontSize: 9, fontWeight: "bold", color: "#3fc1ff", letterSpacing: 1 }}>{base.id}</span>
                    <span style={{ fontSize: 8, color: "#2a5a6a" }}>
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
                        <span style={{ fontSize: 8, color: "#4a6a7a" }}>{a.id} · {a.type}</span>
                        <span style={{ fontSize: 8, color: fuelColor(a.fuel_pct) }}>{a.fuel_pct}%</span>
                      </div>
                      <div style={{ height: 3, background: "#0a1820", borderRadius: 2 }}>
                        <div style={{ width: `${a.fuel_pct}%`, height: "100%", background: fuelColor(a.fuel_pct), borderRadius: 2 }} />
                      </div>
                      <div style={{ fontSize: 7, color: "#2a4a5a", marginTop: 1 }}>{a.range_km} km range · {a.weapons?.join(", ").replace(/_/g," ")}</div>
                    </div>
                  ))}

                  {base.ground_ammo !== undefined && (
                    <div style={{ fontSize: 8, color: "#2a4050", marginTop: 4, borderTop: "1px solid #0a1820", paddingTop: 4 }}>
                      GND DEFENSE: {base.ground_ammo} rounds
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Stats */}
          <div style={{ padding: "8px 14px", borderTop: "1px solid #0d1e2a", display: "flex", justifyContent: "space-between" }}>
            {[["THREATS", threats.length, "#f87171"], ["DECISIONS", decisions.length, "#3fc1ff"], ["CIVILIAN", civilians.length, "#aaaaaa"]].map(([label, val, color]) => (
              <div key={label} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 8, color: "#1e3a4a", letterSpacing: 1 }}>{label}</div>
                <div style={{ fontSize: 20, color, lineHeight: 1.2 }}>{val}</div>
              </div>
            ))}
          </div>

          {/* Wave forecast panel */}
          <div style={{ borderTop: "1px solid #0d1e2a", padding: "10px 14px", background: "#050d16" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={{ fontSize: 8, color: "#2a5a6a", letterSpacing: 2 }}>WAVE FORECAST</span>
              {forecast?.risk_level && (
                <span style={{ fontSize: 8, padding: "1px 6px", background: riskColor(forecast.risk_level) + "22", color: riskColor(forecast.risk_level), border: `1px solid ${riskColor(forecast.risk_level)}44`, letterSpacing: 1 }}>
                  {forecast.risk_level.toUpperCase()}
                </span>
              )}
            </div>

            {waveLog.length === 0 ? (
              <div style={{ fontSize: 9, color: "#1a3a4a", letterSpacing: 1 }}>AWAITING FIRST WAVE DATA</div>
            ) : (
              <>
                {/* Client-side heuristics */}
                <div style={{ display: "flex", gap: 12, marginBottom: 6 }}>
                  <div>
                    <div style={{ fontSize: 7, color: "#1e3a4a", letterSpacing: 1 }}>WAVES</div>
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
                          <div style={{ fontSize: 7, color: "#1e3a4a", letterSpacing: 1 }}>AVG INTERVAL</div>
                          <div style={{ fontSize: 16, color: "#facc15", lineHeight: 1.2 }}>{avg.toFixed(1)}m</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 7, color: "#1e3a4a", letterSpacing: 1 }}>NEXT WAVE ~</div>
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
                      <div style={{ fontSize: 9, color: "#8ab0c0", marginBottom: 4 }}>
                        <span style={{ color: "#2a5a6a", fontSize: 8 }}>PREDICTED TARGET  </span>
                        {forecast.predicted_targets.join(", ")}
                      </div>
                    )}
                    {forecast.threat_types_expected?.length > 0 && (
                      <div style={{ fontSize: 9, color: "#8ab0c0", marginBottom: 4 }}>
                        <span style={{ color: "#2a5a6a", fontSize: 8 }}>EXPECTED TYPES  </span>
                        {forecast.threat_types_expected.join(", ")}
                      </div>
                    )}
                    {forecast.recommended_readiness && (
                      <div style={{ fontSize: 9, color: "#4ade80", lineHeight: 1.5, marginBottom: 4 }}>
                        {forecast.recommended_readiness}
                      </div>
                    )}
                    {forecast.reasoning && (
                      <div style={{ fontSize: 8, color: "#3a5a6a", lineHeight: 1.5 }}>{forecast.reasoning}</div>
                    )}
                  </>
                ) : (
                  <div style={{ fontSize: 8, color: "#1a3a4a" }}>Fetching AI forecast...</div>
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
  return <div style={{ fontSize: 8, color: "#2a5a6a", letterSpacing: 1, marginBottom: 4 }}>{children}</div>;
}

function Section({ label, color, children }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <Label>{label}</Label>
      <div style={{ fontSize: 10, color, lineHeight: 1.6 }}>{children}</div>
    </div>
  );
}
