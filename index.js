const express = require('express')
const admin = require('firebase-admin')

const serviceAccount = process.env.FIREBASE_CREDENTIALS
  ? JSON.parse(process.env.FIREBASE_CREDENTIALS)
  : require('./serviceAccount.json')

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
})

const db = admin.firestore()
const app = express()
const port = process.env.PORT || 3000

app.use(express.json())
app.use(express.static(__dirname))

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html')
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

  // Guardar en historial de ventas
  await db.collection('ventas').add({
    producto_id,
    nombre: doc.data().nombre,
    marca: doc.data().marca,
    unidad: doc.data().unidad || 'pieza',
    cantidad,
    precio_venta: doc.data().precio_venta,
    total: doc.data().precio_venta * cantidad,
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
  const snapshot = await db.collection('ventas')
    .where('fecha', '>=', hoy)
    .get()
  const ventas = []
  let total_dia = 0
  snapshot.forEach(doc => {
    const v = { id: doc.id, ...doc.data() }
    ventas.push(v)
    total_dia += v.total || 0
  })
  res.json({ ventas, total_dia })
})

app.listen(port, () => {
  console.log(`FarmaStock corriendo en http://localhost:${port}`)
})