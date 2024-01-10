const express = require('express');
const cors = require('cors');
const mqtt = require('mqtt');
const http = require('http');
const WebSocket = require('ws');
const mysql = require('mysql2');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');

const app = express();
app.use(express.json());
app.use(bodyParser.json());
app.use(cors({
  credentials: true,
  origin: ['http://localhost:5000', 'http://localhost:5173']
}));

const db = mysql.createPool({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'iot',
    connectionLimit: 10,
});

const mqttClient = mqtt.connect({
    host: "52.77.228.77",
    port: "1883",
    clean: true
});

const messagesArray = [];
var parsedMessages = "";
var parsedMessage = "";

mqttClient.on('connect', () => {
    console.log('MQTT connected');
  
    mqttClient.subscribe('#'); // Replace 'your_topic' with the topic you want to subscribe to
  
  
});

mqttClient.on('message', (topic, message) => {
  
    const receivedMessage = message.toString();
    const receivedMessage_Json = JSON.parse(receivedMessage);
    const existingMessageIndex = messagesArray.findIndex(msg => msg.topic === topic);
    if (existingMessageIndex !== -1) {
        messagesArray[existingMessageIndex] = {
          topic: topic,
          message: receivedMessage,
          timestamp: new Date().toLocaleTimeString('en-US', {hour12: false}),
        };
      } else {
      messagesArray.push({
          topic: topic,
          message: receivedMessage,
          timestamp: new Date().toLocaleTimeString('en-US', {hour12: false}),
        });
      }
    
    parsedMessages = messagesArray.map(item => {
     parsedMessage = JSON.parse(item.message);
    
        return {
          name: parsedMessage.name,
          value: parsedMessage.value,
          timestamp: item.timestamp,
          lat: parsedMessage.lat,
          lon: parsedMessage.lon,
          batt: parsedMessage.batt
        };
      });
    // console.log(parsedMessages)
  });


const server = http.createServer(app);

// Create a WebSocket server
const wss = new WebSocket.Server({ server });

setInterval(sendMessagesToWebSocketClients, 1000);

wss.on('connection', (ws) => {
    console.log('WebSocket connected');
});

function sendMessagesToWebSocketClients() {
    const messageString = JSON.stringify(parsedMessages);
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(messageString);
      }
    });
}

const PORT = 5000;
server.listen(PORT, async () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

//login api//

const secretKey = '12345';
// Endpoint for user authentication
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  

  const selectUserQuery = `
  SELECT id, username, password
  FROM users
  WHERE username = ? AND password = ?;
  `;

  

  db.query(selectUserQuery, [username, password], (error, results, fields) => {
    if (error) {
      console.error('Error checking user credentials:', error);
      res.status(500).json({ success: false, loginMessage: 'Internal Server Error' });
      return;
    }

    const user = results[0];

    if (user) {
      const expiresIn = 600;
      const token = jwt.sign({ userId: user.id, username: user.username }, secretKey, { expiresIn });
      res.json({ success: true, token, username: user.username });
    } else {
      res.status(401).json({ success: false, loginMessage: 'Invalid credentials' });
    }
  });
});

const verifyToken = (req, res, next) => {
  const token = req.header('Authorization');

  if (!token) return res.status(401).json({ success: false, loginMessage: 'Access denied' });

  try {
    const decoded = jwt.verify(token, secretKey);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(400).json({ success: false, loginMessage: 'Invalid token' });
  }
};

app.get('/api/home', verifyToken, (req, res) => {
  res.json({ success: true, loginMessage: 'Welcome to the home page' });
});