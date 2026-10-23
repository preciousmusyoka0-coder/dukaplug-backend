
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();
const crypto = require("crypto");
const Order = require("./models/Order");
const ProductPrice = require("./models/ProductPrice");
const app = express();

app.use(cors());
app.use(express.json({ limit: "100kb" }));
app.use(express.static("public"));

const DELIVERY_FEE = 50;

// Trusted catalogue: ID | product name | price in KSh
// IDs 1-30 are restaurant items; IDs 31-150 are store items.
const catalogueText = `
1|Beef|250
2|Chicken|200
3|Chips|100
4|Masala Chips|200
5|Smokie beef|40
6|smokie chicken|30
7|Samosa|50
8|Bhajia|150
9|Chicken Wings|300
10|Fried Chicken|250
11|Hot Dog|180
12|Chicken Nuggets|220
13|Smocha|100
14|cupcakes|200
15|Spring Rolls|80
16|Chapati and Beans|150
17|Rice and Beans|150
18|Rice and Beef Stew|250
19|Rice and Chicken|300
20|Pilau|200
21|Ugali and Sukuma Wiki|100
22|Ugali and Beef|220
23|Githeri|120
24|Mukimo and Beef Stew|250
25|Chapati and Ndengu|150
26|Chips and smokie|180
27|fried rice and egg curry|350
28|Spaghetti and Minced Meat|250
29|fried rice and Stew|250
30|Vegetable Fried Rice|180
31|Coke|150
32|Fanta Orange|150
33|Sprite|150
34|minute maid|190
35|Pepsi|70
36|Mountain Dew|70
37|Minute Maid Juice|100
38|Del Monte Juice|350
39|Afia Juice|190
40|Mala|80
41|Bottled Water|50
42|Flavoured Water|100
43|Energy Drink|150
44|Iced Tea|120
45|Fresh Passion Juice|100
46|Bathing Soap|200
47|Toothpaste|200
48|Toothbrush|80
49|Toilet Paper|100
50|cotton buds|50
51|Panty Liners|100
52|Shampoo|180
53|Hair Conditioner|200
54|Body Lotion|300
55|Petroleum Jelly|100
56|Roll-on Deodorant|200
57|Handwash|150
58|Laundry Detergent|350
59|Dishwashing Liquid|150
60|Wet Wipes|200
61|Bananas (bunch)|100
62|Mango|50
63|Oranges (2)|100
64|Apple|200
65|Watermelon Slices|100
66|Pineapple Slices|100
67|Avocado|50
68|Pawpaw Portion|80
69|Passion Fruits (3)|50
70|Grapes (small pack)|180
71|Pear|70
72|Lemon (2)|40
73|Strawberries (small pack)|400
74|Melon Portion|100
75|Mixed Fruit Cup|150
76|Vanilla Ice Cream Cup|300
77|Chocolate Ice Cream Cup|300
78|Strawberry Ice Cream Cup|300
79|Ice Cream Cone|300
80|Ice Cream Tub (small)|250
81|Ice Lolly|35
82|fiesta|70
83|Chocolate Ice Cream Bar|300
84|Frozen Yoghurt|150
85|Ice Cream Tub (large)|500
86|Fresh Milk 500ml|80
87|Long-Life Milk 500ml|80
88|Mala 500ml|80
89|Plain Yoghurt|100
90|Strawberry Yoghurt|120
91|Drinking Yoghurt|100
92|Flavoured Milk|100
93|Chocolate Milk|120
94|Cheese Slices (pack)|250
95|Butter (small pack)|180
96|Digestive Biscuits|250
97|Marie Biscuits|250
98|Cream Biscuits|250
99|Chocolate Chip Cookies|120
100|Doughnut|80
101|Mandazi|30
102|Popcorn|80
103|Potato Crisps|70
104|Chewing Gum|30
105|Lollipop|20
106|Chocolate Bar|100
107|Sweets (small pack)|30
108|Roasted Groundnuts|50
109|Cashew Nuts (small pack)|180
110|Crackers|80
111|Oats (small pack)|250
112|Boiled Eggs (2)|40
113|Fruit Salad|150
114|Vegetable Salad|100
115|Greek Yoghurt|180
116|Granola (small pack)|180
117|Muesli (small pack)|180
118|Peanut Butter (small jar)|250
119|Wholemeal Bread|100
120|Roasted Maize|50
121|Boiled Maize|50
122|Sweet Potatoes|80
123|Boiled Arrowroots|100
124|Roasted Chickpeas|80
125|Mixed Nuts & Seeds|200
126|Sliced Bread|70
127|White Bread Rolls|30
128|Brown Bread|90
129|Croissant|120
130|Muffin|100
131|Cupcake|80
132|Cinnamon Roll|120
133|Banana Bread Slice|100
134|Scone|50
135|Meat Pie|120
136|Sausage Roll|100
137|Garlic Bread|150
138|Tea Cake Slice|80
139|Pancakes (2)|100
140|Waffles|180
141|Instant Noodles|50
142|Tea Bags (pack)|200
143|Instant Coffee Sachet|20
144|Sugar (500g)|100
145|Cooking Oil (500ml)|180
146|Rice (1kg)|180
147|Eggs (tray of 6)|120
148|Drinking Yoghurt|100
149|Exercise Book|80
150|Pen|30
`;

