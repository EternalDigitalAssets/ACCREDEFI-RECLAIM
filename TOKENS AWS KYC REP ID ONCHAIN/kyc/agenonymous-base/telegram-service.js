async handleCallbackQuery(callbackQuery) {
    const chatId = callbackQuery.message.chat.id;
    const user = callbackQuery.from;
    const data = callbackQuery.data;

    switch (data) {
        case 'become_affiliate':
            await this.startAffiliateSignup(chatId, user);
            break;
        // ... other cases
    }
}

async startAffiliateSignup(chatId, user) {
    const message = `💰 **BECOME AN AFFILIATE**

**Earn $1.50 per referral** (60% commission!)

**Step 1:** Choose your unique affiliate code
Examples: ${user.first_name}2024, CRYPTO${user.id}, MYCODE

**Requirements:**
• 3-20 characters
• Letters, numbers, underscore, dash only
• Must be unique

**Type your desired affiliate code:**`;

    await this.sendMessage(chatId, {
        text: message,
        parse_mode: 'Markdown'
    });

    // Set user state to wait for affiliate code input
    this.userStates.set(user.id, 'waiting_affiliate_code');
}

async handleMessage(message) {
    const user = message.from;
    const text = message.text;
    const chatId = message.chat.id;

    // Check if user is entering affiliate code
    if (this.userStates.get(user.id) === 'waiting_affiliate_code') {
        await this.processAffiliateCode(chatId, user, text);
        this.userStates.delete(user.id);
        return;
    }

    // ... rest of message handling
}

async processAffiliateCode(chatId, user, affiliateCode) {
    // Validate code format
    if (!/^[A-Za-z0-9_-]{3,20}$/.test(affiliateCode)) {
        await this.sendMessage(chatId, {
            text: '❌ Invalid code. Use 3-20 characters: letters, numbers, underscore, dash only.\n\nTry again:'
        });
        this.userStates.set(user.id, 'waiting_affiliate_code');
        return;
    }

    try {
        const affiliate = await database.createAffiliate(user.id, affiliateCode);
        
        if (!affiliate) {
            await this.sendMessage(chatId, {
                text: '❌ That code is already taken. Choose a different one:\n\nTry again:'
            });
            this.userStates.set(user.id, 'waiting_affiliate_code');
            return;
        }

        const successMessage = `🎉 **AFFILIATE ACCOUNT CREATED!**

✅ **Your Code:** ${affiliateCode}
💰 **Commission:** $1.50 per referral (60%)
🔗 **Your Link:** https://t.me/agenonymous_bot?start=${affiliateCode}

💡 **PRO TIP:** Use your own code when you get verified!
Enter "${affiliateCode}" as affiliate code and pay only $1!

**What's Next:**
1. Share your link with friends
2. Get verified using your own code
3. Start earning $1.50 per referral!`;

        const keyboard = {
            inline_keyboard: [
                [{ text: '🛡️ Get Verified Now ($1)', web_app: { url: `${process.env.PUBLIC_URL}?affiliate=${affiliateCode}` } }],
                [{ text: '📊 View My Stats', callback_data: 'affiliate_stats' }],
                [{ text: '📋 Share My Link', callback_data: `share_link_${affiliateCode}` }]
            ]
        };

        await this.sendMessage(chatId, {
            text: successMessage,
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });

    } catch (error) {
        await this.sendMessage(chatId, {
            text: '❌ Error creating affiliate account. Please try again.'
        });
    }
}
