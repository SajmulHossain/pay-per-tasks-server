const express = require('express');
const cors = require('cors');
require('dotenv').config();

const port = process.env.port || 3000;
const app = express();
app.use (cors())
app.use(express.json())

app.get('/', (req, res) => {
  res.send('Server is runnig');
})

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
})