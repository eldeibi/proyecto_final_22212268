const express = require('express');
const app = express();
const path = require('path');
const bodyParser = require('body-parser');
const session = require('express-session');
const bcrypt = require('bcrypt');
const mysql = require('mysql2');

const fs = require('fs');
const PDFDocument = require('pdfkit');
const multer = require('multer');
const PORT = process.env.PORT || 3000; 
const xlsx = require('xlsx');
const { createConnection } = require('net');
require('dotenv').config();

const upload = multer({ dest: 'uploads/' });

timezone: 'America/Tijuana'

function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.redirect('/login.html');
  }
  next();
}

function requireRole(role) {
  return (req, res, next) => {
      if (req.session.user && req.session.user.tipo_usuario === role) {
          next();
      } else {
          res.status(403).send('Acceso denegado');
      }
  };


}

// Configuración de Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Configuración de la sesión
app.use(session({
  secret: 'secretKey',
  resave: false,
  saveUninitialized: false,
}));

app.use(bodyParser.urlencoded({ extended: true }));


const connection = mysql.createConnection({
  host: process.env.DB_HOST,       // Host desde .env
  user: process.env.DB_USER,       // Usuario desde .env
  password: process.env.DB_PASS,   // Contraseña desde .env
  database: process.env.DB_NAME    // Nombre de la base de datos desde .env
});


// Conectar a la base de datos
connection.connect(err => {
  if (err) {
    console.error('Error al conectar con la base de datos:', err);
    return;
  }
  console.log('Conexión exitosa a la base de datos');
});



// Ruta para obtener el tipo de usuario actual
app.get('/tipo-usuario', requireLogin, (req, res) => {
  res.json({ tipo_usuario: req.session.user.tipo_usuario });
});



app.post('/login', (req, res) => {
  const { nombre_usuario, password } = req.body;

  // Consulta para obtener el usuario y su tipo
  const query = 'SELECT * FROM usuarios WHERE nombre_usuario = ?';
  connection.query(query, [nombre_usuario], (err, results) => {
      if (err) {
          return res.send('Error al obtener el usuario');
      }

      if (results.length === 0) {
          return res.send('Usuario no encontrado');
      }

      const user = results[0];

      // Verificar la contraseña
      const isPasswordValid = bcrypt.compareSync(password, user.password_hash);
      if (!isPasswordValid) {
          return res.send('Contraseña incorrecta');
      }

      // Almacenar la información del usuario en la sesión
      req.session.user = {
          id: user.id,
          nombre_usuario: user.nombre_usuario,
          tipo_usuario: user.tipo_usuario // Aquí se establece el tipo de usuario en la sesión
      };

      // Redirigir al usuario a la página principal
      res.redirect('/');
  });
});

//Registrar Usuarios

app.post('/registrar', (req, res) => {
  const { username, password, codigo_acceso } = req.body;

  const query = 'SELECT tipo_usuario FROM codigos_acceso WHERE codigo = ?';
  connection.query(query, [codigo_acceso], (err, results) => {
      if (err || results.length === 0) {
          return res.send('Código de acceso inválido');
      }

      const tipo_usuario = results[0].tipo_usuario;
      const hashedPassword = bcrypt.hashSync(password, 10);

      const insertUser = 'INSERT INTO usuarios (nombre_usuario, password_hash, tipo_usuario) VALUES (?, ?, ?)';
      connection.query(insertUser, [username, hashedPassword, tipo_usuario], (err) => {
          if (err) return res.send('Error al registrar usuario');
          res.redirect('/login.html');
      });
  });
});


// Ruta para obtener el tipo de usuario actual
app.get('/tipo-usuario', requireLogin, (req, res) => {
  res.json({ tipo_usuario: req.session.user.tipo_usuario });
});














//Opciones de Rol RH

// Ruta para Agregar un Empleado
app.post('/agregar-trabajador', requireLogin, requireRole('RH'),  (req, res) => {
  const { name, age, salary, zona_id } = req.body;

  const query = 'INSERT INTO empleados (nombre, edad, salario, zona_id) VALUES (?, ?, ?, ?)';
  connection.query(query, [name, age, salary, zona_id], (err, result) => {
    if (err) {
      return res.send('Error al guardar los datos en la base de datos.');
    }
    res.send(`Trabajador ${name} guardado en la base de datos.`);
  });
});

