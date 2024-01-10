const express = require('express');
const cors = require('cors');
const mqtt = require('mqtt');
const http = require('http');
const WebSocket = require('ws');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');


const app = express();
app.use(express.json());
app.use(bodyParser.json());
app.use(cors({
  credentials: true,
  origin: '*'
}));

// MQTT configuration
const mqttClient = mqtt.connect({
  host: "52.77.228.77",
  port: "1883",
  clean: true
});

const db = mysql.createPool({
  host: 'iot.crmho1jv9hrk.ap-southeast-1.rds.amazonaws.com',
  port: '3306',
  user: 'admin',
  password: 'kG0882521310',
  database: 'iot',
  connectionLimit: 10, // Adjust according to your needs
});


// Array to store received messages
const messagesArray = [];
var parsedMessages = "";
var parsedMessage = "";



mqttClient.on('connect', () => {
  console.log('MQTT connected');

  mqttClient.subscribe('test/#');


});

mqttClient.on('message', (topic, message) => {

  const receivedMessage = message.toString();
  const va = JSON.parse(receivedMessage);


  if (!topic) {
    console.log('Topic is missing. Clearing messagesArray.');
    messagesArray.length = 0; // Clear the array
    sendMessagesToWebSocketClients();
    return;
  }

  const tableName = topic.replace(/\//g, '_'); // Replace '/' with '_' for table name
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS ${tableName} (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name TEXT,
      value TEXT,
      timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;

  db.query(createTableQuery, (error, results, fields) => {
    if (error) throw error;
    // console.log(`Table ${tableName} created or already exists`);

    // Save message to the corresponding table

  });

  const getDevices = `SELECT DeviceName FROM devices WHERE DeviceName =?`
  db.query(getDevices, [topic.split('/')[1]], (error, results) => {
    if (results[0]) {

      const insertMessageQuery = `
      INSERT INTO ${tableName} (name, value) VALUES (?, ?)
      `;

      db.query(insertMessageQuery, [va.name, va.value.toString()], (error, results, fields) => {
        if (error) throw error;

      });
    }
  })




  const existingMessageIndex = messagesArray.findIndex(msg => msg.topic === topic);




  if (existingMessageIndex !== -1) {
    messagesArray[existingMessageIndex] = {
      topic: topic,
      message: receivedMessage,
      timestamp: new Date().toLocaleTimeString('en-US', {timeZone: "asia/bangkok"}, {
        hour12: false
      }),
    };
  } else {
    messagesArray.push({
      topic: topic,
      message: receivedMessage,
      timestamp: new Date().toLocaleTimeString('en-US', {timeZone: "asia/bangkok"}, {
        hour12: false
      }),
    });
  }

  parsedMessages = messagesArray.map(item => {
    parsedMessage = JSON.parse(item.message);

    return {
      name: parsedMessage.name,
      value: parsedMessage.value,
      timestamp: item.timestamp,
      batt: parsedMessage.batt
    };
  });


});


// Create an HTTP server
const server = http.createServer(app);

// Create a WebSocket server
const wss = new WebSocket.Server({
  server
});

setInterval(sendMessagesToWebSocketClients, 1000);

// WebSocket connection handling
wss.on('connection', (ws) => {
  console.log('WebSocket connected');
});
// Function to send messages to all connected WebSocket clients
function sendMessagesToWebSocketClients() {
  const messageString = JSON.stringify(parsedMessages);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(messageString);
    }
  });
}


// Your existing code
const PORT = 5000;
server.listen(PORT, async () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

// Endpoint to get the messages array
app.get('/messages', (req, res) => {
  res.json(parsedMessages);
});


// Endpoint to get data from a specific table within the last 10 minutes
app.get('/data/:tableName', (req, res) => {
  const {
    tableName
  } = req.params;


  // Calculate the timestamp for 10 minutes ago
  const tenMinutesAgo = new Date();
  tenMinutesAgo.setMinutes(tenMinutesAgo.getMinutes() - 5);

  const selectDataQuery = `
    SELECT * FROM ${tableName}
    WHERE timestamp >= ${JSON.stringify(tenMinutesAgo)};
  `;

  db.query(selectDataQuery, (error, results, fields) => {
    if (error) {
      console.error(`Error fetching data from table ${tableName}:`, error);
      res.status(500).json({
        error: 'Internal Server Error'
      });
      return;
    }
    const formattedData = results.map(result => ({
      // id: result.id,
      // name: result.name,
      value: result.value,
      timestamp: result.timestamp,
    }));

    res.json(formattedData);
  });
});


//login api//

const secretKey = '12345';
// Endpoint for user authentication
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;

  const selectUserQuery = `
    SELECT id, username, password
    FROM users
    WHERE username = ?;
  `;

  db.query(selectUserQuery, [username], (error, results, fields) => {
    if (error) {
      console.error('Error checking user credentials:', error);
      res.status(500).json({
        success: false,
        loginMessage: 'Internal Server Error',
      });
      return;
    }

    const user = results[0];

    if (user) {
      bcrypt.compare(password, user.password, (compareError, passwordMatch) => {
        if (compareError) {
          console.error('Error comparing passwords:', compareError);
          res.status(500).json({
            success: false,
            loginMessage: 'Internal Server Error',
          });
          return;
        }

        if (passwordMatch) {
          const expiresIn = 3600;
          const token = jwt.sign(
            {
              userId: user.id,
              username: user.username,
            },
            secretKey,
            { expiresIn }
          );
          res.json({
            success: true,
            token,
            username: user.username,
          });
        } else {
          res.status(401).json({
            success: false,
            loginMessage: 'Invalid credentials',
          });
        }
      });
    } else {
      res.status(401).json({
        success: false,
        loginMessage: 'Invalid credentials',
      });
    }
  });
});