const products = {};

for (const line of catalogueText.trim().split("\n")) {
  const [id, name, priceText] = line.split("|");
  const numericId = Number(id);

  products[id] = {
    name,
    price: Number(priceText),
    type: numericId <= 30 ? "restaurant" : "store"
  };
}


const adminSessions = new Map();
const ADMIN_SESSION_TTL = 8 * 60 * 60 * 1000;

function requireAdmin(req, res, next) {
  const authorization = req.get("Authorization") || "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";

  const expiresAt = adminSessions.get(token);

  if (!token || !expiresAt || expiresAt <= Date.now()) {
    adminSessions.delete(token);
    return res.status(401).json({
      error: "Admin login required. Please log in again."
    });
  }

  next();
}

app.post("/api/admin/login", (req, res) => {
  const password = req.body?.password;

  if (
    !process.env.ADMIN_PASSWORD ||
    typeof password !== "string" ||
    password.length === 0
  ) {
    return res.status(401).json({
      error: "Invalid admin password."
    });
  }

  const submitted = Buffer.from(password);
  const expected = Buffer.from(process.env.ADMIN_PASSWORD);

  if (
    submitted.length !== expected.length ||
    !crypto.timingSafeEqual(submitted, expected)
  ) {
    return res.status(401).json({
      error: "Invalid admin password."
    });
  }

  const token = crypto.randomBytes(32).toString("hex");

  adminSessions.set(token, Date.now() + ADMIN_SESSION_TTL);

  res.json({
    message: "Admin login successful.",
    token,
    expiresIn: ADMIN_SESSION_TTL
  });
});


app.post("/api/admin/login", (req, res) => {
  const { password } = req.body;

  if (
    !process.env.ADMIN_PASSWORD ||
    typeof password !== "string" ||
    password.length === 0
  ) {
    return res.status(401).json({
      error: "Invalid admin password."
    });
  }

  const submitted = Buffer.from(password);
  const expected = Buffer.from(process.env.ADMIN_PASSWORD);

  if (
    submitted.length !== expected.length ||
    !crypto.timingSafeEqual(submitted, expected)
  ) {
    return res.status(401).json({
      error: "Invalid admin password."
    });
  }

  res.json({
    message: "Password verified. Admin authentication is ready."
  });
});

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", service: "DukaPlug API" });
});

app.get("/api/products", async (req, res) => {
  try {
    const savedPrices = await ProductPrice.find().lean();

    const priceMap = Object.fromEntries(
      savedPrices.map(item => [item.productId, item.price])
    );

    const catalogue = Object.entries(products).map(([id, product]) => ({
      id,
      name: product.name,
      type: product.type,
      price: priceMap[id] ?? product.price
    }));

    res.json(catalogue);
  } catch (error) {
    console.error("Product catalogue error:", error);
    res.status(500).json({ error: "Could not load products." });
  }
});

app.patch("/api/admin/prices", requireAdmin, async (req, res) => {
  try {
    const { prices } = req.body;

    if (
      !prices ||
      typeof prices !== "object" ||
      Array.isArray(prices) ||
      Object.keys(prices).length === 0 ||
      Object.keys(prices).length > 150
    ) {
      return res.status(400).json({
        error: "Provide valid product prices."
      });
    }

    const updates = [];

    for (const [id, price] of Object.entries(prices)) {
      if (
        !Object.prototype.hasOwnProperty.call(products, id) ||
        typeof price !== "number" ||
        !Number.isFinite(price) ||
        price < 0 ||
        price > 1000000
      ) {
        return res.status(400).json({
          error: `Invalid product ID or price for ${id}.`
        });
      }

      updates.push({
        updateOne: {
          filter: { productId: id },
          update: { $set: { price } },
          upsert: true
        }
      });
    }

    await ProductPrice.bulkWrite(updates);

    res.json({
      message: "Product prices saved successfully.",
      updatedCount: updates.length
    });
  } catch (error) {
    console.error("Price update error:", error);
    res.status(500).json({
      error: "Could not save product prices."
    });
  }
});

