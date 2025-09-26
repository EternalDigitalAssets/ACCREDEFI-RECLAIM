app.post('/webhook/telegram', (req, res) => {
    const secretToken = req.headers['x-telegram-bot-api-secret-token'];
    
    if (secretToken !== process.env.TELEGRAM_WEBHOOK_SECRET) {
        return res.status(401).json({ error: 'Invalid webhook' });
    }
    
    // Process verified webhook
});
