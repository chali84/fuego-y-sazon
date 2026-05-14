import { useState, useEffect, useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import { db } from "./firebase";
import {
  collection, doc, getDocs, setDoc, updateDoc, deleteDoc, onSnapshot
} from "firebase/firestore";

const BASE_URL = "https://fuego-y-sazon.vercel.app/cliente";
const ADMIN_PIN = "791127";
const VISITS_GOAL = 8;
const TERMS_URL = "#";
const PRIVACY_URL = "#";

// ── Detectar ruta ──
function getRoute() {
  const path = window.location.pathname;
  if (path.startsWith("/cliente/registro")) return { type: "register" };
  if (path.startsWith("/cliente/")) {
    const id = path.replace("/cliente/", "");
    return { type: "clientView", id };
  }
  return { type: "admin" };
}

// ── QR escaneable ──
function QRCode({ value, size = 140 }) {
  return (
    <QRCodeSVG
      value={value}
      size={size}
      bgColor="#ffffff"
      fgColor="#000000"
      data-qr-value={value}
      style={{ borderRadius: 10, border: "3px solid #f48c06" }}
    />
  );
}

// ── Descargar QR ──
function downloadQR(value, filename) {
  const size = 400, padding = 40, total = size + padding * 2;
  const svgEl = document.querySelector(`svg[data-qr-value="${value}"]`);
  if (!svgEl) return;
  const clone = svgEl.cloneNode(true);
  clone.setAttribute("width", size);
  clone.setAttribute("height", size);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const svg64 = btoa(unescape(encodeURIComponent(new XMLSerializer().serializeToString(clone))));
  const canvas = document.createElement("canvas");
  canvas.width = total; canvas.height = total;
  const ctx = canvas.getContext("2d");
  const img = new Image();
  img.onload = () => {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, total, total);
    ctx.drawImage(img, padding, padding, size, size);
    const link = document.createElement("a");
    link.download = filename;
    link.href = canvas.toDataURL("image/png");
    link.click();
  };
  img.src = "data:image/svg+xml;base64," + svg64;
}

// ── Toast ──
const Toast = ({ toast }) => toast ? (
  <div style={{
    position: "fixed", top: 18, left: "50%", transform: "translateX(-50%)",
    background: toast.color || "#e85d04", color: "#fff", padding: "10px 22px",
    borderRadius: 12, fontWeight: 600, zIndex: 999, boxShadow: "0 4px 14px #0003",
    fontSize: 15, whiteSpace: "nowrap"
  }}>{toast.msg}</div>
) : null;

// ── Taco Stamps ──
const TacoStamps = ({ visits }) => (
  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, justifyContent: "center", margin: "16px 0" }}>
    {Array.from({ length: VISITS_GOAL }).map((_, i) => (
      <div key={i} style={{
        width: 44, height: 44, borderRadius: "50%",
        background: i < visits ? "linear-gradient(135deg,#e85d04,#f48c06)" : "#f3e9dc",
        border: i < visits ? "2px solid #e85d04" : "2px dashed #ccc",
        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22,
        boxShadow: i < visits ? "0 2px 6px #e85d0440" : "none"
      }}>{i < visits ? "🌮" : ""}</div>
    ))}
  </div>
);

// ── Header ──
const Header = ({ sub }) => (
  <div style={{ background: "linear-gradient(135deg,#e85d04,#f48c06)", padding: "16px 20px 12px", textAlign: "center" }}>
    <div style={{ fontSize: 28 }}>🔥</div>
    <div style={{ color: "#fff", fontWeight: 800, fontSize: 20 }}>Fuego y Sazón</div>
    <div style={{ color: "#ffe8cc", fontSize: 12 }}>{sub}</div>
  </div>
);

// ── Verificar 24hrs ──
function canRegisterToday(lastVisitTimestamp) {
  if (!lastVisitTimestamp) return true;
  return (new Date() - new Date(lastVisitTimestamp)) / (1000 * 60 * 60) >= 24;
}

// ── Leer QR desde imagen (jsQR via CDN) ──
async function decodeQRFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        // jsQR debe estar cargado globalmente
        if (typeof window.jsQR !== "function") {
          reject(new Error("jsQR no disponible"));
          return;
        }
        const code = window.jsQR(imageData.data, imageData.width, imageData.height);
        if (code) resolve(code.data);
        else reject(new Error("No se detectó QR"));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// ══════════════════════════════════════════
