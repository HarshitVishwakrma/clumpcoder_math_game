const express = require('express');
const mongoose = require('mongoose');
require('dotenv').config();
const authRoutes = require('./routes/auth')
const questionRoutes = require('./routes/question')

const app = express();


app.use(express.json());


app.use('/api/auth', authRoutes);
app.use('/api/question', questionRoutes)




mongoose.connect(process.env.MONGO_URI)
.then(()=>{
    app.listen(3000, ()=>{
        console.log('server is running at port 3000');
    })
})

