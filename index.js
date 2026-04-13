const express = require('express')
const admin = require('firebase-admin')

// Escudo de seguridad para credenciales en la nube
let serviceAccount;
try {
  serviceAccount = process.env.FIREBASE_CREDENTIALS
    ? JSON.parse(process.env.FIREBASE_CREDENTIALS)
    : require('./serviceAccount.json')
} catch (error) {
  console.error("Error de Firebase: Revisa las variables en Railway. Detalle:", error.message);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
})

const db = admin.firestore()
const app = express()
const port = process.env.PORT || 3000

app.use(express.json())
app.use(express.static(__dirname))

// PINs de las 4 familias (cámbialos como quieras)
const PINES_VALIDOS = ['1234', '5678', '9012', '3456']

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html')
})

// Verificar PIN
app.post('/verificar-pin', (req, res) => {
  const { pin } = req.body
  if (PINES_VALIDOS.includes(pin)) {
    res.json({ ok: true })
  } else {
    res.json({ ok: false })
  }
})

app.get('/inventario', async (req, res) => {
  const snapshot = await db.collection('inventario').get()
  const productos = []
  snapshot.forEach(doc => productos.push({ id: doc.id, ...doc.data() }))
  res.json(productos)
})

app.post('/producto', async (req, res) => {
  const producto = {
    nombre: req.body.nombre,
    marca: req.body.marca,
    precio_venta: req.body.precio_venta,
    costo: req.body.costo,
    stock_actual: req.body.stock_actual,
    stock_minimo: req.body.stock_minimo,
    unidad: req.body.unidad || 'pieza',
    fecha_caducidad: req.body.fecha_caducidad,
    ultima_actualizacion: new Date()
  }
  const ref = await db.collection('inventario').add(producto)
  res.json({ mensaje: 'Producto guardado', id: ref.id, producto })
})

app.post('/venta', async (req, res) => {
  const { producto_id, cantidad } = req.body
  const ref = db.collection('inventario').doc(producto_id)
  const doc = await ref.get()
  if (!doc.exists) return res.status(404).json({ error: 'Producto no encontrado' })
  const stock_actual = doc.data().stock_actual
  const nuevo_stock = stock_actual - cantidad
  await ref.update({ stock_actual: nuevo_stock, ultima_actualizacion: new Date() })

  await db.collection('ventas').add({
    producto_id,
    nombre: doc.data().nombre,
    marca: doc.data().marca,
    unidad: doc.data().unidad || 'pieza',
    cantidad,
    precio_venta: doc.data().precio_venta,
    costo: doc.data().costo || 0,
    total: doc.data().precio_venta * cantidad,
    ganancia: (doc.data().precio_venta - (doc.data().costo || 0)) * cantidad,
    fecha: new Date()
  })

  const alerta = nuevo_stock <= doc.data().stock_minimo
    ? '🚨 ALERTA: Stock bajo, considera comprar pronto'
    : null
  res.json({ mensaje: 'Venta registrada', stock_anterior: stock_actual, stock_nuevo: nuevo_stock, alerta })
})

app.get('/reporte', async (req, res) => {
  const snapshot = await db.collection('inventario').get()
  const urgentes = []
  const normales = []
  snapshot.forEach(doc => {
    const p = { id: doc.id, ...doc.data() }
    if (p.stock_actual <= p.stock_minimo) urgentes.push(p)
    else if (p.stock_actual <= p.stock_minimo * 2) normales.push(p)
  })
  res.json({ fecha: new Date(), urgentes, normales, total_productos_revisar: urgentes.length + normales.length })
})

app.get('/ventas-hoy', async (req, res) => {
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const snapshot = await db.collection('ventas').where('fecha', '>=', hoy).get()
  const ventas = []
  let total_dia = 0
  let ganancia_dia = 0
  snapshot.forEach(doc => {
    const v = { id: doc.id, ...doc.data() }
    ventas.push(v)
    total_dia += v.total || 0
    ganancia_dia += v.ganancia || 0
  })
  res.json({ ventas, total_dia, ganancia_dia })
})

// Ventas de la semana actual
app.get('/ventas-semana', async (req, res) => {
  const hoy = new Date()
  const diaSemana = hoy.getDay() // 0=domingo
  const inicioSemana = new Date(hoy)
  inicioSemana.setDate(hoy.getDate() - diaSemana)
  inicioSemana.setHours(0, 0, 0, 0)

  const snapshot = await db.collection('ventas').where('fecha', '>=', inicioSemana).get()
  let total_semana = 0
  let ganancia_semana = 0
  let total_productos = 0
  snapshot.forEach(doc => {
    const v = doc.data()
    total_semana += v.total || 0
    ganancia_semana += v.ganancia || 0
    total_productos += v.cantidad || 0
  })
  res.json({ total_semana, ganancia_semana, total_productos, desde: inicioSemana })
})

// Ventas del mes actual
app.get('/ventas-mes', async (req, res) => {
  const hoy = new Date()
  const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1)

  const snapshot = await db.collection('ventas').where('fecha', '>=', inicioMes).get()
  let total_mes = 0
  let ganancia_mes = 0
  let total_productos = 0
  snapshot.forEach(doc => {
    const v = doc.data()
    total_mes += v.total || 0
    ganancia_mes += v.ganancia || 0
    total_productos += v.cantidad || 0
  })
  res.json({ total_mes, ganancia_mes, total_productos, desde: inicioMes })
})

// Registrar gasto
app.post('/gasto', async (req, res) => {
  const { monto, concepto } = req.body
  if (!monto || !concepto) return res.status(400).json({ error: 'Faltan datos' })
  await db.collection('gastos').add({
    monto: parseFloat(monto),
    concepto,
    fecha: new Date()
  })
  res.json({ mensaje: 'Gasto registrado' })
})

// Gastos de hoy
app.get('/gastos-hoy', async (req, res) => {
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  const snapshot = await db.collection('gastos').where('fecha', '>=', hoy).get()
  const gastos = []
  let total_gastos = 0
  snapshot.forEach(doc => {
    const g = { id: doc.id, ...doc.data() }
    gastos.push(g)
    total_gastos += g.monto || 0
  })
  res.json({ gastos, total_gastos })
})

// ¡AQUÍ ESTÁ LA MAGIA PARA QUE LA NUBE TE ESCUCHE! (0.0.0.0)
app.listen(port, '0.0.0.0', () => {
  console.log(`FarmaStock conectado y escuchando en el puerto ${port}`)
})