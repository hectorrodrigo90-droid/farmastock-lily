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

app.listen(port, () => {
  console.log(`FarmaStock corriendo en http://localhost:${port}`)
})