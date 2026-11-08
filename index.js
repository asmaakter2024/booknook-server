import express from "express";
import { MongoClient, ObjectId } from "mongodb";
import "dotenv/config";
import cors from "cors";
import { createRemoteJWKSet, jwtVerify } from "jose";

const app = express();
const PORT = process.env.PORT || 8000;

app.use(cors());
app.use(express.json());



const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  console.log(authHeader);
  if (!authHeader) {
    return res.status(401).send({ msg: "Unauthorized!" });
  }
  const token = authHeader.split(" ")[1];
  if (!token) {
    return res.status(401).send({ msg: "Unauthorized!" });
  }

  const JWKS = createRemoteJWKSet(
    // new URL(`${process.env.CLIENT_URL}/api/auth/jwks`),
    new URL(`{${process.env.CLIENT_URL}/api/auth/jwks}`),
  );

  try {
    const { payload } = await jwtVerify(token, JWKS);
    console.log(payload);
    next();
  } catch (error) {
    return res.status(500).send({ msg: "Server Error!" });
  }
};

// [FIX 1]: MONGODB_URI চেক করা যাতে env ভ্যারিয়েবল মিসিং থাকলে শুরুতেই স্পষ্ট এরর দেয়
const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error(
    "Error: MONGODB_URI environment variable is not defined in .env file.",
  );
}

const client = new MongoClient(uri);

// [FIX 2]: MongoDB কানেকশন নিরাপদ করা (কানেকশন ফেইল হলে সার্ভার যাতে ক্র্যাশ না করে)
let db;
let bookscollection;
let borrowscollection;

export async function connectToMongoDB() {
  try {
    //await client.connect();
    console.log("You successfully connected to MongoDB!");
    db = client.db("booknook");
    bookscollection = db.collection("books");
    borrowscollection = db.collection("borrows"); // borrows কালেকশন
    return client;
  } catch (err) {
    console.error("MongoDB connection failed:", err.message);
  }
}

await connectToMongoDB();

// Root route
app.get("/", async (req, res) => {
  res.send({ message: "Server is running fine!" });
});

// [FIX 4]: /add-book এ try...catch ও স্ট্যাটাস কোড যোগ করা হয়েছে
app.post("/add-book", async (req, res) => {
  try {
    const data = {
      ...req.body,
      createdAt: new Date(),
    };
    if (!bookscollection) {
      return res.status(500).send({ message: "Database is not connected." });
    }
    const result = await bookscollection.insertOne(data);
    res.status(201).send(result);
  } catch (err) {
    console.error("Error adding book:", err);
    res
      .status(500)
      .send({ message: "Failed to add book.", error: err.message });
  }
});

// [NEW ROUTE]: New Arrivals এর জন্য সর্বশেষ ৬টি বই পাওয়া (MongoDB sort ও limit ব্যবহার করে)
app.get("/latest-books", async (req, res) => {
  try {
    if (!bookscollection) {
      return res.status(500).send({ message: "Database is not connected." });
    }
    // _id: -1 অথবা createdAt: -1 দিলে MongoDB-তে সবচেয়ে নতুন বইগুলো সবার আগে আসে এবং limit(6) দিয়ে ৬টি নেওয়া হয়
    const result = await bookscollection
      .find()
      .sort({ _id: -1 })
      .limit(6)
      .toArray();
    res.send(result);
  } catch (err) {
    console.error("Error fetching latest books:", err);
    res
      .status(500)
      .send({ message: "Failed to fetch latest books.", error: err.message });
  }
});

// [FIX 5]: /books এ try...catch ও এরর হ্যান্ডলিং যোগ করা হয়েছে
app.get("/books", async (req, res) => {
  try {
    if (!bookscollection) {
      return res.status(500).send({ message: "Database is not connected." });
    }
    const result = await bookscollection.find().toArray();
    res.send(result);
  } catch (err) {
    console.error("Error fetching books:", err);
    res
      .status(500)
      .send({ message: "Failed to fetch books.", error: err.message });
  }
});

// [NEW ROUTE]: লগইন করা ইউজারের অ্যাড করা বইয়ের তালিকা পাওয়া (My Books পেজের জন্য)
app.get("/my-books", async (req, res) => {
  try {
    if (!bookscollection) {
      return res.status(500).send({ message: "Database is not connected." });
    }
    const { email } = req.query;
    const query = email ? { userEmail: email } : {};
    const result = await bookscollection.find(query).toArray();
    res.send(result);
  } catch (err) {
    console.error("Error fetching my books:", err);
    res
      .status(500)
      .send({ message: "Failed to fetch my books.", error: err.message });
  }
});

// [NEW ROUTE]: বই এডিট / আপডেট করা (My Books পেজের Edit বাটনের জন্য)
app.put("/books/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid book ID format." });
    }
    if (!bookscollection) {
      return res.status(500).send({ message: "Database is not connected." });
    }

    const { title, author, category, totalCopies, image, description } =
      req.body;
    const updateDoc = {
      $set: {
        title,
        author,
        category,
        totalCopies: Number(totalCopies),
        image,
        description,
      },
    };

    const result = await bookscollection.updateOne(
      { _id: new ObjectId(id) },
      updateDoc,
    );
    res.send({ success: true, message: "Book updated successfully!", result });
  } catch (err) {
    console.error("Error updating book:", err);
    res
      .status(500)
      .send({ message: "Failed to update book.", error: err.message });
  }
});

