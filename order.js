
const mongoose = require("mongoose");

const OrderItemSchema = new mongoose.Schema(
  {
    productId: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    price: { type: Number, required: true, min: 0 },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      validate: Number.isInteger
    },
    type: {
      type: String,
      enum: ["restaurant", "store"],
      required: true
    }
  },
  { _id: false }
);

const OrderSchema = new mongoose.Schema(
  {
    customerName: {
      type: String,
      required: true,
      trim: true
    },
    phone: {
      type: String,
      required: true,
      match: /^(?:\+254|0)[17]\d{8}$/
    },
    deliveryAddress: {
      type: String,
      required: true,
      trim: true
    },

    restaurantItems: {
      type: [OrderItemSchema],
      default: []
    },
    storeItems: {
      type: [OrderItemSchema],
      default: []
    },

    restaurantStatus: {
      type: String,
      enum: ["pending", "preparing", "ready", "none"],
      default: "none"
    },
    storeStatus: {
      type: String,
      enum: ["pending", "picking", "ready", "none"],
      default: "none"
    },
    overallStatus: {
      type: String,
      enum: [
        "received",
        "processing",
        "consolidated",
        "out_for_delivery",
        "delivered",
        "cancelled"
      ],
      default: "received"
    },

    subtotal: { type: Number, required: true, min: 0 },
    deliveryFee: { type: Number, required: true, min: 0 },
    totalAmount: { type: Number, required: true, min: 0 },

    paymentMethod: {
      type: String,
      enum: ["mpesa", "cash"],
      required: true
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed"],
      default: "pending"
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Order", OrderSchema);
