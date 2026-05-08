import { useState, useEffect, useRef } from "react";
import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue, set, push, update, remove } from "firebase/database";

// ══════════════════════════════════════════
//  FIREBASE CONFIG
// ══════════════════════════════════════════
const firebaseConfig = {
  apiKey: "AIzaSyD9an6xA-GwUMdGOwQ0elUCN1q-6-QKSFs",
  authDomain: "my-order-184e4.firebaseapp.com",
  databaseURL: "https://my-order-184e4-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "my-order-184e4",
  storageBucket: "my-order-184e4.firebasestorage.app",
  messagingSenderId: "759982751295",
  appId: "1:759982751295:web:cb806baf4bd59c03afc28a",
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getDatabase(firebaseApp);

// ══════════════════════════════════════════
//  CONFIG
// ══════════════════════════════════════════
const ADMIN_PIN = "1234";
const RIDER_PIN = "5678";

const DEFAULT_PRODUCTS = [
  { id: "p1", name: "เสื้อยืด",  price: 250, visible: true },
  { id: "p2", name: "กางเกง",    price: 350, visible: true },
  { id: "p3", name: "หมวก",      price: 180, visible: true },
  { id: "p4", name: "กระเป๋า",  price: 490, visible: true },
  { id: "p5", name: "รองเท้า",  price: 650, visible: true },
];

const STATUS = {
  waiting:  { label: "รอดำเนินการ", color: "#F59E0B", bg: "#FEF3C7", icon: "⏳" },
  shipping: { label: "กำลังจัดส่ง", color: "#3B82F6", bg: "#DBEAFE", icon: "🚚" },
  done:     { label: "ส่งสำเร็จ",   color: "#10B981", bg: "#D1FAE5", icon: "✅" },
  cancelled:{ label: "ยกเลิก",      color: "#EF4444", bg: "#FEE2E2", icon: "❌" },
};
const SOURCE = {
  comment:  { label: "Comment",   icon: "💬", color: "#1877F2" },
  messenger:{ label: "Messenger", icon: "✉️", color: "#A855F7" },
};

const NOTE_PRESETS = [
  "โอนเงินแล้ว","ชำระปลายทาง","ที่อยู่พิเศษ","แพ็คของขวัญ","แนบสลิป","รอยืนยัน",
];
const REASON_PRESETS = {
  waiting:  ["รอลูกค้ายืนยัน","รอชำระเงิน","รอสต็อกสินค้า"],
  shipping: ["ส่ง EMS","ส่ง Kerry","ส่ง Flash","ส่งไปรษณีย์ลงทะเบียน","ไรเดอร์รับแล้ว"],
  done:     ["ลูกค้ารับของแล้ว","ยืนยันการรับสินค้า","รีวิวแล้ว"],
  cancelled:["ลูกค้ายกเลิก","ของหมด","ที่อยู่ไม่ถูกต้อง","ชำระไม่ผ่าน","ลูกค้าไม่รับสาย"],
};

const genId = () => "#" + String(Math.floor(Math.random() * 90000) + 10000);
const fmt = iso => {
  const d = new Date(iso);
  return d.toLocaleDateString("th-TH",{day:"numeric",month:"short"}) + " " +
         d.toLocaleTimeString("th-TH",{hour:"2-digit",minute:"2-digit"});
};
const baht = n => "฿" + Number(n).toLocaleString("th-TH");

// ══════════════════════════════════════════
//  ROOT APP
// ══════════════════════════════════════════
export default function App() {
  const [role,     setRole]     = useState(null);
  const [orders,   setOrders]   = useState([]);
  const [products, setProducts] = useState(DEFAULT_PRODUCTS);
  const [loading,  setLoading]  = useState(true);
  const [view,     setView]     = useState("list");
  const [selected, setSelected] = useState(null);
  const [filter,   setFilter]   = useState("all");
  const [notify,   setNotify]   = useState(null);
  const [syncDot,  setSyncDot]  = useState(false);

  // ── Firebase realtime listeners ──
  useEffect(() => {
    const ordersRef    = ref(db, "orders");
    const productsRef  = ref(db, "products");

    const unsubOrders = onValue(ordersRef, snap => {
      const val = snap.val();
      const list = val ? Object.entries(val).map(([k,v])=>({...v, _key:k})) : [];
      list.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
      setOrders(list);
      // keep selected in sync
      setSelected(s => s ? (list.find(o=>o.id===s.id) || s) : null);
      setLoading(false);
      setSyncDot(true); setTimeout(()=>setSyncDot(false), 800);
    });

    const unsubProducts = onValue(productsRef, snap => {
      const val = snap.val();
      if (val) {
        const list = Object.entries(val).map(([k,v])=>({...v, _key:k}));
        setProducts(list);
      } else {
        // first time: seed default products
        DEFAULT_PRODUCTS.forEach(p => set(ref(db, `products/${p.id}`), p));
      }
    });

    return () => { unsubOrders(); unsubProducts(); };
  }, []);

  const toast = msg => { setNotify(msg); setTimeout(()=>setNotify(null), 2500); };

  // ── order actions (write to Firebase) ──
  async function addOrder(order) {
    await set(ref(db, `orders/${order.id}`), order);
    setView("list");
    toast("✅ เพิ่มออร์เดอร์แล้ว!");
  }

  async function updateStatus(id, status, reason="") {
    const now = new Date().toISOString();
    const order = orders.find(o=>o.id===id);
    if (!order) return;
    const log = [...(order.statusLog||[]), { status, reason, at: now }];
    await update(ref(db, `orders/${id}`), { status, reason, updatedAt: now, statusLog: log });
    toast("✅ อัปเดตสถานะแล้ว");
  }

  async function updateRiderNote(id, riderNote) {
    await update(ref(db, `orders/${id}`), { riderNote });
  }

  async function deleteOrder(id) {
    await remove(ref(db, `orders/${id}`));
    setView("list"); toast("🗑️ ลบออร์เดอร์แล้ว");
  }

  // ── product actions ──
  async function saveProducts(newProducts) {
    // write each product keyed by id
    const updates = {};
    newProducts.forEach(p => { updates[`products/${p.id}`] = p; });
    // remove deleted ones
    products.forEach(p => { if (!newProducts.find(x=>x.id===p.id)) updates[`products/${p.id}`] = null; });
    await update(ref(db), updates);
    toast("💾 บันทึกสินค้าแล้ว");
  }

  const filtered = filter==="all" ? orders : orders.filter(o=>o.status===filter);
  const counts = {waiting:0,shipping:0,done:0,cancelled:0};
  orders.forEach(o => { if(counts[o.status]!==undefined) counts[o.status]++; });

  if (loading) return <LoadingScreen/>;
  if (!role)   return <LoginScreen onLogin={setRole}/>;

  const viewTitle = {
    add:"➕ เพิ่มออร์เดอร์", detail:`ออร์เดอร์ ${selected?.id}`,
    finance:"💰 การเงิน", products:"🗂️ จัดการสินค้า",
  }[view] || (role==="rider" ? "🛵 หน้าไรเดอร์" : "📦 ออร์เดอร์");

  return (
    <div style={S.root}>
      <Glow/>
      <style>{CSS}</style>
      {notify && <Toast msg={notify}/>}

      {/* HEADER */}
      <header style={S.header}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          {view!=="list" && <button onClick={()=>setView("list")} style={S.backBtn}>←</button>}
          <div>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <span style={{fontSize:17,fontWeight:700}}>{viewTitle}</span>
              {syncDot && <span style={{width:6,height:6,borderRadius:"50%",background:"#10B981",display:"inline-block"}}/>}
            </div>
            {view==="list" && (
              <div style={{fontSize:11,color:"#6060A0",marginTop:1}}>
                <span style={{color:role==="admin"?"#1877F2":"#F59E0B",fontWeight:600}}>
                  {role==="admin"?"👑 Admin":"🛵 Rider"}
                </span>{" · "}{orders.length} รายการ{" · "}
                <span style={{color:"#10B981"}}>🔴 Live</span>
              </div>
            )}
          </div>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          {view==="list" && role==="admin" && <>
            <button onClick={()=>setView("finance")}  style={S.iconBtn}>💰</button>
            <button onClick={()=>setView("products")} style={S.iconBtn}>🗂️</button>
            <button onClick={()=>setView("add")}      style={S.addBtn}>+ เพิ่ม</button>
          </>}
          <button onClick={()=>{setRole(null);setView("list");}} style={S.iconBtn}>🚪</button>
        </div>
      </header>

      <div style={S.body}>
        {view==="list" && <>
          <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:10,marginBottom:16}}>
            {Object.entries(counts).map(([k,v])=>(
              <div key={k} onClick={()=>setFilter(filter===k?"all":k)} style={{
                background:filter===k?STATUS[k].bg+"22":"#1A1A2E",
                border:`1.5px solid ${filter===k?STATUS[k].color+"66":"#2E2E50"}`,
                borderRadius:12,padding:"12px 8px",textAlign:"center",cursor:"pointer",
              }}>
                <div style={{fontSize:22,fontWeight:700,color:STATUS[k].color}}>{v}</div>
                <div style={{fontSize:11,color:"#8080A0",marginTop:2}}>{STATUS[k].label}</div>
              </div>
            ))}
          </div>
          {filter!=="all" && (
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
              <span style={{fontSize:13,color:STATUS[filter].color}}>{STATUS[filter].icon} {STATUS[filter].label}</span>
              <button onClick={()=>setFilter("all")} style={S.clearBtn}>ล้าง ✕</button>
            </div>
          )}
          {filtered.length===0 ? <Empty/> : filtered.map((o,i)=>(
            <OrderCard key={o.id} order={o} index={i}
              onClick={()=>{setSelected(o);setView("detail");}}/>
          ))}
        </>}

        {view==="add" && role==="admin" &&
          <AddView products={products} onAdd={addOrder}/>}

        {view==="detail" && selected &&
          <DetailView order={selected} role={role}
            onStatusChange={updateStatus} onRiderNote={updateRiderNote}
            onDelete={deleteOrder} toast={toast}/>}

        {view==="finance" && role==="admin" &&
          <FinanceView orders={orders}/>}

        {view==="products" && role==="admin" &&
          <ProductsView products={products} saveProducts={saveProducts} toast={toast}/>}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════
//  LOADING SCREEN
// ══════════════════════════════════════════
function LoadingScreen() {
  return (
    <div style={{...S.root,display:"flex",flexDirection:"column",
      alignItems:"center",justifyContent:"center",minHeight:"100vh"}}>
      <style>{CSS}</style>
      <Glow/>
      <div style={{fontSize:52,marginBottom:16,animation:"pulse 1.2s ease infinite"}}>📦</div>
      <div style={{fontSize:16,fontWeight:600,color:"#F0F0FF",marginBottom:8}}>กำลังเชื่อมต่อ...</div>
      <div style={{fontSize:13,color:"#6060A0"}}>Firebase Realtime Database</div>
      <div style={{display:"flex",gap:6,marginTop:20}}>
        {[0,1,2].map(i=>(
          <div key={i} style={{
            width:8,height:8,borderRadius:"50%",background:"#1877F2",
            animation:`bounce 0.8s ease ${i*0.15}s infinite`,
          }}/>
        ))}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════
//  ADD ORDER VIEW
// ══════════════════════════════════════════
function AddView({ products, onAdd }) {
  const [name,        setName]        = useState("");
  const [source,      setSource]      = useState("comment");
  const [note,        setNote]        = useState("");
  const [cart,        setCart]        = useState({});
  const [shippingFee, setShippingFee] = useState(0);

  function setQty(pid, qty) {
    setCart(c => { const n={...c}; if(qty<=0) delete n[pid]; else n[pid]=qty; return n; });
  }

  const visibleProducts = products.filter(p=>p.visible!==false);
  const cartItems = visibleProducts
    .filter(p=>cart[p.id])
    .map(p=>({...p,qty:cart[p.id],subtotal:p.price*cart[p.id]}));
  const totalPrice = cartItems.reduce((s,i)=>s+i.subtotal,0) + Number(shippingFee||0);
  const canSave = name.trim() && cartItems.length>0;

  function handleAdd() {
    if (!canSave) return;
    onAdd({
      id:genId(), name:name.trim(), source, note:note.trim(),
      status:"waiting", createdAt:new Date().toISOString(),
      riderNote:"", updatedAt:null, statusLog:[],
      cartItems, shippingFee:Number(shippingFee||0), totalPrice, paid:false,
    });
  }

  return (
    <div style={{animation:"slideUp 0.25s ease"}}>
      <Field label="ชื่อลูกค้า *">
        <input placeholder="เช่น คุณสมชาย" value={name} onChange={e=>setName(e.target.value)}/>
      </Field>
      <Field label="ช่องทาง">
        <select value={source} onChange={e=>setSource(e.target.value)}>
          <option value="comment">💬 Comment ใต้โพสต์</option>
          <option value="messenger">✉️ Messenger</option>
        </select>
      </Field>

      <div style={{marginBottom:16}}>
        <div style={S.fieldLabel}>🛍️ เลือกสินค้า *</div>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {visibleProducts.map(p=>(
            <div key={p.id} style={{
              background:"#1A1A2E",border:"1.5px solid #2E2E50",
              borderRadius:12,padding:"12px 14px",
              display:"flex",alignItems:"center",justifyContent:"space-between",
            }}>
              <div>
                <div style={{fontSize:14,fontWeight:600}}>{p.name}</div>
                <div style={{fontSize:12,color:"#F59E0B"}}>{baht(p.price)}</div>
              </div>
              <QtyControl qty={cart[p.id]||0} onChange={q=>setQty(p.id,q)}/>
            </div>
          ))}
        </div>
      </div>

      {cartItems.length>0 && (
        <div style={{background:"#12122080",border:"1.5px solid #2E2E50",borderRadius:12,padding:"14px",marginBottom:16}}>
          <div style={{fontSize:13,color:"#8080A0",marginBottom:10,fontWeight:600}}>📋 รายการที่เลือก</div>
          {cartItems.map(i=>(
            <div key={i.id} style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:6}}>
              <span style={{color:"#C0C0E0"}}>{i.name} × {i.qty}</span>
              <span style={{color:"#F0F0FF",fontWeight:600}}>{baht(i.subtotal)}</span>
            </div>
          ))}
          <div style={{borderTop:"1px solid #2E2E50",marginTop:10,paddingTop:10}}>
            <Field label="ค่าจัดส่ง (฿)">
              <input type="number" inputMode="numeric" placeholder="0"
                value={shippingFee} onChange={e=>setShippingFee(e.target.value)}/>
            </Field>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:15,fontWeight:700,marginTop:8}}>
              <span style={{color:"#8080A0"}}>รวมทั้งหมด</span>
              <span style={{color:"#10B981"}}>{baht(totalPrice)}</span>
            </div>
          </div>
        </div>
      )}

      <SmartNote label="หมายเหตุ (ไม่บังคับ)" value={note} onChange={setNote}
        presets={NOTE_PRESETS} placeholder="เช่น โอนแล้ว, ที่อยู่พิเศษ..."/>

      <button onClick={handleAdd} disabled={!canSave} style={{
        ...S.primaryBtn,
        background:canSave?"linear-gradient(135deg,#1877F2,#A855F7)":"#2E2E50",
        color:canSave?"#fff":"#404060", marginTop:8,
      }}>บันทึกออร์เดอร์</button>
    </div>
  );
}

