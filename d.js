const mqtt = require('mqtt');
const express = require('express');

// MQTT broker connection options
const brokerUrl = 'mqtt://52.77.228.77:1883';
const options = {
  clientId: 'your-client-id',
  clean: true,
};

// Create an MQTT client
const client = mqtt.connect(brokerUrl, options);

// Topics to subscribe to
const topics = ['test/#'];

// Create an Express application
const app = express();
const port = 3000;

// Add a route
app.get('/mqtt-message', (req, res) => {

  res.send('hi')

});

// Callback when the client is connected
client.on('connect', () => {
  console.log('Connected to MQTT broker');

  // Subscribe to multiple topics
  topics.forEach((topic) => {
    client.subscribe(topic, (err) => {
      if (err) {
        console.error(`Error subscribing to ${topic}: ${err}`);
      } else {
        console.log(`Subscribed to ${topic}`);
      }
    });
  });
});

// Callback when a message is received
client.on('message', (topic, message) => {
  console.log(`Received message on topic ${topic}: ${message.toString()}`);
});

// Handle errors
client.on('error', (err) => {
  console.error(`MQTT error: ${err}`);
});

// Handle client disconnection
client.on('close', () => {
  console.log('Disconnected from MQTT broker');
});

// Handle client errors
client.on('offline', () => {
  console.log('MQTT client is offline');
});

// Start the Express server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