// Create an order using trusted backend prices.
app.post("/api/orders", async (req, res) => {
  try {
    const { customer, items, paymentMethod } = req.body;

    if (
      !customer ||
      typeof customer.name !== "string" ||
      typeof customer.phone !== "string" ||
      typeof customer.deliveryAddress !== "string" ||
      !customer.name.trim() ||
      !customer.deliveryAddress.trim() ||
      !/^(?:\+254|0)[17]\d{8}$/.test(customer.phone.trim())
    ) {
      return res.status(400).json({
        error: "Enter a valid name, Kenyan phone number and delivery address."
      });
    }

    if (
      !Array.isArray(items) ||
      items.length === 0 ||
      items.length > 100
    ) {
      return res.status(400).json({
        error: "Your cart must contain between 1 and 100 items."
      });
    }

    if (!["mpesa", "cash"].includes(paymentMethod)) {
      return res.status(400).json({
        error: "Choose a supported payment method."
      });
    }

    const verifiedItems = [];
    const savedPrices = await ProductPrice.find().lean();

const savedPriceMap = new Map(
  savedPrices.map(item => [item.productId, item.price])
);
    const seenIds = new Set();

    for (const item of items) {
      if (
        !item ||
        !["string", "number"].includes(typeof item.productId) ||
        !Number.isInteger(item.quantity) ||
        item.quantity < 1 ||
        item.quantity > 100
      ) {
        return res.status(400).json({
          error: "Invalid product or quantity."
        });
      }

      const productId = String(item.productId);
      const product = products[productId];

      if (!product) {
        return res.status(400).json({
          error: `Unknown product ID: ${productId}`
        });
      }

      if (seenIds.has(productId)) {
        return res.status(400).json({
          error: "Each product should appear only once in the cart."
        });
      }
const currentPrice = savedPriceMap.has(productId)
  ? savedPriceMap.get(productId)
  : product.price;
      seenIds.add(productId);

      verifiedItems.push({
        productId,
        name: product.name,
       price: currentPrice,
        quantity: item.quantity,
        type: product.type
      });
    }

    const restaurantItems = verifiedItems.filter(
      item => item.type === "restaurant"
    );

    const storeItems = verifiedItems.filter(
      item => item.type === "store"
    );

    const subtotal = verifiedItems.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );

    const deliveryFee = subtotal > 0 ? DELIVERY_FEE : 0;

    const order = await Order.create({
      customerName: customer.name.trim(),
      phone: customer.phone.trim(),
      deliveryAddress: customer.deliveryAddress.trim(),
      restaurantItems,
      storeItems,
      restaurantStatus: restaurantItems.length ? "pending" : "none",
      storeStatus: storeItems.length ? "pending" : "none",
      subtotal,
      deliveryFee,
      totalAmount: subtotal + deliveryFee,
      paymentMethod,
      paymentStatus: "pending"
    });

    return res.status(201).json({
      message: "Order received.",
      orderId: order._id,
      status: order.overallStatus,
      paymentStatus: order.paymentStatus,
      summary: {
        subtotal,
        deliveryFee,
        total: subtotal + deliveryFee
      }
    });
  } catch (error) {
    console.error("Order creation error:", error);
    return res.status(500).json({
      error: "Could not create order."
    });
  }
});

// Kitchen queue — development only until staff authentication is added.
app.get("/api/kitchen/queue", async (req, res) => {
  try {
    const orders = await Order.find({
      "restaurantItems.0": { $exists: true },
      restaurantStatus: { $in: ["pending", "preparing"] }
    }).select(
      "_id customerName restaurantItems restaurantStatus createdAt"
    );

    res.json(orders);
  } catch (error) {
    console.error("Kitchen queue error:", error);
    res.status(500).json({ error: "Could not load kitchen queue." });
  }
});

// Store queue — development only until staff authentication is added.
app.get("/api/store/queue", async (req, res) => {
  try {
    const orders = await Order.find({
      "storeItems.0": { $exists: true },
      storeStatus: { $in: ["pending", "picking"] }
    }).select(
      "_id customerName storeItems storeStatus createdAt"
    );

    res.json(orders);
  } catch (error) {
    console.error("Store queue error:", error);
    res.status(500).json({ error: "Could not load store queue." });
  }
});

// Do not expose this route to real staff before adding authentication
// and authorization.
app.patch("/api/orders/:id/status", async (req, res) => {
  try {
    const { department, status } = req.body;

    const allowed = {
      restaurant: ["preparing", "ready"],
      store: ["picking", "ready"]
    };

    if (
      !allowed[department] ||
      !allowed[department].includes(status)
    ) {
      return res.status(400).json({
        error: "Invalid department or status."
      });
    }

    const field = department === "restaurant"
      ? "restaurantStatus"
      : "storeStatus";

    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ error: "Order not found." });
    }

    if (order[field] === "none") {
      return res.status(400).json({
        error: "This department has no items in the order."
      });
    }

    order[field] = status;

    if (
      ["ready", "none"].includes(order.restaurantStatus) &&
      ["ready", "none"].includes(order.storeStatus)
    ) {
      order.overallStatus = "consolidated";
    } else {
      order.overallStatus = "processing";
    }

    await order.save();

    res.json({ message: "Status updated.", order });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(400).json({ error: "Invalid order ID." });
    }

    console.error("Status update error:", error);
    res.status(500).json({ error: "Could not update order." });
  }
});

const PORT = process.env.PORT || 5000;

async function startServer() {
  if (!process.env.MONGO_URI) {
    throw new Error("Set MONGO_URI in your .env file.");
  }

  await mongoose.connect(process.env.MONGO_URI);

  app.listen(PORT, () => {
    console.log(`DukaPlug API running on port ${PORT}`);
  });
}

startServer().catch(error => {
  console.error("Could not start DukaPlug:", error.message);
  process.exit(1);
});
