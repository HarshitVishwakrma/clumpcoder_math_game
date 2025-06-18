const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

// import routes and controllers
const authRoutes = require('./routes/auth');
const questionRoutes = require('./routes/question');
const matchRoutes = require('./routes/match');


const app = express();
const server = http.createServer(app);

// initialize Socket.IO
const { Server } = require('socket.io');
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET','POST'] }
});

// make io accessible in controllers via req.app.get('io')
app.set('io', io);

app.use(cors());
app.use(express.json());

// register routes
app.use('/api/auth', authRoutes);
app.use('/api/question', questionRoutes);
app.use('/api/match', matchRoutes);

// handle mongoose connection and server start
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    server.listen(3000, () => {
      console.log('Server is running on port 3000');
    });
  })
  .catch(err => console.error('Mongo connection error:', err));

// listen for room creation to bind socket logic
// this assumes matchRoutes.createChallenge attaches roomId to res.locals
io.on('connection', socket => {
  console.log('Global socket connected:', socket.id);
});
