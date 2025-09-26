bot.on('inline_query', async (ctx) => {
    const query = ctx.inlineQuery.query;
    
    if (query.startsWith('verify_age')) {
        const results = [{
            type: 'article',
            id: '1',
            title: 'Agenonymous Age Verification',
            description: 'Anonymous age verification - $1.76',
            input_message_content: {
                message_text: '🛡️ Verify your age anonymously with Agenonymous!\nClick to start: /start'
            },
            reply_markup: {
                inline_keyboard: [[{
                    text: '🔐 Start Verification',
                    url: 'https://t.me/agenonymous_bot?start=inline_verify'
                }]]
            }
        }];
        
        await ctx.answerInlineQuery(results);
    }
});
