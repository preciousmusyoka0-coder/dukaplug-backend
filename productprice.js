
const mongoose = require("mongoose");

const productPriceSchema = new mongoose.Schema({
  productId: {
    type: String,
    required: true,
    unique: true
  },
  price: {
    type: Number,
    required: true,
    min: 0
  }
}, {
  timestamps: true
});

module.exports = mongoose.model("ProductPrice", productPriceSchema);