const verifyToken = (req, res, next) => {
  const token = req.header('Authorization');

  if (!token) return res.status(401).json({
    success: false,
    loginMessage: 'Access denied'
  });

  try {
    const decoded = jwt.verify(token, secretKey);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(400).json({
      success: false,
      loginMessage: 'Invalid token'
    });
  }
};

app.post('/api/register', (req, res) => {
  const { username, password } = req.body;

  // Hash the password before storing it
  bcrypt.hash(password, 10, (hashError, hashedPassword) => {
    if (hashError) {
      console.error('Error hashing password:', hashError);
      res.status(500).json({
        success: false,
        registerMessage: 'Internal Server Error',
      });
      return;
    }

    const insertUserQuery = `
      INSERT INTO users (username, password)
      VALUES (?, ?);
    `;

    db.query(insertUserQuery, [username, hashedPassword], (error, results, fields) => {
      if (error) {
        console.error('Error registering user:', error);
        res.status(500).json({
          success: false,
          registerMessage: 'Internal Server Error',
        });
        return;
      }

      res.json({
        success: true,
        registerMessage: 'User registered successfully',
      });
    });
  });
});


app.get('/api/home', verifyToken, (req, res) => {
  res.json({
    success: true,
    loginMessage: 'Welcome to the home page'
  });
});

app.get('/api/Devices/:userName', (req, res) => {
  const {
    userName
  } = req.params;
  const selectDataQuery = `
  SELECT * FROM devices
  WHERE user = ?;
  `;
  db.query(selectDataQuery, [userName], (error, results, fields) => {
    if (error) {
      console.error(`Error fetching data from table ${tableName}:`, error);
      res.status(500).json({
        error: 'Internal Server Error'
      });
      return;
    }

    const formattedData = results.map(result => ({
      id: result.id,
      name: result.DeviceName,
      serial: result.DeviceSerial,
      lat: result.lat,
      lon: result.lon
      // user: result.user,
    }));

    res.json(formattedData);
  });

});

app.post('/api/newDevice', (req, res) => {
  const {
    newDeviceName,
    newDeviceSerial,
    lat,
    lon,
    username
  } = req.body;

  // Check if the deviceName and user already exist
  const checkExistingQuery = 'SELECT * FROM devices WHERE deviceName = ? AND user = ?';
  db.query(checkExistingQuery, [newDeviceName, username], (checkError, checkResults) => {
    if (checkError) {
      console.log(checkError);
      res.status(500).json({
        success: false,
        addDeviceMessage: 'Internal Server Error'
      });
      return;
    }

    if (checkResults.length > 0) {
      // Device with the same name and user already exists
      res.status(400).json({
        success: false,
        addDeviceMessage: 'Device with the same name and user already exists'
      });
      return;
    }

    // If not exists, proceed with the insert
    const deviceInsert = 'INSERT INTO devices (deviceName, deviceSerial, lat, lon, user) VALUES (?, ?, ?, ?, ?)';
    db.query(deviceInsert, [newDeviceName, newDeviceSerial, lat, lon, username], (insertError, insertResults) => {
      if (insertError) {
        console.log(insertError);
        res.status(500).json({
          success: false,
          addDeviceMessage: 'Internal Server Error'
        });
        return;
      }

      res.json('Insert successfully');
    });
  });
});


app.delete('/api/deleteDevice/:id', (req, res) => {
  const id = req.params.id;
  const deviceDelete = 'DELETE FROM `devices` WHERE id =?';
  db.query(deviceDelete, [id], (error, results) => {
    if (error) {
      console.log(error)
      res.status(500).json({
        success: false,
        addDeviceMessage: 'Internal Server Error'
      });
      return;
    } else {
      res.json('Delete successfully');
    }
  });
})

app.put('/api/updateDevice/:id', (req, res) => {
  const id = req.params.id;
  const {
    newDeviceName,
    newDeviceSerial,
    lat,
    lon,
    username
  } = req.body;

  // Check if the deviceName and user already exist
  const checkExistenceQuery = 'SELECT * FROM devices WHERE `DeviceName` = ? AND `user` = ? AND `id` != ? ';
  db.query(checkExistenceQuery, [newDeviceName, username, id], (error, results) => {
    if (error) {
      console.log(error);
      res.status(500).json({
        success: false,
        addDeviceMessage: 'Internal Server Error'
      });
      return;
    }
    console.log(results)
    // If the deviceName and user combination already exists, return an error
    if (results.length > 0) {
      res.status(400).json({
        success: false,
        addDeviceMessage: 'Device with the same name and user already exists'
      });
      return;
    }

    // If not, proceed with the update
    const deviceUpdate = 'UPDATE devices SET `DeviceName` = ?, `DeviceSerial` = ?, `lat` = ?, `lon` = ? WHERE id = ?';
    db.query(deviceUpdate, [newDeviceName, newDeviceSerial, lat, lon, id], (updateError, updateResults) => {
      if (updateError) {
        console.log(updateError);
        res.status(500).json({
          success: false,
          addDeviceMessage: 'Internal Server Error'
        });
        return;
      }

      res.json('Update successfully');
    });
  });
});
