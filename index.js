const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion } = require("mongodb");
require('dotenv').config();

const port = process.env.port || 3000;
const app = express();
app.use(
  cors({
    origin: ["http://localhost:5173"],
    credentials: true
  })
);
app.use(express.json())



const uri =
  `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.saftd.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    const db= client.db('PayPerTasksDB');
    const userCollection = db.collection('users');


    // save user data to database
    app.post('/user/:email', async(req, res) => {
      const user = req.body;
      const email = req.params.email;

      const isExist = await userCollection.findOne({email});

      if(isExist) {
       return res.send(isExist);
      }

      const result = await userCollection.insertOne(user);
      res.send(result);
      
    })


    // get all user data from database
    app.get('/users', async(req, res) => {
      const users = await userCollection.find().toArray();
      res.send(users);
    })



    await client.connect();
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);




app.get('/', (req, res) => {
  res.send('Server is runnig');
})

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
})