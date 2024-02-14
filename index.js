const express = require("express");
const axios = require("axios");
const velo = require("velo-node");
const mongoose = require("mongoose");
const cors = require("cors");
const { Schema, model } = require("mongoose");
const bodyParser = require("body-parser");

const app = express();
const port = 3080;

app.use(bodyParser.json());

// Setup
mongoose.connect("mongodb://127.0.0.1:27017/crypto", {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const productDataSchema = new mongoose.Schema({
  exchange: String,
  coin: String,
  product: String,
  time: Number,
  funding_rate: Number,
  total_trades: Number,
});

const coinDataSchema = new mongoose.Schema({
  product: String,
  data: [productDataSchema],
});

const cryptoDataSchema = new mongoose.Schema({
  BTC: [coinDataSchema],
  ETH: [coinDataSchema],
});
// Define Mongoose models
const Exchange = mongoose.model(
  "Exchange",
  new mongoose.Schema({
    name: { type: String, required: true, unique: true },
  })
);

const Coin = mongoose.model(
  "Coin",
  new mongoose.Schema({
    name: { type: String, required: true, unique: true },
  })
);

const Product = mongoose.model(
  "Product",
  new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    exchange: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Exchange",
      required: true,
    },
    coin: { type: mongoose.Schema.Types.ObjectId, ref: "Coin", required: true },
  })
);

const TradeData = mongoose.model(
  "TradeData",
  new mongoose.Schema({
    time: { type: Date, required: true },
    funding_rate: { type: Number, required: true },
    total_trades: { type: Number, required: true },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
  })
);

const client = new velo.Client("2c9a454f36364df1973f9893196d9f4d");

app.use(cors());

app.get("/getFuturesData", async (req, res) => {
  try {
    const futuresList = await client.futures();
    const coinsToFind = ["BTC", "ETH"];
    const result = {};

    for (const coin of coinsToFind) {
      const filteredProducts = futuresList.filter((product) =>
        product.product.includes(coin)
      );

      if (filteredProducts.length > 0) {
        const coinData = [];

        for (const product of filteredProducts) {
          const params = {
            type: "futures",
            columns: ["funding_rate", "total_trades"],
            exchanges: ["binance-futures", "bybit"],
            products: [product.product],
            begin: Date.now() - 1000 * 60 * 2,
            end: Date.now(),
            resolution: 1,
          };

          const rows = await client.rows(params);
          const rowData = [];

          for await (const row of rows) {
            rowData.push(row);
          }

          coinData.push({
            product: product.product,
            data: rowData,
          });
        }
        result[coin] = coinData;
      } else {
        result[coin] = [];
      }
    }

    res.json(result);
  } catch (error) {
    console.error("Error fetching data:", error.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.post("/saveFuturesData", async (req, res) => {
  try {
    const veloData = req.body;

    for (const coin in veloData) {
      let coinModel = await Coin.findOne({ name: coin });

      if (!coinModel) {
        coinModel = await Coin.create({ name: coin });
      }

      for (const productData of veloData[coin]) {
        for (const subItem of productData.data) {
          const exchangeName = subItem.exchange || "DefaultExchange";

          let exchangeModel = await Exchange.findOne({ name: exchangeName });

          if (!exchangeModel) {
            exchangeModel = await Exchange.create({ name: exchangeName });
          }

          const productName = subItem.product || "DefaultProduct";

          let productModel = await Product.findOne({ name: productName });

          if (!productModel) {
            productModel = await Product.create({
              name: productName,
              exchange: exchangeModel._id,
              coin: coinModel._id,
            });
          }

          await TradeData.create({
            time: new Date(subItem.time),
            funding_rate: subItem.funding_rate,
            total_trades: subItem.total_trades,
            product: productModel._id,
          });
        }
      }
    }

    res.status(201).json({ message: "Data saved successfully" });
  } catch (error) {
    console.error("Error saving data:", error.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
