const express = require('express')
const admin = require('firebase-admin')

const serviceAccount = process.env.FIREBASE_CREDENTIALS
  ? JSON.parse(process.env.FIREBASE_CREDENTIALS)
  : require('./serviceAccount.json')

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })

const db = admin.firestore()
const app = express()
const port = process.env.PORT || 3000

app.use(express.json())
app.use(express.static(__dirname))

// ─── USUARIOS ── cambia nombres y PINs como quieras ──────────────────────────
const USUARIOS = [
  { pin: '4690', nombre: 'Rodrigo' },
  { pin: '2222', nombre: 'Mama' },
  { pin: '3333', nombre: 'Eli' },
  { pin: '4444', nombre: 'Pepe' }
]
const PIN_ADMIN = '9999' // para limpiar datos de prueba

app.get('/', (req, res) => res.sendFile(__dirname + '/index.html'))

app.post('/verificar-pin', (req, res) => {
  const u = USUARIOS.find(u => u.pin === req.body.pin)
  u ? res.json({ ok: true, nombre: u.nombre }) : res.json({ ok: false })
})

// INVENTARIO
app.get('/inventario', async (req, res) => {
  const snap = await db.collection('inventario').get()
  const p = []; snap.forEach(d => p.push({ id: d.id, ...d.data() })); res.json(p)
})

app.post('/producto', async (req, res) => {
  const p = { ...req.body, ultima_actualizacion: new Date(), agregado_por: req.body.usuario || '?' }
  delete p.usuario
  const ref = await db.collection('inventario').add(p)
  res.json({ id: ref.id })
})

// VENTAS
app.post('/venta', async (req, res) => {
  const { producto_id, cantidad, usuario } = req.body
  const ref = db.collection('inventario').doc(producto_id)
  const doc = await ref.get()
  if (!doc.exists) return res.status(404).json({ error: 'No encontrado' })
  const d = doc.data()
  const nuevo_stock = d.stock_actual - cantidad
  await ref.update({
    stock_actual: nuevo_stock,
    ultima_actualizacion: new Date(),
    ventas_count: (d.ventas_count || 0) + cantidad
  })
  await db.collection('ventas').add({
    producto_id, nombre: d.nombre, marca: d.marca, unidad: d.unidad || 'pieza',
    cantidad, precio_venta: d.precio_venta, costo: d.costo || 0,
    total: d.precio_venta * cantidad,
    ganancia: (d.precio_venta - (d.costo || 0)) * cantidad,
    fecha: new Date(), registrado_por: usuario || '?'
  })
  const alerta = nuevo_stock <= d.stock_minimo ? '🚨 Stock bajo' : null
  res.json({ stock_nuevo: nuevo_stock, alerta })
})

app.get('/ventas-hoy', async (req, res) => {
  const hoy = new Date(); hoy.setHours(0,0,0,0)
  const snap = await db.collection('ventas').where('fecha','>=',hoy).get()
  let ventas=[], total_dia=0, ganancia_dia=0
  snap.forEach(d => { const v={id:d.id,...d.data()}; ventas.push(v); total_dia+=v.total||0; ganancia_dia+=v.ganancia||0 })
  res.json({ ventas, total_dia, ganancia_dia })
})

app.get('/ventas-semana', async (req, res) => {
  const hoy = new Date()
  const ini = new Date(hoy); ini.setDate(hoy.getDate()-hoy.getDay()); ini.setHours(0,0,0,0)
  const snap = await db.collection('ventas').where('fecha','>=',ini).get()
  let total=0, ganancia=0, uds=0
  snap.forEach(d => { const v=d.data(); total+=v.total||0; ganancia+=v.ganancia||0; uds+=v.cantidad||0 })
  res.json({ total_semana: total, ganancia_semana: ganancia, total_productos: uds })
})

app.get('/ventas-mes', async (req, res) => {
  const hoy = new Date()
  const ini = new Date(hoy.getFullYear(), hoy.getMonth(), 1)
  const snap = await db.collection('ventas').where('fecha','>=',ini).get()
  let total=0, ganancia=0, uds=0
  snap.forEach(d => { const v=d.data(); total+=v.total||0; ganancia+=v.ganancia||0; uds+=v.cantidad||0 })
  res.json({ total_mes: total, ganancia_mes: ganancia, total_productos: uds })
})

app.get('/top-productos', async (req, res) => {
  const snap = await db.collection('inventario').orderBy('ventas_count','desc').limit(5).get()
  const top = []
  snap.forEach(d => {
    const p=d.data()
    if ((p.ventas_count||0) > 0) top.push({ id:d.id, nombre:p.nombre, precio_venta:p.precio_venta, unidad:p.unidad||'pieza', stock_actual:p.stock_actual })
  })
  res.json(top)
})

// GASTOS
app.post('/gasto', async (req, res) => {
  const { monto, concepto, usuario } = req.body
  if (!monto||!concepto) return res.status(400).json({ error:'Faltan datos' })
  await db.collection('gastos').add({ monto:parseFloat(monto), concepto, fecha:new Date(), registrado_por:usuario||'?' })
  res.json({ ok: true })
})

app.get('/gastos-hoy', async (req, res) => {
  const hoy = new Date(); hoy.setHours(0,0,0,0)
  const snap = await db.collection('gastos').where('fecha','>=',hoy).get()
  let gastos=[], total=0
  snap.forEach(d => { const g={id:d.id,...d.data()}; gastos.push(g); total+=g.monto||0 })
  res.json({ gastos, total_gastos: total })
})

// RETIROS DE CAJA
app.post('/retiro', async (req, res) => {
  const { monto, concepto, usuario } = req.body
  if (!monto||!concepto) return res.status(400).json({ error:'Faltan datos' })
  await db.collection('retiros').add({ monto:parseFloat(monto), concepto, fecha:new Date(), registrado_por:usuario||'?' })
  res.json({ ok: true })
})

app.get('/retiros-hoy', async (req, res) => {
  const hoy = new Date(); hoy.setHours(0,0,0,0)
  const snap = await db.collection('retiros').where('fecha','>=',hoy).get()
  let retiros=[], total=0
  snap.forEach(d => { const r={id:d.id,...d.data()}; retiros.push(r); total+=r.monto||0 })
  res.json({ retiros, total_retiros: total })
})

// REPORTE INVENTARIO
app.get('/reporte', async (req, res) => {
  const snap = await db.collection('inventario').get()
  let urgentes=[], normales=[]
  snap.forEach(d => {
    const p={id:d.id,...d.data()}
    if (p.stock_actual<=p.stock_minimo) urgentes.push(p)
    else if (p.stock_actual<=p.stock_minimo*2) normales.push(p)
  })
  res.json({ urgentes, normales })
})

// LIMPIAR DATOS DE PRUEBA ── visita: /limpiar-pruebas?pin=9999
app.get('/limpiar-pruebas', async (req, res) => {
  if (req.query.pin !== PIN_ADMIN) return res.status(403).json({ error:'PIN incorrecto' })
  for (const col of ['ventas','gastos','retiros']) {
    const snap = await db.collection(col).get()
    const batch = db.batch()
    snap.forEach(d => batch.delete(d.ref))
    await batch.commit()
  }
  const snap = await db.collection('inventario').get()
  const batch = db.batch()
  snap.forEach(d => batch.update(d.ref, { ventas_count:0 }))
  await batch.commit()
  res.json({ mensaje:'✅ Pruebas borradas. Inventario conservado.' })
})

app.listen(port, () => console.log(`FarmaStock en http://localhost:${port}`))