import express from "express";
import colors from "colors";
require('dotenv').config()

const app = express();

app.use(express.static("build"));

app.listen(2056, (): void =>
  console.log(
    colors.green("[express] production server running on port 2056")
  )
);
