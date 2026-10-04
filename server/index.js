// Runs the backend on your laptop. (On Vercel, api/index.js runs the same app instead.)
const app = require("./app");

const PORT = process.env.PORT || 5001;

app.listen(PORT, () => console.log(`Backend running on http://127.0.0.1:${PORT}`));