// Ruta para Dar de Baja un Empleado
app.post('/baja-empleado', requireLogin, requireRole('RH'), (req, res) => {
  const { id, name} = req.body;

  const query = 'DELETE FROM empleados WHERE id = ? and nombre = ?';
  connection.query(query, [id, name], (err, result) => {
    if (err) {
      return res.send('Error al dar de baja al empleado.');
    }
    res.send(`Trabajador ${name} ha sido dado de baja.`);
  });
});


app.get('/inicio', requireLogin, requireRole('RH'), (req, res) => {
  const query = 'START TRANSACTION;';
  connection.query(query, (err, result) => {
    if (err) {
      return res.send('Error al insertar el empleados.');
    }
    res.redirect('/empleados_mas.html');
  });
});

app.post('/empleados_mas', requireLogin, requireRole('RH'), (req, res) => {
  const { name, age, salary, zona_id } = req.body;
  const query = 'INSERT INTO empleados (nombre, edad, salario, zona_id) VALUES (?, ?, ?, ?)';

  connection.query(query,[name, age, salary, zona_id], (err, result) => {
    if (err) {
      return res.send('Error al contratar empleados.');
    }
    res.send(`Trabajador ${name} guardado en la base de datos.`);
  });
});

app.get('/aceptar', requireLogin,requireRole('RH'), (req, res) => {
  connection.query('COMMIT;') 
  connection.query('SELECT * FROM empleados', (err, results) => {
    if (err) {
      return res.send('Error al obtener los datos.');
    }
    let html = `
    <html>
    <head>
      <link rel="stylesheet" href="/styles.css">
      <title>Empleados Multiples</title>
    </head>
    <body>
      <h1>Tabla de Empleados Actualizada</h1>
      <table>
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Edad</th>
            <th>Salario</th>
            <th>Zona ID</th>
          </tr>
        </thead>
        <tbody>
  `;

  results.forEach(empleados => {
    html += `
      <tr>
             <td>${empleados.id}</td>
            <td>${empleados.nombre}</td>
            <td>${empleados.edad}</td>
            <td>${empleados.salario}</td>
            <td>${empleados.zona_id}</td>
          </tr>
    `;
  });

  html += `
        </tbody>
      </table>
      <button onclick="window.location.href='/'">Volver</button>
    </body>
    </html>
  `;

    res.send(html);
  });
});

app.get('/cancelar', requireLogin,requireRole('RH'), (req, res) => {
  connection.query('ROLLBACK;') 
  connection.query('SELECT * FROM empleados', (err, results) => {
    if (err) {
      return res.send('Error al obtener los de la tabla.');
    }
    let html = `
    <html>
    <head>
      <link rel="stylesheet" href="/styles.css">
      <title>Medicos</title>
    </head>
    <body>
      <h1>Contratacion Cancelada</h1>
        <tbody>
  `;

  html += `
        </tbody>
      </table>
      <button onclick="window.location.href='/'">Volver</button>
    </body>
    </html>
  `;

    res.send(html);
  });
});













// Ruta para mostrar los Empleados Actuales
app.get('/empleados', requireLogin, requireRole('RH'), (req, res) => {
    connection.query('SELECT * FROM empleados', (err, results) => {
      if (err) {
        return res.send('Error al obtener los datos.');
      }
  
      let html = `
        <html>
        <head>
          <link rel="stylesheet" href="/styles.css">
          <title>Empleados</title>
        </head>
        <body>
          <h1>Empleados Activos</h1>
          <table>
            <thead>
              <tr>
               <th>ID</th>
                <th>Nombre</th>
                <th>Edad</th>
                <th>Salario</th>
                 <th>Zona (ID)</th>
              </tr>
            </thead>
            <tbody>
      `;
  
      results.forEach(empleados => {
        html += `
          <tr>
             <td>${empleados.id}</td>
            <td>${empleados.nombre}</td>
            <td>${empleados.edad}</td>
            <td>${empleados.salario}</td>
            <td>${empleados.zona_id}</td>
          </tr>
        `;
      });
  
      html += `
            </tbody>
          </table>
          <button onclick="window.location.href='/'">Volver</button>
        </body>
        </html>
      `;
  
      res.send(html);
    });
  });

// Ruta para mostrar los Empleados De las Diferentes Zonas
app.get('/empleados1', requireLogin, requireRole('RH'), (req, res) => {
  connection.query('SELECT * FROM zona_1', (err, results) => {
    if (err) {
      return res.send('Error al obtener los empleados de la zona.');
    }

    let html = `
      <html>
      <head>
        <link rel="stylesheet" href="/styles.css">
        <title>Empleados del Laboratorio de Investigación </title>
      </head>
      <body>
        <h1>Empleados Activos del Laboratorio de Investigación</h1>
        <table>
          <thead>
            <tr>
             <th>ID</th>
              <th>Nombre</th>
              <th>Salario</th>
            </tr>
          </thead>
          <tbody>
    `;

    results.forEach(empleados => {
      html += `
        <tr>
           <td>${empleados.id}</td>
          <td>${empleados.nombre}</td>
          <td>${empleados.salario}</td>
        </tr>
      `;

    });

    html += `
          </tbody>
        </table>
        <button onclick="window.location.href='/'">Volver</button>
      </body>
      </html>
    `;

    res.send(html);
  });
});

