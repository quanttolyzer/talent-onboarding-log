require('dotenv').config();

console.log("👉 DB URL =", process.env.DATABASE_URL); // ADD THIS

const app = require('./app');

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`✅ Talent & Onboarding API running on port ${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
});