// ══════════════════════════════════════════
//  DETAIL VIEW
// ══════════════════════════════════════════
function DetailView({ order, role, onStatusChange, onRiderNote, onDelete, toast }) {
  const [riderNote,     setRiderNote]     = useState(order.riderNote||"");
  const [saved,         setSaved]         = useState(false);
  const [showItems,     setShowItems]     = useState(true);
  const [showLog,       setShowLog]       = useState(false);
  const [dropOpen,      setDropOpen]      = useState(false);
  const [pendingStatus, setPendingStatus] = useState("");
  const [reason,        setReason]        = useState("");

  // sync riderNote if order updates from firebase
  useEffect(()=>{ setRiderNote(order.riderNote||""); },[order.riderNote]);

  const riderAllowed = {shipping:true,done:true,cancelled:true};

  function confirmStatus() {
    if (!pendingStatus) return;
    onStatusChange(order.id, pendingStatus, reason.trim());
    setDropOpen(false); setPendingStatus(""); setReason("");
  }

  async function saveNote() {
    await onRiderNote(order.id, riderNote);
    setSaved(true); toast("💾 บันทึกหมายเหตุแล้ว");
    setTimeout(()=>setSaved(false),2000);
  }

  const statusLog = order.statusLog||[];

  return (
    <div style={{animation:"slideUp 0.25s ease"}}>
      <div style={S.card}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
          <span style={{fontSize:12,color:"#6060A0"}}>{fmt(order.createdAt)}</span>
          <span style={{fontSize:12,fontWeight:600,
            color:SOURCE[order.source].color,
            background:SOURCE[order.source].color+"22",borderRadius:6,padding:"3px 9px"}}>
            {SOURCE[order.source].icon} {SOURCE[order.source].label}
          </span>
        </div>
        <div style={{fontSize:20,fontWeight:700,marginBottom:14}}>{order.name}</div>

        <button onClick={()=>setShowItems(v=>!v)} style={{
          width:"100%",background:"none",border:"none",padding:0,
          display:"flex",justifyContent:"space-between",alignItems:"center",
          cursor:"pointer",marginBottom:showItems?10:4,
        }}>
          <span style={{fontSize:12,color:"#8080A0",fontWeight:600}}>
            🛍️ รายการสินค้า ({(order.cartItems||[]).length} รายการ)
          </span>
          <span style={{fontSize:14,color:"#6060A0",display:"inline-block",
            transform:showItems?"rotate(180deg)":"rotate(0deg)",transition:"transform 0.2s"}}>▾</span>
        </button>

        {showItems && (
          <div style={{background:"#12122060",borderRadius:10,padding:"12px",marginBottom:12}}>
            {(order.cartItems||[]).map((it,i)=>(
              <div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:14,lineHeight:2,color:"#C0C0E0"}}>
                <span>· {it.name} × {it.qty}</span>
                <span style={{color:"#F0F0FF",fontWeight:600}}>{baht(it.subtotal)}</span>
              </div>
            ))}
          </div>
        )}

        <div style={{borderTop:"1px solid #2E2E50",paddingTop:12}}>
          {order.shippingFee>0 && (
            <div style={{display:"flex",justifyContent:"space-between",fontSize:13,color:"#8080A0",marginBottom:4}}>
              <span>ค่าจัดส่ง</span><span>{baht(order.shippingFee)}</span>
            </div>
          )}
          <div style={{display:"flex",justifyContent:"space-between",fontSize:16,fontWeight:700}}>
            <span style={{color:"#8080A0"}}>รวม</span>
            <span style={{color:"#10B981"}}>{baht(order.totalPrice||0)}</span>
          </div>
        </div>

        {order.note && <div style={{fontSize:13,color:"#F59E0B",marginTop:10}}>📝 {order.note}</div>}
        {order.updatedAt && <div style={{fontSize:11,color:"#404060",marginTop:6}}>อัปเดต: {fmt(order.updatedAt)}</div>}
      </div>

      {/* STATUS */}
      <div style={S.card}>
        <div style={{fontSize:13,color:"#8080A0",marginBottom:10,fontWeight:600}}>
          {role==="rider"?"🛵 อัปเดตสถานะ":"🔄 เปลี่ยนสถานะ"}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12,flexWrap:"wrap"}}>
          <span style={{fontSize:12,color:"#6060A0"}}>ปัจจุบัน:</span>
          <span style={{fontSize:13,fontWeight:700,
            color:STATUS[order.status].color,
            background:STATUS[order.status].bg+"33",
            border:`1.5px solid ${STATUS[order.status].color}55`,
            borderRadius:8,padding:"4px 12px"}}>
            {STATUS[order.status].icon} {STATUS[order.status].label}
          </span>
          {order.reason && <span style={{fontSize:12,color:"#8080A0",fontStyle:"italic"}}>— {order.reason}</span>}
        </div>

        <div style={{position:"relative",zIndex:20}}>
          <button onClick={()=>setDropOpen(v=>!v)} style={{
            width:"100%",background:"#12122080",
            border:`1.5px solid ${dropOpen?"#1877F2":"#2E2E50"}`,
            borderRadius:10,padding:"12px 14px",
            color:"#C0C0E0",fontSize:14,fontFamily:"inherit",
            display:"flex",justifyContent:"space-between",alignItems:"center",
            cursor:"pointer",transition:"border-color 0.2s",
          }}>
            <span>{pendingStatus?STATUS[pendingStatus].icon+" "+STATUS[pendingStatus].label:"เลือกสถานะใหม่..."}</span>
            <span style={{fontSize:13,color:"#6060A0",display:"inline-block",
              transform:dropOpen?"rotate(180deg)":"rotate(0deg)",transition:"transform 0.2s"}}>▾</span>
          </button>

          {dropOpen && (
            <div style={{
              position:"absolute",top:"calc(100% + 6px)",left:0,right:0,
              background:"#1A1A2E",border:"1.5px solid #2E2E50",
              borderRadius:12,overflow:"hidden",zIndex:50,
              boxShadow:"0 8px 32px #000A",animation:"slideUp 0.15s ease",
            }}>
              {Object.entries(STATUS).map(([k,v])=>{
                const allowed=role==="admin"||riderAllowed[k];
                const isCurrent=order.status===k;
                return (
                  <button key={k} onClick={()=>{
                    if(!allowed||isCurrent)return;
                    setPendingStatus(k);setDropOpen(false);
                  }} style={{
                    width:"100%",
                    background:pendingStatus===k?v.bg+"33":"transparent",
                    border:"none",borderBottom:"1px solid #2E2E3888",
                    padding:"13px 16px",
                    display:"flex",alignItems:"center",justifyContent:"space-between",
                    cursor:allowed&&!isCurrent?"pointer":"not-allowed",
                    fontFamily:"inherit",transition:"background 0.15s",
                  }}>
                    <span style={{fontSize:14,fontWeight:600,color:isCurrent?v.color:allowed?"#C0C0E0":"#2E2E50"}}>
                      {v.icon} {v.label}
                      {isCurrent&&<span style={{fontSize:11,color:"#6060A0",marginLeft:8}}>(ปัจจุบัน)</span>}
                    </span>
                    {!allowed&&<span style={{fontSize:12,color:"#2E2E50"}}>🔒</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {pendingStatus && (
          <div style={{marginTop:12,animation:"slideUp 0.15s ease"}}>
            <SmartNote label="เหตุผล / หมายเหตุ (ไม่บังคับ)" value={reason} onChange={setReason}
              presets={REASON_PRESETS[pendingStatus]||[]} placeholder="ระบุเหตุผลเพิ่มเติม..." compact/>
            <div style={{display:"flex",gap:8}}>
              <button onClick={confirmStatus} style={{
                flex:1,padding:"12px",border:"none",borderRadius:10,
                background:`linear-gradient(135deg,${STATUS[pendingStatus].color},${STATUS[pendingStatus].color}bb)`,
                color:"#fff",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"inherit",
              }}>ยืนยัน {STATUS[pendingStatus].icon} {STATUS[pendingStatus].label}</button>
              <button onClick={()=>{setPendingStatus("");setReason("");}} style={{
                padding:"12px 16px",border:"1.5px solid #2E2E50",borderRadius:10,
                background:"transparent",color:"#8080A0",fontSize:14,cursor:"pointer",fontFamily:"inherit",
              }}>ยกเลิก</button>
            </div>
          </div>
        )}
      </div>

      {/* LOG */}
      {statusLog.length>0 && (
        <div style={S.card}>
          <button onClick={()=>setShowLog(v=>!v)} style={{
            width:"100%",background:"none",border:"none",padding:0,
            display:"flex",justifyContent:"space-between",alignItems:"center",cursor:"pointer",
          }}>
            <span style={{fontSize:13,color:"#8080A0",fontWeight:600}}>📋 ประวัติสถานะ ({statusLog.length})</span>
            <span style={{fontSize:14,color:"#6060A0",display:"inline-block",
              transform:showLog?"rotate(180deg)":"rotate(0deg)",transition:"transform 0.2s"}}>▾</span>
          </button>
          {showLog && (
            <div style={{marginTop:12,animation:"slideUp 0.15s ease"}}>
              {[...statusLog].reverse().map((log,i)=>(
                <div key={i} style={{
                  display:"flex",gap:10,
                  paddingBottom:i<statusLog.length-1?10:0,
                  borderBottom:i<statusLog.length-1?"1px solid #1E1E35":"none",
                  marginBottom:i<statusLog.length-1?10:0,
                }}>
                  <div style={{
                    width:32,height:32,borderRadius:"50%",flexShrink:0,
                    background:STATUS[log.status]?.bg+"33"||"#1A1A2E",
                    border:`1.5px solid ${STATUS[log.status]?.color||"#2E2E50"}44`,
                    display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,
                  }}>{STATUS[log.status]?.icon||"?"}</div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,fontWeight:600,color:STATUS[log.status]?.color||"#F0F0FF"}}>
                      {STATUS[log.status]?.label||log.status}
                    </div>
                    {log.reason&&<div style={{fontSize:12,color:"#8080A0",marginTop:2}}>— {log.reason}</div>}
                    <div style={{fontSize:11,color:"#404060",marginTop:2}}>{fmt(log.at)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* RIDER NOTE */}
      <div style={{...S.card,marginBottom:role==="admin"?14:24}}>
        <div style={{fontSize:13,color:"#8080A0",marginBottom:8,fontWeight:600}}>
          🛵 หมายเหตุจากไรเดอร์
          {role==="rider"&&<span style={{color:"#F59E0B",fontSize:11,marginLeft:6}}>(แก้ไขได้)</span>}
        </div>
        {role==="rider" ? (
          <div style={{display:"flex",gap:8}}>
            <input placeholder="เช่น ลูกค้าไม่รับสาย, ฝากไว้หน้าบ้าน..."
              value={riderNote} onChange={e=>setRiderNote(e.target.value)} style={{flex:1}}/>
            <button onClick={saveNote} style={{
              background:saved?"#10B981":"linear-gradient(135deg,#F59E0B,#EF4444)",
              border:"none",borderRadius:10,color:"#fff",
              padding:"0 16px",fontSize:13,fontWeight:700,
              cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap",minWidth:72,
            }}>{saved?"✓":"บันทึก"}</button>
          </div>
        ) : (
          <div style={{background:"#12122060",borderRadius:10,padding:"12px 14px",
            fontSize:14,color:order.riderNote?"#F59E0B":"#404060",
            fontStyle:order.riderNote?"normal":"italic"}}>
            {order.riderNote||"ยังไม่มีหมายเหตุจากไรเดอร์"}
          </div>
        )}
      </div>

      {role==="admin" && (
        <button onClick={()=>onDelete(order.id)} style={S.dangerBtn}>🗑️ ลบออร์เดอร์นี้</button>
      )}
    </div>
  );
}

// ══════════════════════════════════════════
//  FINANCE VIEW
// ══════════════════════════════════════════
function FinanceView({ orders }) {
  const [period, setPeriod] = useState("all");
  const now = new Date();

  const filtered = orders.filter(o=>{
    if(period==="all")return true;
    const d=new Date(o.createdAt);
    if(period==="today")return d.toDateString()===now.toDateString();
    if(period==="week"){const w=new Date(now);w.setDate(now.getDate()-7);return d>=w;}
    if(period==="month")return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear();
    return true;
  });

  const totalRevenue  = filtered.filter(o=>o.status!=="cancelled").reduce((s,o)=>s+(o.totalPrice||0),0);
  const doneRevenue   = filtered.filter(o=>o.status==="done").reduce((s,o)=>s+(o.totalPrice||0),0);
  const pendingAmount = filtered.filter(o=>o.status==="waiting"||o.status==="shipping").reduce((s,o)=>s+(o.totalPrice||0),0);
  const shippingTotal = filtered.filter(o=>o.status!=="cancelled").reduce((s,o)=>s+(o.shippingFee||0),0);
  const cancelledCount= filtered.filter(o=>o.status==="cancelled").length;

  const productMap={};
  filtered.forEach(o=>{(o.cartItems||[]).forEach(it=>{
    if(!productMap[it.name])productMap[it.name]={qty:0,rev:0};
    productMap[it.name].qty+=it.qty;
    productMap[it.name].rev+=it.subtotal;
  });});
  const topProducts=Object.entries(productMap).sort((a,b)=>b[1].rev-a[1].rev).slice(0,5);
  const periods=[{k:"today",l:"วันนี้"},{k:"week",l:"7 วัน"},{k:"month",l:"เดือนนี้"},{k:"all",l:"ทั้งหมด"}];

  return (
    <div style={{animation:"slideUp 0.25s ease"}}>
      <div style={{display:"flex",gap:8,marginBottom:16}}>
        {periods.map(p=>(
          <button key={p.k} onClick={()=>setPeriod(p.k)} style={{
            flex:1,padding:"9px 0",
            background:period===p.k?"#1877F2":"#1A1A2E",
            border:`1.5px solid ${period===p.k?"#1877F2":"#2E2E50"}`,
            borderRadius:10,color:period===p.k?"#fff":"#8080A0",
            fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit",
          }}>{p.l}</button>
        ))}
      </div>

      <div style={{...S.card,textAlign:"center",marginBottom:14}}>
        <div style={{fontSize:13,color:"#8080A0",marginBottom:8}}>ยอดขายรวม</div>
        <div style={{fontSize:36,fontWeight:800,color:"#10B981",letterSpacing:-1}}>{baht(totalRevenue)}</div>
        <div style={{fontSize:12,color:"#6060A0",marginTop:4}}>{filtered.length} ออร์เดอร์</div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
        {[
          {label:"ส่งสำเร็จ",   value:baht(doneRevenue),   color:"#10B981"},
          {label:"รอ/กำลังส่ง", value:baht(pendingAmount), color:"#F59E0B"},
          {label:"ค่าจัดส่งรวม",value:baht(shippingTotal), color:"#3B82F6"},
          {label:"ออร์เดอร์",   value:`${filtered.filter(o=>o.status==="done").length}/${filtered.length}`, color:"#A855F7"},
          {label:"❌ ยกเลิก",   value:`${cancelledCount} รายการ`, color:"#EF4444"},
        ].map(s=>(
          <div key={s.label} style={{background:"#1A1A2E",border:"1.5px solid #2E2E50",borderRadius:12,padding:"14px"}}>
            <div style={{fontSize:11,color:"#6060A0",marginBottom:6}}>{s.label}</div>
            <div style={{fontSize:20,fontWeight:700,color:s.color}}>{s.value}</div>
          </div>
        ))}
      </div>

      {topProducts.length>0 && (
        <div style={S.card}>
          <div style={{fontSize:13,color:"#8080A0",marginBottom:12,fontWeight:600}}>🏆 สินค้าขายดี</div>
          {topProducts.map(([name,{qty,rev}],i)=>(
            <div key={name} style={{
              display:"flex",justifyContent:"space-between",alignItems:"center",
              padding:"9px 0",borderBottom:i<topProducts.length-1?"1px solid #1E1E35":"none",
            }}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <span style={{fontSize:12,color:"#404060",width:18}}>{i+1}</span>
                <div>
                  <div style={{fontSize:14,fontWeight:600}}>{name}</div>
                  <div style={{fontSize:11,color:"#6060A0"}}>{qty} ชิ้น</div>
                </div>
              </div>
              <div style={{fontSize:14,fontWeight:700,color:"#10B981"}}>{baht(rev)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════
//  PRODUCTS MANAGEMENT
// ══════════════════════════════════════════
function ProductsView({ products, saveProducts, toast }) {
  const [editing, setEditing] = useState(null);
  const [form,    setForm]    = useState({name:"",price:""});
  const [local,   setLocal]   = useState(products);

  useEffect(()=>setLocal(products),[products]);

  function startEdit(p){setEditing(p);setForm({name:p.name,price:String(p.price)});}
  function startNew() {setEditing("new");setForm({name:"",price:""});}

  function save() {
    if(!form.name.trim()||!form.price)return;
    let next;
    if(editing==="new"){
      next=[...local,{id:"p"+Date.now(),name:form.name.trim(),price:Number(form.price),visible:true}];
    } else {
      next=local.map(x=>x.id===editing.id?{...x,name:form.name.trim(),price:Number(form.price)}:x);
    }
    setLocal(next); saveProducts(next); setEditing(null);
  }

  function del(id){
    const next=local.filter(x=>x.id!==id);
    setLocal(next); saveProducts(next); toast("🗑️ ลบสินค้าแล้ว");
  }

  function toggleVisible(id){
    const next=local.map(x=>x.id===id?{...x,visible:!(x.visible!==false)}:x);
    setLocal(next); saveProducts(next);
  }

  const visibleCount=local.filter(p=>p.visible!==false).length;
  const allVisible=visibleCount===local.length;

  function toggleAll(){
    const next=!allVisible;
    const updated=local.map(x=>({...x,visible:next}));
    setLocal(updated); saveProducts(updated);
    toast(next?"👁️ แสดงทั้งหมดแล้ว":"🙈 ซ่อนทั้งหมดแล้ว");
  }

  return (
    <div style={{animation:"slideUp 0.25s ease"}}>
      <div style={{display:"flex",gap:8,marginBottom:16}}>
        <button onClick={startNew} style={{
          ...S.primaryBtn,flex:1,
          background:"linear-gradient(135deg,#10B981,#059669)",
          padding:"13px",fontSize:14,
        }}>+ เพิ่มสินค้าใหม่</button>
        <button onClick={toggleAll} style={{
          background:"#1A1A2E",border:"1.5px solid #2E2E50",
          borderRadius:12,padding:"0 16px",cursor:"pointer",
          fontSize:13,color:"#A0A0C0",fontFamily:"inherit",whiteSpace:"nowrap",
        }}>{allVisible?"🙈 ซ่อนทั้งหมด":"👁️ แสดงทั้งหมด"}</button>
      </div>

      <div style={{fontSize:12,color:"#6060A0",marginBottom:12,textAlign:"right"}}>
        แสดงอยู่ <span style={{color:"#1877F2",fontWeight:700}}>{visibleCount}</span> / {local.length} รายการ
      </div>

      {editing && (
        <div style={{...S.card,marginBottom:16,border:"1.5px solid #1877F2"}}>
          <div style={{fontSize:13,color:"#8080A0",marginBottom:12,fontWeight:600}}>
            {editing==="new"?"➕ สินค้าใหม่":"✏️ แก้ไขสินค้า"}
          </div>
          <Field label="ชื่อสินค้า">
            <input placeholder="เช่น เสื้อยืด" value={form.name}
              onChange={e=>setForm(f=>({...f,name:e.target.value}))}/>
          </Field>
          <Field label="ราคา (฿)">
            <input type="number" inputMode="numeric" placeholder="0"
              value={form.price} onChange={e=>setForm(f=>({...f,price:e.target.value}))}/>
          </Field>
          <div style={{display:"flex",gap:8,marginTop:4}}>
            <button onClick={save} style={{...S.primaryBtn,flex:1,background:"#1877F2",padding:"12px"}}>บันทึก</button>
            <button onClick={()=>setEditing(null)} style={{...S.primaryBtn,flex:1,background:"#2E2E50",padding:"12px"}}>ยกเลิก</button>
          </div>
        </div>
      )}

      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {local.map(p=>{
          const isVisible=p.visible!==false;
          return (
            <div key={p.id} style={{
              ...S.card,marginBottom:0,
              display:"flex",alignItems:"center",gap:12,
              opacity:isVisible?1:0.45,transition:"opacity 0.2s",
            }}>
              <button onClick={()=>toggleVisible(p.id)} style={{
                width:38,height:38,flexShrink:0,
                background:isVisible?"#1877F222":"#1E1E35",
                border:`1.5px solid ${isVisible?"#1877F255":"#2E2E50"}`,
                borderRadius:10,cursor:"pointer",
                display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,
              }}>{isVisible?"👁️":"🙈"}</button>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:15,fontWeight:600,
                  color:isVisible?"#F0F0FF":"#6060A0",
                  textDecoration:isVisible?"none":"line-through"}}>{p.name}</div>
                <div style={{fontSize:13,color:isVisible?"#F59E0B":"#505050",marginTop:2}}>{baht(p.price)}</div>
              </div>
              <div style={{display:"flex",gap:6,flexShrink:0}}>
                <button onClick={()=>startEdit(p)} style={{
                  background:"#1E1E35",border:"1.5px solid #2E2E50",color:"#A0A0C0",
                  borderRadius:8,padding:"7px 11px",cursor:"pointer",fontSize:14,
                }}>✏️</button>
                <button onClick={()=>del(p.id)} style={{
                  background:"transparent",border:"1.5px solid #FF444444",color:"#FF6060",
                  borderRadius:8,padding:"7px 11px",cursor:"pointer",fontSize:14,
                }}>🗑️</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════
//  LOGIN
// ══════════════════════════════════════════
function LoginScreen({ onLogin }) {
  const [mode, setMode]   = useState(null);
  const [pin,  setPin]    = useState("");
  const [error,setError]  = useState("");
  const [shake,setShake]  = useState(false);

  function tap(d) {
    if(pin.length>=4)return;
    const next=pin+d; setPin(next); setError("");
    if(next.length===4){
      const ok=mode==="admin"?ADMIN_PIN:RIDER_PIN;
      if(next===ok){onLogin(mode);}
      else{
        setShake(true); setError("รหัสไม่ถูกต้อง ลองใหม่อีกครั้ง");
        setTimeout(()=>{setShake(false);setPin("");},600);
      }
    }
  }

  return (
    <div style={{...S.root,display:"flex",flexDirection:"column",
      alignItems:"center",justifyContent:"center",padding:"32px 24px"}}>
      <style>{CSS}</style>
      <Glow/>
      <div style={{fontSize:52,marginBottom:8}}>📦</div>
      <div style={{fontSize:22,fontWeight:700,marginBottom:4}}>ระบบออร์เดอร์</div>
      <div style={{fontSize:13,color:"#6060A0",marginBottom:32}}>Facebook · Messenger</div>

      {!mode ? (
        <div style={{width:"100%",maxWidth:300}}>
          <div style={{fontSize:14,color:"#8080A0",textAlign:"center",marginBottom:20}}>เลือกโหมด</div>
          <button onClick={()=>setMode("admin")} style={{
            width:"100%",padding:"18px",marginBottom:14,
            background:"linear-gradient(135deg,#1877F2,#0D5FD9)",
            border:"none",borderRadius:14,color:"#fff",
            fontSize:16,fontWeight:700,cursor:"pointer",fontFamily:"inherit",
            boxShadow:"0 4px 20px #1877F244",
          }}>👑 แอดมิน</button>
          <button onClick={()=>setMode("rider")} style={{
            width:"100%",padding:"18px",
            background:"linear-gradient(135deg,#F59E0B,#D97706)",
            border:"none",borderRadius:14,color:"#fff",
            fontSize:16,fontWeight:700,cursor:"pointer",fontFamily:"inherit",
            boxShadow:"0 4px 20px #F59E0B44",
          }}>🛵 ไรเดอร์</button>
        </div>
      ) : (
        <div style={{width:"100%",maxWidth:280,animation:"slideUp 0.2s ease"}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:28}}>
            <button onClick={()=>{setMode(null);setPin("");setError("");}}
              style={{background:"none",border:"none",color:"#8080A0",fontSize:20,cursor:"pointer"}}>←</button>
            <div style={{fontSize:15,fontWeight:600}}>
              {mode==="admin"?"👑 แอดมิน":"🛵 ไรเดอร์"}
              <span style={{color:"#6060A0",fontWeight:400}}> — PIN 4 หลัก</span>
            </div>
          </div>
          <div style={{display:"flex",justifyContent:"center",gap:18,marginBottom:12,
            animation:shake?"shake 0.4s ease":"none"}}>
            {[0,1,2,3].map(i=>(
              <div key={i} style={{width:20,height:20,borderRadius:"50%",
                background:i<pin.length?(mode==="admin"?"#1877F2":"#F59E0B"):"#2E2E50",
                transition:"background 0.15s"}}/>
            ))}
          </div>
          <div style={{textAlign:"center",fontSize:13,color:"#FF6060",marginBottom:16,minHeight:18}}>{error}</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12}}>
            {[1,2,3,4,5,6,7,8,9,"",0,"⌫"].map((d,i)=>(
              <button key={i} onClick={()=>{
                if(d==="⌫"){setPin(p=>p.slice(0,-1));setError("");}
                else if(d!=="")tap(String(d));
              }} style={{
                height:64,
                background:d===""?"transparent":"#1A1A2E",
                border:d===""?"none":"1.5px solid #2E2E50",
                borderRadius:14,color:d==="⌫"?"#A0A0C0":"#F0F0FF",
                fontSize:d==="⌫"?20:22,fontWeight:500,
                cursor:d===""?"default":"pointer",
                fontFamily:"inherit",transition:"background 0.1s",
              }}
              onPointerDown={e=>{if(d!=="")e.currentTarget.style.background="#2A2A40";}}
              onPointerUp={e=>{if(d!=="")e.currentTarget.style.background="#1A1A2E";}}
              >{d}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════
//  SMALL COMPONENTS
// ══════════════════════════════════════════
function QtyControl({ qty, onChange }) {
  return (
    <div style={{display:"flex",alignItems:"center"}}>
      <button onClick={()=>onChange(qty-1)} style={S.qtyBtn}>−</button>
      <span style={{minWidth:36,textAlign:"center",fontSize:16,fontWeight:700,
        color:qty>0?"#F0F0FF":"#404060"}}>{qty||0}</span>
      <button onClick={()=>onChange(qty+1)} style={{...S.qtyBtn,background:"#1877F222",borderColor:"#1877F244",color:"#1877F2"}}>+</button>
    </div>
  );
}

function OrderCard({ order, index, onClick }) {
  return (
    <div className="order-card" onClick={onClick} style={{
      background:"#1A1A2E",border:"1.5px solid #2E2E50",
      borderRadius:14,padding:"14px 16px",marginBottom:10,
      cursor:"pointer",animationDelay:`${index*0.04}s`,
    }}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:4,flexWrap:"wrap"}}>
            <span style={{fontWeight:700,fontSize:15}}>{order.name}</span>
            <span style={{fontSize:11,fontWeight:600,
              color:SOURCE[order.source].color,
              background:SOURCE[order.source].color+"22",
              borderRadius:6,padding:"2px 7px"}}>
              {SOURCE[order.source].icon} {SOURCE[order.source].label}
            </span>
          </div>
          <div style={{fontSize:13,color:"#8080B0",marginBottom:4}}>
            {(order.cartItems||[]).map(i=>`${i.name}×${i.qty}`).join(", ")||order.items}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <span style={{fontSize:13,fontWeight:700,color:"#10B981"}}>{baht(order.totalPrice||0)}</span>
            <span style={{fontSize:11,color:"#404060"}}>{fmt(order.createdAt)}</span>
          </div>
          {order.riderNote&&<div style={{fontSize:12,color:"#F59E0B",marginTop:4}}>🛵 {order.riderNote}</div>}
        </div>
        <div style={{fontSize:11,fontWeight:600,
          color:STATUS[order.status].color,
          background:STATUS[order.status].bg+"33",
          border:`1px solid ${STATUS[order.status].color}44`,
          borderRadius:8,padding:"4px 10px",marginLeft:10,whiteSpace:"nowrap"}}>
          {STATUS[order.status].icon} {STATUS[order.status].label}
        </div>
      </div>
    </div>
  );
}

function SmartNote({ label, value, onChange, presets=[], placeholder="", compact=false }) {
  function togglePreset(p) {
    if(!value.trim()){onChange(p);return;}
    const parts=value.split(",").map(x=>x.trim()).filter(Boolean);
    if(parts.includes(p)){onChange(parts.filter(x=>x!==p).join(", "));}
    else{onChange(value.trimEnd()+(value.endsWith(",")?" ":",")+p);}
  }
  function isActive(p){return value.split(",").map(x=>x.trim()).includes(p);}
  return (
    <div style={{marginBottom:compact?10:14}}>
      {label&&<div style={{fontSize:13,color:"#8080A0",marginBottom:8,fontWeight:500}}>{label}</div>}
      {presets.length>0&&(
        <div style={{display:"flex",flexWrap:"wrap",gap:7,marginBottom:8}}>
          {presets.map(p=>{
            const active=isActive(p);
            return (
              <button key={p} onClick={()=>togglePreset(p)} style={{
                padding:"6px 12px",
                background:active?"#1877F233":"#1A1A2E",
                border:`1.5px solid ${active?"#1877F2":"#2E2E50"}`,
                borderRadius:20,color:active?"#1877F2":"#8080A0",
                fontSize:12,fontWeight:active?600:400,
                cursor:"pointer",fontFamily:"inherit",
                transition:"all 0.15s",whiteSpace:"nowrap",
              }}>
                {active&&<span style={{marginRight:4}}>✓</span>}{p}
              </button>
            );
          })}
        </div>
      )}
      <input placeholder={placeholder} value={value} onChange={e=>onChange(e.target.value)}/>
    </div>
  );
}

function Empty(){
  return(
    <div style={{textAlign:"center",marginTop:60}}>
      <div style={{fontSize:48}}>📭</div>
      <div style={{fontSize:14,color:"#404060",marginTop:12}}>ยังไม่มีออร์เดอร์</div>
    </div>
  );
}

function Field({ label, children }) {
  return(
    <div style={{marginBottom:14}}>
      <div style={S.fieldLabel}>{label}</div>
      {children}
    </div>
  );
}

function Glow() {
  return <>
    <div style={{position:"fixed",top:-80,right:-60,width:260,height:260,
      background:"radial-gradient(circle,#1877F233 0%,transparent 70%)",pointerEvents:"none",zIndex:0}}/>
    <div style={{position:"fixed",bottom:-60,left:-60,width:220,height:220,
      background:"radial-gradient(circle,#A855F722 0%,transparent 70%)",pointerEvents:"none",zIndex:0}}/>
  </>;
}

function Toast({ msg }) {
  return <div style={{position:"fixed",top:20,left:"50%",transform:"translateX(-50%)",
    background:"#1E1E30",border:"1px solid #3B3B55",borderRadius:12,
    padding:"10px 20px",fontSize:14,zIndex:999,
    boxShadow:"0 4px 24px #0008",animation:"fadeIn 0.2s ease",whiteSpace:"nowrap"}}>{msg}</div>;
}

const S = {
  root:    {fontFamily:"'Sarabun','Noto Sans Thai',sans-serif",background:"#0F0F1A",minHeight:"100vh",color:"#F0F0FF",maxWidth:430,margin:"0 auto",position:"relative"},
  header:  {position:"sticky",top:0,zIndex:10,background:"rgba(15,15,26,0.95)",backdropFilter:"blur(12px)",borderBottom:"1px solid #1E1E35",padding:"14px 20px 10px",display:"flex",alignItems:"center",justifyContent:"space-between"},
  body:    {padding:"16px 20px 100px",position:"relative",zIndex:1},
  card:    {background:"#1A1A2E",border:"1.5px solid #2E2E50",borderRadius:14,padding:"16px",marginBottom:14},
  backBtn: {background:"none",border:"none",color:"#A0A0C0",fontSize:22,cursor:"pointer",padding:"0 6px 0 0"},
  iconBtn: {background:"#1E1E35",border:"none",color:"#A0A0C0",borderRadius:10,padding:"8px 12px",fontSize:18,cursor:"pointer"},
  addBtn:  {background:"linear-gradient(135deg,#1877F2,#A855F7)",border:"none",color:"#fff",borderRadius:10,padding:"8px 16px",fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:"inherit"},
  clearBtn:{background:"none",border:"none",color:"#6060A0",fontSize:12,cursor:"pointer"},
  primaryBtn:{width:"100%",padding:"15px",border:"none",borderRadius:12,fontSize:16,fontWeight:700,cursor:"pointer",fontFamily:"inherit"},
  dangerBtn: {width:"100%",padding:"13px",background:"transparent",border:"1.5px solid #FF4444",borderRadius:12,color:"#FF4444",fontSize:14,fontWeight:600,cursor:"pointer",fontFamily:"inherit"},
  fieldLabel:{fontSize:13,color:"#8080A0",marginBottom:6},
  qtyBtn:  {width:36,height:36,background:"#1E1E35",border:"1.5px solid #2E2E50",borderRadius:8,color:"#A0A0C0",fontSize:20,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"inherit"},
};

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Sarabun:wght@400;500;600;700&display=swap');
  * { box-sizing:border-box; -webkit-tap-highlight-color:transparent; }
  ::-webkit-scrollbar { width:4px; }
  ::-webkit-scrollbar-thumb { background:#3B3B55; border-radius:4px; }
  @keyframes fadeIn  { from{opacity:0;transform:translateX(-50%) translateY(-8px)} to{opacity:1;transform:translateX(-50%) translateY(0)} }
  @keyframes slideUp { from{opacity:0;transform:translateY(16px)} to{opacity:1;transform:translateY(0)} }
  @keyframes shake   { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-8px)} 40%{transform:translateX(8px)} 60%{transform:translateX(-5px)} 80%{transform:translateX(5px)} }
  @keyframes pulse   { 0%,100%{transform:scale(1)} 50%{transform:scale(1.08)} }
  @keyframes bounce  { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
  .order-card { animation:slideUp 0.25s ease forwards; }
  input,textarea,select {
    background:#1A1A2E !important; color:#F0F0FF !important;
    border:1.5px solid #2E2E50 !important; border-radius:10px !important;
    padding:12px 14px !important; font-size:15px !important;
    font-family:inherit !important; width:100% !important;
    outline:none !important; transition:border-color 0.2s !important;
    -webkit-appearance:none; appearance:none;
  }
  input:focus,textarea:focus,select:focus { border-color:#1877F2 !important; }
  select option { background:#1A1A2E; }
  button { -webkit-tap-highlight-color:transparent; touch-action:manipulation; }
`;
