const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const { createGemini, getCookiesFromFile, Gemini } = require('@k.nirmal/gemini-kit');

const app = express();
const port = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Configure multer for file uploads
const upload = multer({ storage: multer.memoryStorage() });

let geminiClient;
let conversationHistory = {}; // Store conversation context by ID

// Initialize Gemini client
async function initGemini() {
    console.log('--- Initialization Started ---');
    try {
        const cookiePath = path.join(__dirname, 'cokies.json');
        if (!fs.existsSync(cookiePath)) {
            console.error('[Error] cokies.json not found in ' + __dirname);
            return;
        }
        console.log('[Info] Reading cookies from: ' + cookiePath);
        const cookieData = fs.readFileSync(cookiePath, 'utf8');
        let cookies = {};
        
        try {
            const parsed = JSON.parse(cookieData);
            if (Array.isArray(parsed)) {
                console.log('[Info] Cookies loaded as JSON array');
                parsed.forEach(c => {
                    cookies[c.name] = c.value;
                });
            } else {
                console.log('[Info] Parsing cookies using getCookiesFromFile');
                cookies = getCookiesFromFile(cookieData);
            }
        } catch (e) {
            console.log('[Info] JSON parse failed, falling back to helper');
            cookies = getCookiesFromFile(cookieData);
        }

        if (!cookies['__Secure-1PSID']) {
            console.error('[Error] CRITICAL: Missing __Secure-1PSID cookie!');
            return;
        }

        console.log('[Info] Initializing Gemini client (waiting for Google auth)...');
        geminiClient = await createGemini(cookies);
        console.log('[Success] Gemini client ready and authenticated!');
    } catch (error) {
        console.error('[Error] Initialization failed:', error);
    }
}

// Routes
app.post('/api/ask', async (req, res) => {
    const { message, conversationId, photo } = req.body;
    console.log(`[Request] Incoming - Message: "${message}", Has Photo: ${!!photo}`);
    
    if (!geminiClient) {
        return res.status(503).json({ error: 'Gemini client not initialized' });
    }

    try {
        const opts = {};
        if (conversationId && conversationHistory[conversationId]) {
            opts.user = conversationHistory[conversationId];
        }
        if (photo) {
            // photo: ['cat.jpg', imgUrl]
            opts.photo = photo;
        }

        const response = await geminiClient.ask(message, opts);
        
        // Store context for next turn
        if (response.conversation_id) {
            conversationHistory[response.conversation_id] = response;
        }

        res.json(response);
    } catch (error) {
        console.error('Error asking Gemini:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/upload', upload.single('image'), async (req, res) => {
    if (!geminiClient) {
        return res.status(503).json({ error: 'Gemini client not initialized' });
    }

    try {
        const url = await geminiClient.uploadImage(req.file.buffer);
        res.json({ url, name: req.file.originalname });
    } catch (error) {
        console.error('Error uploading image:', error);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/speech', async (req, res) => {
    const { text, langCode } = req.body;
    
    if (!geminiClient) {
        return res.status(503).json({ error: 'Gemini client not initialized' });
    }

    try {
        const audio = await geminiClient.speech(text, { langCode: langCode || 'en-GB' });
        res.setHeader('Content-Type', 'audio/wav');
        res.send(audio);
    } catch (error) {
        console.error('Error generating speech:', error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    initGemini();
});