//  ESCANER QR — input nativo (compatible iOS)
// ══════════════════════════════════════════
function QRScanner({ onResult, onClose, onError }) {
  const inputRef = useRef(null);

  useEffect(() => {
    // Cargar jsQR desde CDN si no está disponible
    if (typeof window.jsQR !== "function") {
      const script = document.createElement("script");
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/jsqr/1.4.0/jsQR.min.js";
      script.onload = () => { if (inputRef.current) inputRef.current.click(); };
      script.onerror = () => onError("No se pudo cargar el lector de QR.");
      document.head.appendChild(script);
    } else {
      setTimeout(() => { if (inputRef.current) inputRef.current.click(); }, 100);
    }
  }, []);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) { onClose(); return; }
    try {
      const text = await decodeQRFromFile(file);
      const id = text.split("/cliente/")[1];
      if (id) onResult(id);
      else onError("El QR no corresponde a un cliente de Fuego y Sazón.");
    } catch {
      onError("No se pudo leer el QR. Intenta con una foto más clara y bien encuadrada.");
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: "none" }}
        onChange={handleFile}
      />
    </>
  );
}

// ══════════════════════════════════════════
//  VISTA CLIENTE (ruta /cliente/:id)
// ══════════════════════════════════════════
function ClientView({ clientId }) {
  const [client, setClient] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, "clients", clientId), snap => {
      setClient(snap.exists() ? { id: snap.id, ...snap.data() } : null);
      setLoading(false);
    });
    return () => unsub();
  }, [clientId]);

  if (loading) return <div style={{ textAlign: "center", padding: 40, color: "#e85d04", fontWeight: 600 }}>Cargando tu tarjeta…</div>;
  if (!client) return (
    <div style={{ textAlign: "center", padding: 40 }}>
      <div style={{ fontSize: 48 }}>❌</div>
      <div style={{ fontWeight: 700, color: "#e85d04", marginTop: 10 }}>Cliente no encontrado</div>
    </div>
  );

  const v = Math.min(client.visits, VISITS_GOAL);
  const hasCombo = client.visits >= VISITS_GOAL;
  const qrValue = `${BASE_URL}/${client.id}`;

  return (
    <div style={{ minHeight: "100vh", background: "#fff8f0", fontFamily: "'Segoe UI',sans-serif" }}>
      <Header sub="Tu Tarjeta de Lealtad" />
      <div style={{ padding: 20 }}>
        <div style={{ background: "#fff", borderRadius: 20, padding: 24, boxShadow: "0 4px 20px #e85d0420", textAlign: "center" }}>
          <div style={{ fontSize: 52 }}>👤</div>
          <div style={{ fontWeight: 800, fontSize: 22, color: "#333" }}>{client.name}</div>
          <div style={{ color: "#aaa", fontSize: 13 }}>📱 {client.phone}</div>
          <div style={{ color: "#bbb", fontSize: 12, marginTop: 2 }}>Combos canjeados: {client.canjes}</div>
          <div style={{ margin: "14px 0 4px", fontWeight: 700, color: hasCombo ? "#2d6a4f" : "#e85d04", fontSize: 16 }}>
            {hasCombo ? `🎉 ¡Completaste ${VISITS_GOAL} visitas!` : `${client.visits} de ${VISITS_GOAL} visitas`}
          </div>
          <TacoStamps visits={v} />
          {hasCombo ? (
            <div style={{ background: "#d8f3dc", borderRadius: 14, padding: 16, marginTop: 8 }}>
              <div style={{ fontSize: 36 }}>🎁</div>
              <div style={{ fontWeight: 700, color: "#2d6a4f", fontSize: 16 }}>¡Tienes un combo de regalo!</div>
              <div style={{ color: "#52b788", fontSize: 13, marginTop: 4 }}>Muéstrale esta pantalla al cajero para canjearlo</div>
            </div>
          ) : (
            <div style={{ background: "#fff4e6", borderRadius: 12, padding: 12, marginTop: 8 }}>
              <div style={{ color: "#e85d04", fontWeight: 600, fontSize: 14 }}>
                Te faltan <strong>{VISITS_GOAL - client.visits}</strong> visita(s) para tu combo 🌮
              </div>
              <div style={{ color: "#aaa", fontSize: 12, marginTop: 4 }}>¡Sigue viniendo a Fuego y Sazón!</div>
            </div>
          )}
          <div style={{ marginTop: 20, padding: 16, background: "#f9f9f9", borderRadius: 12 }}>
            <div style={{ fontSize: 12, color: "#aaa", marginBottom: 10 }}>📲 Tu QR personal — muéstralo al registrar tu visita</div>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
              <QRCode value={qrValue} size={180} />
            </div>
            <button onClick={() => downloadQR(qrValue, `qr-lealtad-${client.name.replace(/ /g, "-")}.png`)} style={{
              padding: "10px 22px", background: "linear-gradient(135deg,#e85d04,#f48c06)",
              color: "#fff", border: "none", borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: "pointer"
            }}>⬇️ Guardar QR en mi galería</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════
//  REGISTRO CLIENTE
// ══════════════════════════════════════════
function RegisterView() {
  const [form, setForm] = useState({ name: "", phone: "" });
  const [err, setErr] = useState("");
  const [done, setDone] = useState(null);

  const submit = async () => {
    if (!form.name.trim() || !form.phone.trim()) return setErr("Por favor llena todos los campos.");
    const snap = await getDocs(collection(db, "clients"));
    const exists = snap.docs.find(d => d.data().phone === form.phone);
    if (exists) return setErr("Ya existe un cliente con ese teléfono.");
    const id = "c" + Date.now();
    await setDoc(doc(db, "clients", id), {
      name: form.name.trim(), phone: form.phone.trim(),
      visits: 0, canjes: 0, lastVisit: null
    });
    setDone(id);
  };

  if (done) {
    const qrValue = `${BASE_URL}/${done}`;
    return (
      <div style={{ minHeight: "100vh", background: "#fff8f0", fontFamily: "'Segoe UI',sans-serif" }}>
        <Header sub="¡Registro exitoso!" />
        <div style={{ padding: 20, textAlign: "center" }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 24, boxShadow: "0 2px 12px #e85d0420" }}>
            <div style={{ fontSize: 52 }}>🎉</div>
            <div style={{ fontWeight: 800, fontSize: 20, color: "#333", marginBottom: 8 }}>¡Bienvenido a Fuego y Sazón!</div>
            <div style={{ color: "#aaa", fontSize: 14, marginBottom: 16 }}>Ya estás registrado en nuestro programa de lealtad</div>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}>
              <QRCode value={qrValue} size={200} />
            </div>
            <button onClick={() => downloadQR(qrValue, "qr-lealtad-fuego-y-sazon.png")} style={{
              padding: "10px 22px", background: "linear-gradient(135deg,#e85d04,#f48c06)",
              color: "#fff", border: "none", borderRadius: 10, fontWeight: 700,
              fontSize: 14, cursor: "pointer", marginBottom: 10
            }}>⬇️ Guardar mi QR en la galería</button>
            <div style={{ color: "#e85d04", fontWeight: 600, fontSize: 13 }}>Guarda tu QR — es tu tarjeta de lealtad</div>
            <div style={{ color: "#aaa", fontSize: 12, marginTop: 4 }}>Muéstralo en cada visita para acumular tus 🌮</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#fff8f0", fontFamily: "'Segoe UI',sans-serif" }}>
      <Header sub="Únete a nuestro programa de lealtad" />
      <div style={{ padding: 20 }}>
        <div style={{ background: "#fff", borderRadius: 16, padding: 24, boxShadow: "0 2px 12px #e85d0420", textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>🌮</div>
          <div style={{ fontWeight: 800, fontSize: 18, color: "#333", marginBottom: 4 }}>Regístrate gratis</div>
          <div style={{ color: "#aaa", fontSize: 13, marginBottom: 18 }}>Acumula visitas y gana combos de regalo</div>
          {err && <div style={{ color: "#e85d04", fontSize: 13, marginBottom: 10 }}>{err}</div>}
          <input value={form.name} onChange={e => { setForm(f => ({ ...f, name: e.target.value })); setErr(""); }}
            placeholder="Tu nombre completo"
            style={{ width: "100%", padding: "11px 14px", borderRadius: 10, border: "1.5px solid #f48c06", fontSize: 14, outline: "none", boxSizing: "border-box", marginBottom: 10 }} />
          <input value={form.phone} onChange={e => { setForm(f => ({ ...f, phone: e.target.value })); setErr(""); }}
            placeholder="Tu número de teléfono"
            style={{ width: "100%", padding: "11px 14px", borderRadius: 10, border: "1.5px solid #f48c06", fontSize: 14, outline: "none", boxSizing: "border-box", marginBottom: 16 }} />
          <button onClick={submit} style={{
            width: "100%", padding: "13px 0", background: "linear-gradient(135deg,#e85d04,#f48c06)",
            color: "#fff", border: "none", borderRadius: 12, fontWeight: 800, fontSize: 16, cursor: "pointer", marginBottom: 16
          }}>Registrarme 🌮</button>
          <div style={{ fontSize: 12, color: "#aaa", lineHeight: 2 }}>
            <div><a href={TERMS_URL} target="_blank" rel="noopener noreferrer" style={{ color: "#e85d04", textDecoration: "underline" }}>Términos y condiciones</a></div>
            <div><a href={PRIVACY_URL} target="_blank" rel="noopener noreferrer" style={{ color: "#e85d04", textDecoration: "underline" }}>Aviso de privacidad</a></div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════
//  PIN LOGIN
// ══════════════════════════════════════════
function PinLogin({ onSuccess }) {
  const [pin, setPin] = useState("");
  const [err, setErr] = useState(false);
  const submit = () => {
    if (pin === ADMIN_PIN) {
      sessionStorage.setItem("fys_auth", "1");
      onSuccess();
    } else { setErr(true); setPin(""); setTimeout(() => setErr(false), 1500); }
  };
  return (
    <div style={{ minHeight: "100vh", background: "#fff8f0", fontFamily: "'Segoe UI',sans-serif" }}>
      <Header sub="Panel Admin" />
      <div style={{ padding: 30, maxWidth: 320, margin: "0 auto", textAlign: "center" }}>
        <div style={{ background: "#fff", borderRadius: 20, padding: 28, boxShadow: "0 4px 20px #e85d0420" }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>🔒</div>
          <div style={{ fontWeight: 800, fontSize: 18, color: "#333", marginBottom: 4 }}>Acceso Admin</div>
          <div style={{ color: "#aaa", fontSize: 13, marginBottom: 20 }}>Ingresa tu PIN para continuar</div>
          <input
            type="password" inputMode="numeric" maxLength={6}
            value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, ""))}
            onKeyDown={e => e.key === "Enter" && submit()}
            placeholder="••••••"
            style={{ width: "100%", padding: "14px", borderRadius: 12, border: `2px solid ${err ? "#e85d04" : "#f48c06"}`, fontSize: 22, textAlign: "center", outline: "none", letterSpacing: 8, boxSizing: "border-box", marginBottom: 8, background: err ? "#fff0f0" : "#fff" }}
          />
          {err && <div style={{ color: "#e85d04", fontSize: 13, marginBottom: 8 }}>PIN incorrecto</div>}
          <button onClick={submit} style={{ width: "100%", padding: "13px 0", background: "linear-gradient(135deg,#e85d04,#f48c06)", color: "#fff", border: "none", borderRadius: 12, fontWeight: 800, fontSize: 16, cursor: "pointer" }}>
            Entrar
          </button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════
//  PANEL ADMIN
// ══════════════════════════════════════════
function AdminPanel() {
  const [clients, setClients] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [auth, setAuth] = useState(() => sessionStorage.getItem("fys_auth") === "1");
  const [view, setView] = useState("home");
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState(null);
  const [filterReady, setFilterReady] = useState(false);
  const [qrClient, setQrClient] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [scanError, setScanError] = useState(null);
  const toastTimer = useRef(null);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "clients"), snap => {
      setClients(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoaded(true);
    });
    return () => unsub();
  }, []);

  const showToast = (msg, color = "#e85d04") => {
    clearTimeout(toastTimer.current);
    setToast({ msg, color });
    toastTimer.current = setTimeout(() => setToast(null), 2800);
  };

  const addVisit = async (id) => {
    const c = clients.find(x => x.id === id);
    if (!canRegisterToday(c.lastVisit)) return showToast("⛔ Ya se registró una visita en las últimas 24 hrs.", "#555");
    const nv = c.visits + 1;
    await updateDoc(doc(db, "clients", id), { visits: nv, lastVisit: new Date().toISOString() });
    if (nv === VISITS_GOAL) showToast(`🎉 ¡Completó ${VISITS_GOAL} visitas! Tiene un combo.`, "#2d6a4f");
    else showToast("✅ Visita registrada.");
  };

  const removeVisit = async (id) => {
    const c = clients.find(x => x.id === id);
    if (c.visits <= 0) return showToast("El cliente ya tiene 0 visitas.", "#555");
    if (!window.confirm("¿Quitar 1 visita a este cliente?")) return;
    await updateDoc(doc(db, "clients", id), { visits: c.visits - 1 });
    showToast("↩️ Visita eliminada.", "#555");
  };

  const redeemCombo = async (id) => {
    const c = clients.find(x => x.id === id);
    await updateDoc(doc(db, "clients", id), { visits: 0, canjes: c.canjes + 1 });
    showToast("🎁 ¡Combo canjeado! Contador reiniciado.", "#2d6a4f");
  };

  const deleteClient = async (id, name) => {
    if (!window.confirm(`¿Eliminar a ${name}?`)) return;
    await deleteDoc(doc(db, "clients", id));
    if (selected?.id === id) setView("home");
    showToast("🗑 Cliente eliminado.", "#555");
  };

  const handleScanResult = async (clientId) => {
    setScanning(false);
    const c = clients.find(x => x.id === clientId);
    if (!c) { setScanResult({ type: "notfound" }); return; }
    if (!canRegisterToday(c.lastVisit)) { setScanResult({ type: "denied", client: c }); return; }
    const nv = c.visits + 1;
    await updateDoc(doc(db, "clients", clientId), { visits: nv, lastVisit: new Date().toISOString() });
    setScanResult({
      type: nv >= VISITS_GOAL ? "combo" : "success",
      client: { ...c, visits: nv },
      visits: nv
    });
  };

  const handleScanError = (msg) => {
    setScanning(false);
    setScanError(msg);
  };

  const filtered = clients.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search)
  );
  const displayed = filterReady ? filtered.filter(c => c.visits >= VISITS_GOAL) : filtered;
  const cur = selected ? clients.find(c => c.id === selected.id) : null;

  if (!auth) return <PinLogin onSuccess={() => setAuth(true)} />;

  // ── Pantalla de resultado ──
  if (scanResult) {
    const r = scanResult;
    const bgColor = r.type === "denied" ? "#fff3cd" : r.type === "notfound" ? "#f8d7da" : "#d8f3dc";
    const accentColor = r.type === "denied" ? "#856404" : r.type === "notfound" ? "#721c24" : "#2d6a4f";
    const icon = r.type === "denied" ? "⏱" : r.type === "notfound" ? "❌" : r.type === "combo" ? "🎁" : "✅";
    const title = r.type === "denied" ? "Visita ya registrada hoy"
      : r.type === "notfound" ? "Cliente no encontrado"
        : r.type === "combo" ? `¡Completó ${VISITS_GOAL} visitas!`
          : "Visita registrada";
    return (
      <div style={{ minHeight: "100vh", background: "#fff8f0", fontFamily: "'Segoe UI',sans-serif" }}>
        <Header sub="Panel Admin · Programa de Lealtad" />
        <div style={{ padding: 20, maxWidth: 420, margin: "0 auto" }}>
          <div style={{ background: bgColor, borderRadius: 20, padding: 30, textAlign: "center", boxShadow: "0 4px 20px #0002", border: `3px solid ${accentColor}` }}>
            <div style={{ fontSize: 72, marginBottom: 10 }}>{icon}</div>
            <div style={{ fontWeight: 800, fontSize: 22, color: accentColor, marginBottom: 8 }}>{title}</div>
            {r.client && <>
              <div style={{ fontWeight: 700, fontSize: 18, color: "#333", marginTop: 12 }}>{r.client.name}</div>
              <div style={{ color: "#666", fontSize: 13 }}>📱 {r.client.phone}</div>
            </>}
            {r.type === "success" && (
              <div style={{ background: "#fff", borderRadius: 14, padding: 16, marginTop: 16 }}>
                <div style={{ fontSize: 32, fontWeight: 800, color: "#e85d04" }}>{r.visits} / {VISITS_GOAL}</div>
                <div style={{ color: "#666", fontSize: 13, marginTop: 4 }}>visitas acumuladas</div>
                <div style={{ color: "#aaa", fontSize: 12, marginTop: 6 }}>{VISITS_GOAL - r.visits} para el próximo combo 🌮</div>
              </div>
            )}
            {r.type === "combo" && (
              <div style={{ background: "#fff", borderRadius: 14, padding: 16, marginTop: 16 }}>
                <div style={{ color: "#2d6a4f", fontWeight: 700, fontSize: 16 }}>🎁 Combo de regalo disponible</div>
                <div style={{ color: "#888", fontSize: 12, marginTop: 6 }}>Puedes canjearlo desde su tarjeta</div>
              </div>
            )}
            {r.type === "denied" && (
              <div style={{ background: "#fff", borderRadius: 14, padding: 16, marginTop: 16 }}>
                <div style={{ color: "#856404", fontWeight: 600, fontSize: 14 }}>Solo se permite 1 visita cada 24 horas</div>
                {r.client?.lastVisit && <div style={{ color: "#888", fontSize: 12, marginTop: 6 }}>Última visita: {new Date(r.client.lastVisit).toLocaleDateString("es-MX", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</div>}
                <div style={{ color: "#666", fontSize: 13, marginTop: 8 }}>Lleva {r.client?.visits} / {VISITS_GOAL} visitas</div>
              </div>
            )}
            <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
              <button onClick={() => setScanResult(null)} style={{ flex: 1, padding: "13px 0", background: "linear-gradient(135deg,#e85d04,#f48c06)", color: "#fff", border: "none", borderRadius: 12, fontWeight: 800, fontSize: 15, cursor: "pointer" }}>← Regresar</button>
              {r.client && <button onClick={() => { setSelected(r.client); setView("client"); setScanResult(null); }} style={{ flex: 1, padding: "13px 0", background: "#fff", color: "#e85d04", border: "2px solid #e85d04", borderRadius: 12, fontWeight: 800, fontSize: 15, cursor: "pointer" }}>Ver tarjeta</button>}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Error de escaneo ──
  if (scanError) return (
    <div style={{ minHeight: "100vh", background: "#fff8f0", fontFamily: "'Segoe UI',sans-serif" }}>
      <Header sub="Panel Admin · Programa de Lealtad" />
      <div style={{ padding: 20, maxWidth: 420, margin: "0 auto" }}>
        <div style={{ background: "#f8d7da", borderRadius: 20, padding: 30, textAlign: "center", border: "3px solid #721c24" }}>
          <div style={{ fontSize: 60, marginBottom: 10 }}>⚠️</div>
          <div style={{ fontWeight: 800, fontSize: 20, color: "#721c24", marginBottom: 12 }}>No se pudo leer el QR</div>
          <div style={{ color: "#555", fontSize: 14, marginBottom: 20 }}>{scanError}</div>
          <button onClick={() => { setScanError(null); setScanning(true); }} style={{ width: "100%", padding: "13px 0", background: "linear-gradient(135deg,#e85d04,#f48c06)", color: "#fff", border: "none", borderRadius: 12, fontWeight: 800, fontSize: 15, cursor: "pointer", marginBottom: 10 }}>Intentar de nuevo</button>
          <button onClick={() => setScanError(null)} style={{ width: "100%", padding: "11px 0", background: "none", border: "2px solid #e85d04", color: "#e85d04", borderRadius: 12, fontWeight: 700, fontSize: 14, cursor: "pointer" }}>← Regresar al panel</button>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#fff8f0", fontFamily: "'Segoe UI',sans-serif", position: "relative" }}>
      <Toast toast={toast} />
      {scanning && <QRScanner onResult={handleScanResult} onClose={() => setScanning(false)} onError={handleScanError} />}
      <Header sub="Panel Admin · Programa de Lealtad" />

      {!loaded ? (
        <div style={{ textAlign: "center", padding: 40, color: "#e85d04", fontWeight: 600 }}>Cargando clientes…</div>
      ) : view === "home" ? (
        <div style={{ padding: 16 }}>
          <button onClick={() => setScanning(true)} style={{
            width: "100%", padding: "13px 0", marginBottom: 14,
            background: "linear-gradient(135deg,#333,#555)",
            color: "#fff", border: "none", borderRadius: 12, fontWeight: 800, fontSize: 15, cursor: "pointer"
          }}>📷 Escanear QR de cliente</button>

          <div style={{ background: "#fff", borderRadius: 16, padding: 16, marginBottom: 14, boxShadow: "0 2px 10px #e85d0415", textAlign: "center" }}>
            <div style={{ fontWeight: 700, color: "#e85d04", fontSize: 14, marginBottom: 8 }}>📲 QR de Registro para Clientes</div>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>
              <QRCode value={`${BASE_URL}/registro`} size={110} />
            </div>
            <div style={{ color: "#aaa", fontSize: 11 }}>Imprime este QR en tu mostrador o mesa</div>
          </div>

          <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
            <input placeholder="🔍 Buscar por nombre o teléfono..." value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ flex: 1, padding: "10px 14px", borderRadius: 10, border: "1.5px solid #f48c06", fontSize: 14, outline: "none" }} />
          </div>

          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            <button onClick={() => setFilterReady(false)} style={{ flex: 1, padding: "7px 0", borderRadius: 8, border: "none", background: !filterReady ? "#e85d04" : "#f3e9dc", color: !filterReady ? "#fff" : "#888", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>
              Todos ({clients.length})
            </button>
            <button onClick={() => setFilterReady(true)} style={{ flex: 1, padding: "7px 0", borderRadius: 8, border: "none", background: filterReady ? "#2d6a4f" : "#f3e9dc", color: filterReady ? "#fff" : "#888", fontWeight: 600, cursor: "pointer", fontSize: 13 }}>
              🎁 Con combo ({clients.filter(c => c.visits >= VISITS_GOAL).length})
            </button>
          </div>

          {displayed.length === 0 && <div style={{ textAlign: "center", color: "#aaa", marginTop: 40 }}>No se encontraron clientes.</div>}

          {displayed.map(c => (
            <div key={c.id} style={{ background: "#fff", borderRadius: 14, padding: "12px 16px", marginBottom: 10, boxShadow: "0 2px 8px #e85d0415", border: c.visits >= VISITS_GOAL ? "2px solid #2d6a4f" : "1.5px solid #f3e9dc" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div onClick={() => { setSelected(c); setView("client"); }} style={{ cursor: "pointer", flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: "#333" }}>{c.name}</div>
                  <div style={{ fontSize: 12, color: "#999" }}>📱 {c.phone}</div>
                  <div style={{ fontSize: 12, color: "#bbb" }}>Canjes: {c.canjes}</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
                  {c.visits >= VISITS_GOAL
                    ? <div style={{ background: "#2d6a4f", color: "#fff", borderRadius: 20, padding: "4px 12px", fontSize: 12, fontWeight: 700 }}>🎁 ¡Combo!</div>
                    : <div style={{ textAlign: "center" }}><div style={{ fontSize: 20, fontWeight: 800, color: "#e85d04" }}>{c.visits}/{VISITS_GOAL}</div><div style={{ fontSize: 10, color: "#aaa" }}>🌮</div></div>
                  }
                  <button onClick={() => { setQrClient(c); setView("qr"); }} style={{ background: "none", border: "1px solid #f48c06", color: "#e85d04", borderRadius: 8, padding: "4px 10px", fontSize: 11, cursor: "pointer", fontWeight: 600 }}>Ver QR</button>
                  <button onClick={() => deleteClient(c.id, c.name)} style={{ background: "none", border: "1px solid #ffb3b3", color: "#cc0000", borderRadius: 8, padding: "4px 10px", fontSize: 11, cursor: "pointer", fontWeight: 600 }}>Eliminar</button>
                </div>
              </div>
            </div>
          ))}
        </div>

      ) : view === "client" && cur ? (
        <div style={{ padding: 16 }}>
          <button onClick={() => setView("home")} style={{ background: "none", border: "none", color: "#e85d04", fontWeight: 700, fontSize: 15, cursor: "pointer", marginBottom: 10 }}>← Regresar</button>
          <div style={{ background: "#fff", borderRadius: 16, padding: 20, boxShadow: "0 2px 12px #e85d0420", textAlign: "center" }}>
            <div style={{ fontSize: 42 }}>👤</div>
            <div style={{ fontWeight: 800, fontSize: 20, color: "#333" }}>{cur.name}</div>
            <div style={{ color: "#aaa", fontSize: 13 }}>📱 {cur.phone}</div>
            <div style={{ color: "#bbb", fontSize: 12, marginTop: 2 }}>Canjes totales: {cur.canjes}</div>
            {cur.lastVisit && (
              <div style={{ color: "#bbb", fontSize: 11, marginTop: 2 }}>
                Última visita: {new Date(cur.lastVisit).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
              </div>
            )}
            <div style={{ margin: "14px 0 4px", fontWeight: 700, color: cur.visits >= VISITS_GOAL ? "#2d6a4f" : "#e85d04" }}>
              {cur.visits >= VISITS_GOAL ? `🎉 ¡Completó ${VISITS_GOAL} visitas!` : `${cur.visits} de ${VISITS_GOAL} visitas`}
            </div>
            <TacoStamps visits={Math.min(cur.visits, VISITS_GOAL)} />
            {!canRegisterToday(cur.lastVisit) && (
              <div style={{ background: "#fff3cd", borderRadius: 10, padding: "10px 14px", marginBottom: 10, color: "#856404", fontSize: 13, fontWeight: 600 }}>
                ⏱ Ya se registró una visita hoy. Disponible en 24 hrs.
              </div>
            )}
            {cur.visits >= VISITS_GOAL ? (
              <>
                <div style={{ background: "#d8f3dc", borderRadius: 12, padding: 12, marginBottom: 12, color: "#2d6a4f", fontWeight: 600 }}>🎁 Tiene un combo de regalo disponible</div>
                <button onClick={() => redeemCombo(cur.id)} style={{ width: "100%", padding: "13px 0", background: "linear-gradient(135deg,#2d6a4f,#40916c)", color: "#fff", border: "none", borderRadius: 12, fontWeight: 800, fontSize: 16, cursor: "pointer", marginBottom: 10 }}>🎁 Canjear Combo</button>
              </>
            ) : (
              <button onClick={() => addVisit(cur.id)} disabled={!canRegisterToday(cur.lastVisit)} style={{
                width: "100%", padding: "13px 0",
                background: canRegisterToday(cur.lastVisit) ? "linear-gradient(135deg,#e85d04,#f48c06)" : "#ddd",
                color: "#fff", border: "none", borderRadius: 12, fontWeight: 800, fontSize: 16,
                cursor: canRegisterToday(cur.lastVisit) ? "pointer" : "not-allowed", marginBottom: 10
              }}>✅ Registrar Visita de Hoy</button>
            )}
            <button onClick={() => removeVisit(cur.id)} style={{ width: "100%", padding: "10px 0", background: "none", border: "2px solid #ffb3b3", color: "#cc0000", borderRadius: 12, fontWeight: 700, fontSize: 14, cursor: "pointer", marginBottom: 10 }}>↩️ Quitar última visita</button>
            <div style={{ color: "#ccc", fontSize: 12, marginBottom: 16 }}>{VISITS_GOAL - Math.min(cur.visits, VISITS_GOAL)} visita(s) para el próximo combo</div>
            <div style={{ background: "#f9f9f9", borderRadius: 12, padding: 14 }}>
              <div style={{ fontSize: 12, color: "#aaa", marginBottom: 8 }}>QR personal del cliente</div>
              <div style={{ display: "flex", justifyContent: "center" }}>
                <QRCode value={`${BASE_URL}/${cur.id}`} size={120} />
              </div>
            </div>
          </div>
        </div>

      ) : view === "qr" && qrClient ? (
        <div style={{ padding: 16 }}>
          <button onClick={() => setView("home")} style={{ background: "none", border: "none", color: "#e85d04", fontWeight: 700, fontSize: 15, cursor: "pointer", marginBottom: 10 }}>← Regresar</button>
          <div style={{ background: "#fff", borderRadius: 16, padding: 24, boxShadow: "0 2px 12px #e85d0420", textAlign: "center" }}>
            <div style={{ fontWeight: 800, fontSize: 18, color: "#333", marginBottom: 4 }}>{qrClient.name}</div>
            <div style={{ color: "#aaa", fontSize: 13, marginBottom: 16 }}>QR personal de lealtad</div>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
              <QRCode value={`${BASE_URL}/${qrClient.id}`} size={180} />
            </div>
            <div style={{ color: "#bbb", fontSize: 12 }}>El cliente escanea este QR para ver su tarjeta actualizada en tiempo real</div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ══════════════════════════════════════════
//  ROUTER PRINCIPAL
// ══════════════════════════════════════════
export default function App() {
  const route = getRoute();
  if (route.type === "clientView") return <ClientView clientId={route.id} />;
  if (route.type === "register") return <RegisterView />;
  return <AdminPanel />;
}