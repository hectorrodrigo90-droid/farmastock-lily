const express = require('express')
const admin = require('firebase-admin')
const serviceAccount = require('./serviceAccount.json')

// Conectar con Firebase
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
})

const db = admin.firestore()
const app = express()
const port = 3000

app.use(express.json())
app.use(express.static(__dirname))
// Ruta de prueba
app.get('/', (req, res) => {
  res.send('🏥 FarmaStock Lily funcionando!')
})

// Ver todo el inventario
app.get('/inventario', async (req, res) => {
  const snapshot = await db.collection('inventario').get()
  const productos = []
  snapshot.forEach(doc => productos.push({ id: doc.id, ...doc.data() }))
  res.json(productos)
})

// Agregar un producto
app.post('/producto', async (req, res) => {
  const producto = {
    nombre: req.body.nombre,
    marca: req.body.marca,
    precio_venta: req.body.precio_venta,
    costo: req.body.costo,
    stock_actual: req.body.stock_actual,
    stock_minimo: req.body.stock_minimo,
    fecha_caducidad: req.body.fecha_caducidad,
    ultima_actualizacion: new Date()
  }
  const ref = await db.collection('inventario').add(producto)
  res.json({ mensaje: 'Producto guardado en la nube', id: ref.id, producto })
})
// Reporte de compras
app.get('/reporte', async (req, res) => {
  const snapshot = await db.collection('inventario').get()
  const urgentes = []
  const normales = []

  snapshot.forEach(doc => {
    const p = { id: doc.id, ...doc.data() }
    if (p.stock_actual <= p.stock_minimo) {
      urgentes.push(p)
    } else if (p.stock_actual <= p.stock_minimo * 2) {
      normales.push(p)
    }
  })

  res.json({
    fecha: new Date(),
    urgentes,
    normales,
    total_productos_revisar: urgentes.length + normales.length
  })
})
app.listen(port, () => {
  console.log(`FarmaStock corriendo en http://localhost:${port}`)
  // Registrar una venta
app.post('/venta', async (req, res) => {
  const { producto_id, cantidad } = req.body

  const ref = db.collection('inventario').doc(producto_id)
  const doc = await ref.get()

  if (!doc.exists) {
    return res.status(404).json({ error: 'Producto no encontrado' })
  }

  const stock_actual = doc.data().stock_actual
  const nuevo_stock = stock_actual - cantidad

  await ref.update({
    stock_actual: nuevo_stock,
    ultima_actualizacion: new Date()
  })

  const alerta = nuevo_stock <= doc.data().stock_minimo
    ? '🚨 ALERTA: Stock bajo, considera comprar pronto'
    : null

  res.json({
    mensaje: 'Venta registrada',
    stock_anterior: stock_actual,
    stock_nuevo: nuevo_stock,
    alerta
  })
})
})