const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const jwt = require('jsonwebtoken');
require("dotenv").config();
const port = process.env.PORT || 5000;

const app = express();

//Middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.mlxaon5.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});


function verifyJWT(req, res, next) {
    const authHeader = req.headers.authorization;
    if(!authHeader){
        return res.status(401).send('Unauthorized Access');
    }

    const token = authHeader.split(' ')[1];

    jwt.verify(token, process.env.ACCESS_TOKEN, function (err, decoded){
        if(err) {
            return res.status(403).send({message: 'Forbidden Access'})
        }
        req.decoded = decoded;
        next();
    })

}


async function run() {
  try {
    const appointmentOptionCollection = client.db("doctorsPortal").collection("appointmentOptions");
    const bookingsCollection = client.db("doctorsPortal").collection("bookings");
    const usersCollection = client.db('doctorsPortal').collection('users');

    app.get("/appointmentOptions", async (req, res) => {
      const date = req.query.date;
      const query = {};
      const options = await appointmentOptionCollection.find(query).toArray();
      
      //Get the bookings of the provided date
      const bookingQuery = { appointmentDate: date };
      const alreadyBooked = await bookingsCollection.find(bookingQuery).toArray();
      
      options.forEach(option => {
        const optionBooked = alreadyBooked.filter(book => book.treatment === option.name);
        const bookedSlots = optionBooked.map(book => book.slot);
        const remainingSlots = option.slots.filter(slot => !bookedSlots.includes(slot))
        option.slots = remainingSlots;
    })

      res.send(options);
    });

    app.get('/bookings', verifyJWT, async(req, res) => {
        const email = req.query.email;

        const decodedEmail = req.decoded.email;

        if(email !== decodedEmail){
            return res.send(403).send({message: 'Forbidden Access'})

        }

        const query = {email: email};
        const bookings = await bookingsCollection.find(query).toArray();
        res.send(bookings);

    });

    app.post("/bookings", async (req, res) => {
      const booking = req.body;

      const query = {
        appointmentDate: booking.appointmentDate,
        email: booking.email,
        treatment:booking.treatment
      }

      const alreadySlotBooked = await bookingsCollection.find(query).toArray();

      if(alreadySlotBooked.length){
        const message = `You Already Have a Booking on ${booking.appointmentDate}`;
        return res.send({acknowledged: false, message})

      }

      const result = await bookingsCollection.insertOne(booking);
      res.send(result);
    });

    app.get('/jwt', async (req, res) => {
        const email = req.query.email;
        const query = {email: email};
        const user = await usersCollection.findOne(query);
        if(user){
            const token = jwt.sign({email}, process.env.ACCESS_TOKEN, {expiresIn:'1h'})
            return res.send({accessToken: token});
        }
        res.status(403).send({accessToken: ''});
    })

    app.get('/users', async (req, res) => {
        const query = {};
        const users = await usersCollection.find(query).toArray();
        res.send(users);
    });

    app.get('/users/admin/:email', async (req, res) => {
        const email = req.params.email;
        const query = { email }
        const user = await usersCollection.findOne(query);
        res.send({ isAdmin: user?.role === 'admin' });
    })

    app.post('/users', async(req, res) => {
        const user = req.body;
        console.log(user);
        const result = await usersCollection.insertOne(user);
        res.send(result);

    });

    // Add Doctor API
    app.post('/doctors', async (req, res) => {
      const doctor = req.body;
      const result = await doctorsCollection.insertOne(doctor);
      res.send(result);
  });


    app.put('/users/admin/:id', verifyJWT, async (req, res) => {
        
        const decodedEmail = req.decoded.email;
        const query = { email: decodedEmail };
        const user = await usersCollection.findOne(query);

        if (user?.role !== 'admin') {
            return res.status(403).send({ message: 'Forbidden Access' })
        }

        const id = req.params.id;
        const filter = { _id: ObjectId(id)}
        const options = { upsert: true };
        const updatedDoc = {
            $set: {
                role: 'admin'
            }
        }
        const result = await usersCollection.updateOne(filter, updatedDoc, options);
        res.send(result);
    })


  } 

  finally {
    
  }
}

run().catch(console.log);

app.get("/", async (req, res) => {
  res.send("Doctor Portal Server is Running");
});

app.listen(port, () => {
  console.log(`Doctors Portal Running on ${port}`);
});