app.get('/empleados2', requireLogin, requireRole('RH'), (req, res) => {
  connection.query('SELECT * FROM zona_2', (err, results) => {
    if (err) {
      return res.send('Error al obtener los empleados de la zona.');
    }

    let html = `
      <html>
      <head>
        <link rel="stylesheet" href="/styles.css">
        <title>Empleados del la Zona de Empaquetado y Embalaje </title>
      </head>
      <body>
        <h1>Empleados Activos de la Zona de Empaquetado y Embalaje</h1>
        <table>
          <thead>
            <tr>
             <th>ID</th>
              <th>Nombre</th>
              <th>Salario</th>
            </tr>
          </thead>
          <tbody>
    `;

    results.forEach(empleados => {
      html += `
        <tr>
           <td>${empleados.id}</td>
          <td>${empleados.nombre}</td>
          <td>${empleados.salario}</td>
        </tr>
      `;

    });

    html += `
          </tbody>
        </table>
        <button onclick="window.location.href='/'">Volver</button>
      </body>
      </html>
    `;

    res.send(html);
  });
});

app.get('/empleados3', requireLogin, requireRole('RH'), (req, res) => {
  connection.query('SELECT * FROM zona_3', (err, results) => {
    if (err) {
      return res.send('Error al obtener los empleados de la zona.');
    }

    let html = `
      <html>
      <head>
        <link rel="stylesheet" href="/styles.css">
        <title>Alamcen y Distribucion </title>
      </head>
      <body>
        <h1>Empleados Activos de la Zona de Almacen y Disctribucion</h1>
        <table>
          <thead>
            <tr>
             <th>ID</th>
              <th>Nombre</th>
              <th>Salario</th>
            </tr>
          </thead>
          <tbody>
    `;

    results.forEach(empleados => {
      html += `
        <tr>
           <td>${empleados.id}</td>
          <td>${empleados.nombre}</td>
          <td>${empleados.salario}</td>
        </tr>
      `;

    });

    html += `
          </tbody>
        </table>
        <button onclick="window.location.href='/'">Volver</button>
      </body>
      </html>
    `;

    res.send(html);
  });
});

















//Opciones del Rol Finanzas
//Salarios Mayores al Promedio
app.get('/salarios-mayor', requireLogin, requireRole('Finanzas'), (req, res) => {
  const query = 'SELECT empleados.nombre, empleados.edad, empleados.salario FROM empleados WHERE salario > (SELECT AVG(salario) FROM empleados)';

  connection.query(query, (err, results) => {
    if (err) {
      return res.send('Error al obtener los salarios de los empelados.');
    }

    let html = `
      <html>
      <head>
        <link rel="stylesheet" href="/styles.css">
        <title>Promedio > Salarios</title>
      </head>
      <body>
        <h1>Salarios Mayores al Promedio</h1>
        <table>
          <thead>
            <tr>
             <th>Nombre</th>
             <th>Edad</th>
             <th>Salario</th>   

            </tr>
          </thead>
          <tbody>
    `;

    results.forEach(empleados => {
      html += `
        <tr>
          <tr>
          <td>${empleados.nombre}</td>
         <td>${empleados.edad}</td>
          <td>${empleados.salario}</td>

        </tr>
        </tr>
      `;
    });

    html += `
          </tbody>
        </table>
        <button onclick="window.location.href='/'">Volver</button>
      </body>
      </html>
    `;

    res.send(html);
  });
});


//Empleados ordenados por Salario
app.get('/salarios-des', requireLogin, requireRole('Finanzas'), (req, res) => {
  const query = 'SELECT * FROM empleados ORDER BY salario DESC';

  connection.query(query, (err, results) => {
    if (err) {
      return res.send('Error al obtener los datos.');
    }

    let html = `
      <html>
      <head>
        <link rel="stylesheet" href="/styles.css">
        <title>Empelados Ordenados</title>
      </head>
      <body>
        <h1>Empleados Ordenados por Salario</h1>
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Edad</th>
              <th>Salario</th>
            </tr>
          </thead>
          <tbody>
    `;

    results.forEach(empleados => {
      html += `
        <tr>
          <td>${empleados.nombre}</td>
          <td>${empleados.edad}</td>
          <td>${empleados.salario}</td>
        </tr>
      `;
    });

    html += `
          </tbody>
        </table>
        <button onclick="window.location.href='/'">Volver</button>
      </body>
      </html>
    `;

    res.send(html);
  });
});


