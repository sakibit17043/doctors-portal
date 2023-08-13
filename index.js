const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { MongoClient, ServerApiVersion } = require('mongodb');
const jwt = require('jsonwebtoken');


const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.8vjyewr.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send({ message: 'unauthorized access' })
  }
  const token = authHeader.split(' ')[1];
  jwt.verify(token, process.env.Access_Token_Secret, function (err, decoded) {
    if (err) {
      return res.status(403).send({ message: 'forbidden access' })
    }
    else {
      req.decoded = decoded;
    }
    next();
  });

}

async function run() {
  try {
    await client.connect();
    const serviceCollection = client.db("doctors_portal").collection("services");
    const bookingCollection = client.db("doctors-portal").collection("booking");
    const userCollection = client.db("doctors-portal").collection("users");
    const doctorCollection = client.db("doctors-portal").collection("doctors");

    const verifyAdmin = async(req,res,next)=>{
      const requester = req.decoded.email;
      const requesterAccount = await userCollection.findOne({email:requester});
      if(requesterAccount.role === 'admin'){
        next();
      }
      else{
        res.status(403).send({message:'forbidden access'})
      }
    }

    app.get('/services', async (req, res) => {
      const query = {};
      const cursor = serviceCollection.find(query).project({ name: 1 });
      const services = await cursor.toArray();
      res.send(services);
    })
    app.get('/available', async (req, res) => {
      const date = req.query.date;
      const services = await serviceCollection.find().toArray();
      const query = { date: date };
      const bookings = await bookingCollection.find(query).toArray();
      services.forEach((service) => {
        const serviceBookings = bookings.filter(b => b.treatment === service.name);
        const booked = serviceBookings.map(s => s.slot);
        const available = service.slots.filter(s => !booked.includes(s));
        service.slots = available;
      })
      res.send(services);
    })
    app.get('/users', verifyJWT, async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    })
    app.get('/admin/:email', verifyJWT, async (req, res) => {
      const email = req.params.email;
      const user = await userCollection.findOne({ email: email });
      const isAdmin = user.role === 'admin';
      res.send({ admin: isAdmin })
    })
    app.get('/booking', verifyJWT, async (req, res) => {
      const patient = req.query.patient;
      const decodedEmail = req.decoded.email;
      if (patient === decodedEmail) {
        const query = { patient: patient };
        const bookings = await bookingCollection.find(query).toArray();
        res.send(bookings);
      }
      else {
        return res.status(403).send({ message: 'forbidden access' });
      }
    })
    app.post('/booking', async (req, res) => {
      const booking = req.body;
      const query = { treatment: booking.treatment, date: booking.date, patient: booking.patient };
      const exists = await bookingCollection.findOne(query);
      if (exists) {
        return res.send({ success: false, booking: exists });
      }
      const result = await bookingCollection.insertOne(booking);
      console.log(`A booking was inserted with _id:${result.insertedId}`)
      return res.send({ success: true, result });
    })
    app.put('/user/:email', async (req, res) => {
      const email = req.params.email;
      const user = req.body;
      const filter = { email: email };
      const options = { upsert: true };
      const updateDoc = {
        $set: user
      };
      const result = await userCollection.updateOne(filter, updateDoc, options);
      const token = jwt.sign({ email: email }, process.env.Access_Token_Secret, { expiresIn: '1h' });
      res.send({ result, token });

    })
    app.put('/users/admin/:email', verifyJWT,verifyAdmin, async (req, res) => {
      const email = req.params.email;
        const filter = { email: email };
        const updateDoc = {
          $set: { role: 'admin' }
        }
        const result = await userCollection.updateOne(filter, updateDoc);
        res.send(result);
    });

    app.get('/doctor',verifyJWT,verifyAdmin,async(req,res)=>{
      const result = await doctorCollection.find().toArray();
      res.send(result);
    })

    app.post('/doctor',verifyJWT,verifyAdmin,async(req,res)=>{
      const doctor = req.body;
      const result = await doctorCollection.insertOne(doctor);
      res.send(result);
    })

    app.delete('/doctor/:email',verifyJWT,verifyAdmin,async(req,res)=>{
      const email = req.params.email;
      const result = await doctorCollection.deleteOne({email:email});
      res.send(result);
    })
  }
  finally {

  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('Hellow from doctors portal server');
})



app.listen(port, () => {
  console.log(`Doctors portal app listening on port ${port}`);
})