// [NEW ROUTE]: বই ডিলিট করা (My Books পেজের Delete বাটনের জন্য)
app.delete("/books/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid book ID format." });
    }
    if (!bookscollection) {
      return res.status(500).send({ message: "Database is not connected." });
    }

    const result = await bookscollection.deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) {
      return res.status(404).send({ message: "Book not found." });
    }
    res.send({ success: true, message: "Book deleted successfully!" });
  } catch (err) {
    console.error("Error deleting book:", err);
    res
      .status(500)
      .send({ message: "Failed to delete book.", error: err.message });
  }
});

// [FIX 6]: /books/:id এ ObjectId ভ্যালিডেশন এবং 404 হ্যান্ডেলিং
app.get("/books/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid book ID format." });
    }

    if (!bookscollection) {
      return res.status(500).send({ message: "Database is not connected." });
    }

    const result = await bookscollection.findOne({ _id: new ObjectId(id) });
    if (!result) {
      return res.status(404).send({ message: "Book not found." });
    }

    res.send(result);
  } catch (err) {
    console.error("Error fetching book details:", err);
    res
      .status(500)
      .send({ message: "Failed to fetch book details.", error: err.message });
  }
});

// [FIX 7]: বই ধার নেওয়া (Borrow Book)
app.post("/borrows", verifyToken, async (req, res) => {
  try {
    const { bookId, userName, userEmail } = req.body;

    if (!bookId || !ObjectId.isValid(bookId)) {
      return res.status(400).send({ message: "Valid Book ID is required." });
    }

    if (!userName || !userEmail) {
      return res
        .status(400)
        .send({ message: "User name and email are required." });
    }

    if (!bookscollection || !borrowscollection) {
      return res.status(500).send({ message: "Database is not connected." });
    }

    // [NO DOUBLE BORROW]: একই ইউজার একই বই দুইবার ধার নিতে পারবে না — আগে চেক করা হচ্ছে
    const alreadyBorrowed = await borrowscollection.findOne({
      bookId: new ObjectId(bookId),
      userEmail: userEmail.trim(),
    });
    if (alreadyBorrowed) {
      return res.status(409).send({
        message:
          "You have already borrowed this book. Return it first before borrowing again.",
      });
    }

    // ১. বইটি চেক করা এবং কোনো কপি বাকি আছে কিনা তা নিশ্চিত করা
    const book = await bookscollection.findOne({ _id: new ObjectId(bookId) });
    if (!book) {
      return res.status(404).send({ message: "Book not found." });
    }

    const availableCopies = Number(book.totalCopies || 0);
    if (availableCopies <= 0) {
      return res
        .status(400)
        .send({ message: "Sorry, no copies available for this book." });
    }

    // ২. বইয়ের মোট কপি ১ কমানো ($inc: { totalCopies: -1 })
    await bookscollection.updateOne(
      { _id: new ObjectId(bookId) },
      { $inc: { totalCopies: -1 } },
    );

    // ৩. ধার নেওয়া তারিখ ও ফেরত দেওয়ার তারিখ (৮ দিন পর)
    const borrowDate = new Date();
    const returnDate = new Date(Date.now() + 8 * 24 * 60 * 60 * 1000);

    const borrowRecord = {
      bookId: new ObjectId(bookId),
      bookTitle: book.title,
      bookImage: book.image || "",
      userName: userName.trim(),
      userEmail: userEmail.trim(),
      borrowDate: borrowDate,
      returnDate: returnDate,
      status: "borrowed",
    };

    const borrowResult = await borrowscollection.insertOne(borrowRecord);

    res.status(201).send({
      success: true,
      message: "Book borrowed successfully!",
      borrowId: borrowResult.insertedId,
    });
  } catch (err) {
    console.error("Error borrowing book:", err);
    res
      .status(500)
      .send({ message: "Failed to borrow book.", error: err.message });
  }
});

// [NEW ROUTE]: লগইন করা ইউজারের ধার করা বইগুলোর তালিকা (My Borrows পেজের জন্য)
app.get("/borrows", async (req, res) => {
  try {
    if (!borrowscollection) {
      return res.status(500).send({ message: "Database is not connected." });
    }

    const { email } = req.query;
    const query = email ? { userEmail: email } : {};
    const result = await borrowscollection.find(query).toArray();
    res.send(result);
  } catch (err) {
    console.error("Error fetching borrows:", err);
    res
      .status(500)
      .send({ message: "Failed to fetch borrows.", error: err.message });
  }
});

// [NEW ROUTE]: বই ফেরত দেওয়া (Return Book)
// ধার করা রেকর্ড ডিলিট করে এবং বইয়ের স্টকে ১ কপি বাড়িয়ে দেয়
app.delete("/borrows/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid borrow ID format." });
    }

    if (!bookscollection || !borrowscollection) {
      return res.status(500).send({ message: "Database is not connected." });
    }

    const borrow = await borrowscollection.findOne({ _id: new ObjectId(id) });
    if (!borrow) {
      return res.status(404).send({ message: "Borrow record not found." });
    }

    // ১. বইয়ের মোট কপি ১ বাড়ানো ($inc: { totalCopies: 1 })
    if (borrow.bookId) {
      await bookscollection.updateOne(
        { _id: new ObjectId(borrow.bookId) },
        { $inc: { totalCopies: 1 } },
      );
    }

    // ২. ধার নেওয়ার রেকর্ডটি মুছে ফেলা
    await borrowscollection.deleteOne({ _id: new ObjectId(id) });

    res.send({ success: true, message: "Book returned successfully!" });
  } catch (err) {
    console.error("Error returning book:", err);
    res
      .status(500)
      .send({ message: "Failed to return book.", error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running at ${PORT}`);
});
