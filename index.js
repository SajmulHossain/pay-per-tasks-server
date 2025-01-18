const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");

const port = process.env.port || 3000;
const app = express();
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      " http://192.168.0.182:5173",
      "https://pay-per-tasks.web.app",
    ],
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

const verifyToken = (req, res, next) => {
  const token = req.cookies?.token;

  if (!token) {
    return res.status(401).send({ message: "Unauthorized access" });
  }

  jwt.verify(token, process.env.SECRET_KEY, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: "Unauthorized access" });
    }

    req.user = decoded;
    next();
  });
};

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.saftd.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

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
    const db = client.db("PayPerTasksDB");
    const userCollection = db.collection("users");

    // create token
    app.post("/jwt", async (req, res) => {
      const email = req.body;
      const token = jwt.sign(email, process.env.SECRET_KEY, {
        expiresIn: "5h",
      });

      res
        .cookie("token", token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
        })
        .send({ success: true });
    });

    // clear token
    app.get("/logout", async (req, res) => {
      res
        .clearCookie("token", {
          maxAge: 0,
          secure: process.env.NODE_ENV === "production",
          sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
        })
        .send({ success: true });
    });

    // verify admin
    const verifyAdmin = async (req, res, next) => {
      const email = req?.user?.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      if (!user || user?.role !== "admin") {
        return res
          .status(403)
          .send({ message: "Forbidden Access! Only admin permitted." });
      }

      next();
    };

    // get role
    app.get("/user/role/:email", async (req, res) => {
      const { email } = req.params;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      res.send({ role: user?.role });
    });

    // get coin
    app.get("/coin/:email", verifyToken, async (req, res) => {
      const { email } = req.params;
      if (req?.user?.email !== email) {
        return res.status(403).send({ message: "Access denied" });
      }
      const query = { email: email };
      const user = await userCollection.findOne(query);
      res.send({ coin: user?.coin });
    });

    // get admin home states
    app.get("/states", verifyToken, verifyAdmin, async (req, res) => {
      const workers = await userCollection.find({ role: "worker" }).count();
      const buyers = await userCollection.find({ role: "buyer" }).count();
      const users = await userCollection.find().toArray();
      const coins = users.reduce((prev, update) => {
        return prev + update.coin;
      }, 0);
      res.send({ workers, buyers, coins });
    });

    // save user data to database
    app.post("/user/:email", async (req, res) => {
      const user = req.body;
      const email = req.params.email;
      console.log(user);

      const isExist = await userCollection.findOne({ email });

      if (isExist) {
        return res.send(isExist);
      }

      const result = await userCollection.insertOne(user);
      res.send(result);
    });

    // get all user data from database
    app.get("/users/:email", verifyToken, verifyAdmin, async (req, res) => {
      const { email } = req.params;
      const query = { email: { $ne: email } };
      const users = await userCollection.find(query).toArray();
      res.send(users);
    });

    // user delete api
    app.delete("/user/:id", verifyToken, verifyAdmin, async (req, res) => {
      const { id } = req.params;
      const query = { _id: new ObjectId(id) };
      const result = await userCollection.deleteOne(query);
      res.send(result);
    });

    // user role update api
    app.patch("/user/:email", async (req, res) => {
      const { email } = req.params;
      const { newRole } = req.body;
      const query = { email: email };
      const updateDoc = {
        $set: { role: newRole },
      };

      const result = await userCollection.updateOne(query, updateDoc);
      res.send(result);
    });

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

app.get("/", (req, res) => {
  res.send("Server is runnig");
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
