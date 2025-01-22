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
      "https://pay-per-tasks.firebaseapp.com",
      "https://pay-per-tasks.web.app",
    ],
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());
const stripe = require("stripe")(process.env.PAYMENT_SECRETE_KEY);

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
    const taskCollection = db.collection("tasks");
    const paymentCollection = db.collection("payments");
    const submissionCollection = db.collection("submission");
    const withdrawCollection = db.collection("withdraw");

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

    // verifyBuyer
    const verifyBuyer = async (req, res, next) => {
      const email = req?.user?.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      if (!user || user?.role !== "buyer") {
        return res
          .status(403)
          .send({ message: "Forbidden Access! Only buyer permitted." });
      }

      next();
    };

    // post tasks api
    app.post("/tasks", verifyToken, verifyBuyer, async (req, res) => {
      const task = req.body;
      const email = req?.user?.email;
      const totalAmount = task.workers * task.amount;
      const result = await taskCollection.insertOne(task);
      await userCollection.updateOne(
        { email },
        { $inc: { coin: -totalAmount } }
      );
      res.send(result);
    });

    // delete task api
    app.delete("/task/:id", verifyToken, async (req, res) => {
      const { id } = req.params;
      const query = { _id: new ObjectId(id) };
      
      const submission = await submissionCollection.find({taskId: id, status: 'pending'}).toArray();

      if(submission.length) {
        const increaseWorker = await taskCollection.updateOne(query, {$inc: {workers: submission?.length}});
        const deleteAllPendingSubmission = await submissionCollection.deleteMany({taskId: id, status: 'pending'});
      }

      const task = await taskCollection.findOne(query);
      const buyer_email = task?.buyer?.email;



      const remainCoin = task?.workers * task?.amount;
      const result = await userCollection.updateOne(
        { email: buyer_email },
        { $inc: { coin: remainCoin } }
      );
      
      const deleteData = await taskCollection.deleteOne(query);
      res.send({...deleteData, ...result});
    });

    // task for a buyer
    app.get("/tasks/:email", verifyToken, verifyBuyer, async (req, res) => {
      const { email } = req.params;
      const query = { "buyer.email": email };
      const sort = { date: -1 };
      const result = await taskCollection.find(query).sort(sort).toArray();
      res.send(result);
    });

    app.get(
      "/states/buyer/:email",
      verifyToken,
      verifyBuyer,
      async (req, res) => {
        const { email } = req.params;
        const query = { "buyer.email": email };
        const tasks = await taskCollection.countDocuments(query);
        const pending = await submissionCollection.countDocuments({
          buyer_email: email,
          status: "pending",
        });
        const allTasks = await taskCollection.find().toArray();
        const workers = allTasks.reduce((prev, next) => {
          return prev + next.workers;
        }, 0);

        const submissions = await submissionCollection.find({buyer_email: email, status: 'approve'}).toArray();
        const payments = submissions.reduce((prev, next) => {
          return prev + next.amount;
        },0)

        res.send({ tasks, pending, workers, payments });
      }
    );

    // pending tasks for buyer
    app.get(
      "/pending-tasks/:email",
      verifyToken,
      verifyBuyer,
      async (req, res) => {
        const { email } = req.params;
        const query = { buyer_email: email, status: "pending" };
        const result = await submissionCollection.find(query).toArray();

        res.send(result);
      }
    );

    // get all tasks
    app.get("/tasks", verifyToken, verifyAdmin, async (req, res) => {
      const result = await taskCollection.find().toArray();
      res.send(result);
    });

    app.get("/available-tasks", async (req, res) => {
      const query = { workers: { $gt: 0 } };
      const {limit} = req.query;
      const result = await taskCollection.find(query).limit(parseInt(limit)).toArray();
      res.send(result);
    });

    // get custom task
    app.get("/task/:id", verifyToken, async (req, res) => {
      const { id } = req.params;

      const query = { _id: new ObjectId(id) };
      const result = await taskCollection.findOne(query);
      res.send(result);
    });

    // update task
    app.put("/task/:id", verifyToken, verifyBuyer, async (req, res) => {
      const { id } = req.params;
      const query = { _id: new ObjectId(id) };
      const { _id, ...data } = req.body;
      const updateDoc = {
        $set: data,
      };

      const result = await taskCollection.updateOne(query, updateDoc);
      res.send(result);
    });

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
      const workers = await userCollection.countDocuments({ role: "worker" });
      const buyers = await userCollection.countDocuments({ role: "buyer" });
      const users = await userCollection.find().toArray();
      const coins = users.reduce((prev, update) => {
        return prev + update.coin;
      }, 0);
      const withdraws = await withdrawCollection
        .find({ status: "approved" })
        .toArray();
      const payments = withdraws.reduce((prev, next) => {
        return prev + next?.withdrawal_amount;
      }, 0);
      res.send({ workers, buyers, coins, payments });
    });

    // save user data to database
    app.post("/user/:email", async (req, res) => {
      const user = req.body;
      const email = req.params.email;

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

    // create payment intent
    app.post("/payment", verifyToken, async (req, res) => {
      const { price } = req.body;
      const totalPrice = price * 100;

      const { client_secret } = await stripe.paymentIntents.create({
        amount: totalPrice,
        currency: "usd",
        automatic_payment_methods: {
          enabled: true,
        },
      });

      res.send({ clientSecret: client_secret });
    });

    // add payment to database
    app.post("/payments/:email", verifyToken, verifyBuyer, async (req, res) => {
      const data = req.body;
      const { email } = req.params;
      const result = await paymentCollection.insertOne(data);
      const addCoin = await userCollection.updateOne(
        { email },
        { $inc: { coin: data.coin } }
      );
      res.send({ result, addCoin });
    });

    // get payment data
    app.get("/payments/:email", verifyToken, verifyBuyer, async (req, res) => {
      const { email } = req.params;
      const query = { email: email };
      const result = await paymentCollection.find(query).toArray();
      res.send(result);
    });

    // submission post
    app.post("/submit", verifyToken, async (req, res) => {
      const data = req.body;
      const taskId = data.taskId;
      const worker_email = data.worker_email;
      const isExist = await submissionCollection.findOne({
        taskId,
        worker_email,
      });
      if (isExist) {
        return res.send({ inserted: true });
      }
      const result = await submissionCollection.insertOne({
        ...data,
        status: "pending",
      });
      const reduceWorker = await taskCollection.updateOne(
        {
          _id: new ObjectId(data?.taskId),
        },
        { $inc: { workers: -1 } }
      );
      res.send(result);
    });

    // accept task
    app.patch("/submit/:id", verifyToken, verifyBuyer, async (req, res) => {
      const { id } = req.params;
      const { amount, worker_email } = req.body;
      const result = await userCollection.updateOne(
        { email: worker_email },
        { $inc: { coin: amount } }
      );
      const approve = await submissionCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { status: "approve" } }
      );
      res.send(result);
    });

    // reject task
    app.patch(
      "/submit/reject/:id",
      verifyToken,
      verifyBuyer,
      async (req, res) => {
        const { id } = req.params;
        const { taskId } = req.body;
        const result = await submissionCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status: "rejected" } }
        );

        if (!result.modifiedCount) {
          return res.send({ modified: false });
        }

        const increaseWorker = await taskCollection.updateOne(
          { _id: new ObjectId(taskId) },
          { $inc: { workers: 1 } }
        );

        res.send(result);
      }
    );

    // get custom submission
    app.get("/submission/:id", async (req, res) => {
      const { id } = req.params;
      const query = { _id: new ObjectId(id) };
      const result = await submissionCollection.findOne(query);
      res.send(result);
    });

    // get worker states
    app.get("/states/worker/:email", verifyToken, async (req, res) => {
      const { email } = req.params;
      const totalSubmissions = await submissionCollection.countDocuments({
        worker_email: email,
      });
      const pendingSubmissions = await submissionCollection.countDocuments({
        worker_email: email,
        status: "pending",
      });
      const approvedTasks = await submissionCollection
        .find({
          worker_email: email,
          status: "approve",
        })
        .toArray();

      const totalEarning = approvedTasks.reduce((pre, next) => {
        return pre + next.amount;
      }, 0);

      res.send({ totalSubmissions, pendingSubmissions, totalEarning });
    });

    // approvedSubmission
    app.get("/approved-submissions/:email", verifyToken, async (req, res) => {
      const { email } = req.params;
      const query = {
        worker_email: email,
        status: "approve",
      };

      const result = await submissionCollection.find(query).toArray();
      res.send(result);
    });

    app.get("/submissions/:email", verifyToken, async (req, res) => {
      const { email } = req.params;
      const query = { worker_email: email };
      const result = await submissionCollection.find(query).toArray();

      res.send(result);
    });

    app.post("/withdraws", verifyToken, async (req, res) => {
      const body = req.body;
      const result = await withdrawCollection.insertOne({
        ...body,
        status: "pending",
      });
      res.send(result);
    });

    // get all withdraw request
    app.get("/withdraws", verifyToken, verifyAdmin, async (req, res) => {
      const result = await withdrawCollection
        .find({ status: "pending" })
        .toArray();
      res.send(result);
    });

    // accept withdraw request
    app.patch("/withdraw/:id", verifyToken, verifyAdmin, async (req, res) => {
      const { id } = req.params;
      const query = { _id: new ObjectId(id) };
      const withdrawData = await withdrawCollection.findOne({
        ...query,
        status: "approved",
      });
      const { worker_email, withdrawal_coin } = req.body;

      if (withdrawData) {
        return res.send({ modified: false });
      }
      const result = await withdrawCollection.updateOne(query, {
        $set: { status: "approved" },
      });

      if (result) {
        const user = await userCollection.updateOne(
          { email: worker_email },
          { $inc: { coin: -withdrawal_coin } }
        );
      }

      res.send(result);
    });

    // best 6 workers
    app.get('/best-workers', async(req, res) => {
      const result = await userCollection.find({role: 'worker'}).sort({coin: -1}).limit(6).toArray();
      res.send(result);
    })

    // home states
    app.get('/states/home', async(req,res) => {
      const workers = await userCollection.countDocuments({role: 'worker'});
      const buyers = await userCollection.countDocuments({role: 'buyer'});
      const tasks = await taskCollection.countDocuments();
      const completedTasks = await taskCollection.countDocuments({workers: 0});

      res.send({workers, buyers, tasks, completedTasks});
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

app.get("/", (req, res) => {
  res.send("Server is runnig");
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