//Salarios Menor al Promedio
app.get('/salarios-menor', requireLogin, requireRole('Finanzas'), (req, res) => {
  const query = 'SELECT empleados.nombre, empleados.edad, empleados.salario FROM empleados WHERE salario < (SELECT AVG(salario) FROM empleados)';

  connection.query(query, (err, results) => {
    if (err) {
      return res.send('Error al obtener los salarios de los empelados.');
    }

    let html = `
      <html>
      <head>
        <link rel="stylesheet" href="/styles.css">
        <title>Promedio > Salarios</title>
      </head>
      <body>
        <h1>Salarios Mayores al Promedio</h1>
        <table>
          <thead>
            <tr>
             <th>Nombre</th>
             <th>Edad</th>
             <th>Salario</th>   

            </tr>
          </thead>
          <tbody>
    `;

    results.forEach(empleados => {
      html += `
        <tr>
          <tr>
          <td>${empleados.nombre}</td>
         <td>${empleados.edad}</td>
          <td>${empleados.salario}</td>

        </tr>
        </tr>
      `;
    });

    html += `
          </tbody>
        </table>
        <button onclick="window.location.href='/'">Volver</button>
      </body>
      </html>
    `;

    res.send(html);
  });
});
















//Opciones del Gerente

// Ruta para mostrar los datos de la base de datos en formato HTML
app.get('/ver-usuarios', requireLogin, requireRole('Gerente'), (req, res) => {
  connection.query('SELECT * FROM usuarios', (err, results) => {
    if (err) {
      return res.send('Error al obtener los datos.');
    }

    let html = `
      <html>
      <head>
        <link rel="stylesheet" href="/styles.css">
        <title>Usuarios</title>
      </head>
      <body>
        <h1>Usuarios Registrados</h1>
        <table>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Password Hash</th>
              <th>Tipo de Usuario (bpm)</th>
            </tr>
          </thead>
          <tbody>
    `;

    results.forEach(usuarios => {
      html += `
        <tr>
          <td>${usuarios.nombre_usuario}</td>
          <td>${usuarios.password_hash}</td>
          <td>${usuarios.tipo_usuario}</td>
        </tr>
      `;
    });

    html += `
          </tbody>
        </table>
        <button onclick="window.location.href='/'">Volver</button>
      </body>
      </html>
    `;

    res.send(html);
  });
});



app.get('/buscar',  requireLogin, requireRole('Gerente'),(req, res) => {
  const query = req.query.query;
  const sql = `SELECT nombre_usuario, tipo_usuario FROM usuarios WHERE nombre_usuario LIKE ?`;
  connection.query(sql, [`%${query}%`], (err, results) => {
    if (err) throw err;
    res.json(results);
  });


});

app.get('/buscar',  requireLogin, requireRole('Gerente'),(req, res) => {
  const query = req.query.query;
  const sql = `SELECT nombre_usuario, tipo_usuario FROM usuarios WHERE nombre_usuario LIKE ?`;
  connection.query(sql, [`%${query}%`], (err, results) => {
    if (err) throw err;
    res.json(results);
  });


});




app.post('/upload', requireLogin, requireRole('Gerente'), upload.single('excelFile'), (req, res) => {
  const filePath = req.file.path;
  const workbook = xlsx.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

  data.forEach(row => {
    const { nombre_area, rendimiento } = row;
    const sql = `INSERT INTO areas (nombre_area, rendimiento) VALUES (?, ?)`;
    connection.query(sql, [nombre_area, rendimiento], err => {
      if (err) throw err;
    });
  });

  res.send('<h1>Archivo cargado y datos guardados</h1><a href="/areas.html">Volver</a>');
});

app.get('/download',  requireLogin, requireRole('Gerente'),(req, res) => {
  const sql = `SELECT * FROM areas`;
  connection.query(sql, (err, results) => {
    if (err) throw err;

    const worksheet = xlsx.utils.json_to_sheet(results);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Rendimiento de Areas');

    const filePath = path.join(__dirname, 'uploads', 'rend_areas.xlsx');
    xlsx.writeFile(workbook, filePath);
    res.download(filePath, 'ren_areas.xlsx');
  });
});



