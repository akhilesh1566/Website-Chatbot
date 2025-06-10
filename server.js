// Import core modules
const express = require('express');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables from .env file
dotenv.config();

// Initialize the Express application
const app = express();

// Define the port from environment variables, with a fallback
const PORT = process.env.PORT || 3000;

// --- Middleware ---
// Enable parsing of JSON bodies in requests
app.use(express.json());
// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));


// --- API Routes ---
// A simple health-check route to confirm the server is running
app.get('/api/status', (req, res) => {
    console.log('GET /api/status - Health check successful');
    res.status(200).json({ status: 'Server is running' });
});

// --- Server Activation ---
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log('------------------------------------------------');
    console.log('Project Scaffolding Complete.');
    console.log('Next Steps: Run "npm start" in your terminal.');
    console.log('------------------------------------------------');
});