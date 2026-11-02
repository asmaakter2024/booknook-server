import express from "express";
import { MongoClient } from "mongodb";
import "dotenv/config";
import cors from "cors";
const app = express();
const PORT = 8000;

app.use(cors());
app.use(express.json());

const client = new MongoClient(process.env.MONGODB_URI);

export async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("You successfully connected to MongoDB!");
    return client;
  } catch (err) {
    console.dir(err);
  }
}

const mongoClient = await connectToMongoDB();
const db = mongoClient.db("booknook");
const bookscollection = db.collection("books");

//http:localhost:8000/add-book
app.post("/add-book", async (req, res) => {
  const data = req.body;

  const result = await bookscollection.insertOne(data);
  console.log(result);

  res.send(result);

  //console.log(data);
  //console.log("Api called");
  res.send({ message: "Api working..." });
});

//api create
//database or backend theke kono jinis get kora
app.get("/books", async (req, res) => {
  const result = await bookscollection.find().toArray();
  console.log("books data get");
  res.send(result);
});

//http://localhost:8000

app.get("/", (req, res) => {
  res.send({ message: "Server is running fine!" });
});

app.listen(PORT, () => {
  console.log(`Server is running at ${PORT}`);
});