app.get('/downloadpdf', requireLogin, requireRole('Gerente'), (req, res) => {
  const sql = `SELECT * FROM areas`;
  connection.query(sql, (err, results) => {
    if (err) {
      console.error("Error al consultar la base de datos:", err);
      return res.status(500).send('Error al obtener los datos.');
    }


    const doc = new PDFDocument({ autoFirstPage: false }); 
    const filePath = path.join(__dirname, 'uploads', 'rend_areas.pdf');

    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    doc.addPage();

    doc.fontSize(16).text('Rendimiento de Áreas', { align: 'center' }).moveDown();
 
    doc.fontSize(12).text('Rendimiento de las Áreas en el 2024', { align: 'center' }).moveDown(2);

    doc.fontSize(10).text('Rendimiento 2024', { align: 'left' }).moveDown();

 
    results.forEach((area, index) => {

      doc.text(`${area.id}, ${area.nombre_area} ,${area.rendimiento}`, { align: 'left' }).moveDown();
    });
    doc.end();

    stream.on('finish', () => {
      res.download(filePath, 'rend_areas.pdf', (err) => {
        if (err) {
          console.error('Error al descargar el archivo:', err);
          res.status(500).send('Error al descargar el archivo.');
        } else {
    
          fs.unlinkSync(filePath);
        }
      });
    });
  });
});




app.post('/drop_colum', requireLogin, requireRole('Gerente'),  (req, res) => {
  const {name} = req.body;

  const query = `ALTER TABLE aparatos_medicos DROP COLUMN ${name}`;
  connection.query(query, (err, result) => {
    if (err) {
      return res.send('Error al borrar columna.');
    }
    res.send(`Columna ${name} borrada de la tabla.`);
  });
});




app.get('/aparatos_med', requireLogin, requireRole('Gerente'), (req, res) => {
  connection.query('SELECT * FROM aparatos_medicos', (err, results) => {
    if (err) {
      return res.send('Error al obtener los aparatos medicos.');
    }

    let html = `
      <html>
      <head>
        <link rel="stylesheet" href="/styles.css">
        <title>Aparatos Medicos Registrados </title>
      </head>
      <body>
        <h1>Aparatos Medicos Patentados</h1>
        <table>
          <thead>
            <tr>
             <th>ID</th>
              <th>Nombre</th>
              <th>Descripción</th>
               <th>Fecha en la que se Patento</th>
            </tr>
          </thead>
          <tbody>
    `;

    results.forEach(aparatos_medicos => {
      html += `
        <tr>
           <td>${aparatos_medicos.id}</td>
          <td>${aparatos_medicos.nombre}</td>
          <td>${aparatos_medicos.descripción}</td>
               <td>${aparatos_medicos.fecha_creación}</td>
        </tr>
      `;

    });

    html += `
          </tbody>
        </table>
        <button onclick="window.location.href='/'">Volver</button>
      </body>
      </html>
    `;

    res.send(html);
  });
});



app.post('/agregar_aparatos', requireLogin, requireRole('Gerente'), (req, res) => {
  const { name, description } = req.body;
  const query = 'INSERT INTO aparatos_medicos (nombre, descripción) VALUES (?, ?)';

  connection.query(query,[name, description], (err, result) => {
    if (err) {
      return res.send('Error al añadir aparato medico.');
    }
    res.send(`Aparato ${name} guardado en la base de datos.`);
  });
});






















app.get('/ver-mis-datos', (req, res) => {
  if (!req.session.user) {
      return res.status(401).send('Usuario no autenticado');
  }

  const { nombre_usuario, tipo_usuario } = req.session.user;

  let html = `
  <html>
  <head>
      <link rel="stylesheet" href="/styles.css">
      <title>Mis Datos</title>
      
  </head>
  <body>
      <h1>Mis Datos</h1>
      <table>
          <tr>
              <th>Usuario</th>
              <th>Tipo de Usuario</th>
          </tr>
          <tr>
              <td>Nombre de Usuario</td>
              <td>${nombre_usuario}</td>
          </tr>
          <tr>
              <td>Tipo de Usuario</td>
              <td>${tipo_usuario}</td>
          </tr>
      </table>
      <button onclick="window.location.href='/'">Volver</button>
  </body>
  </html>
  `;

  res.send(html);
});





















// Cerrar sesión
app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/registro.html');
});

// Ruta para la página principal
app.get('/', requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public','index.html'));
});




app.listen(PORT, () => console.log(`Servidor en funcionamiento en el puerto ${PORT}`));
