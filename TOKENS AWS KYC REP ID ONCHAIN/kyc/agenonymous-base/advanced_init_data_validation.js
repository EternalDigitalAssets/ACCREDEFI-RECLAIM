const TELEGRAM_PUBLIC_KEYS = {
    production: 'e7bf03a2fa4602af4580703d88dda5bb59f32ed8b02a56c187fe7d34caed242d',
    test: '40055058a4ee38156a06562e52eece92a771bcd8346a8c4615cb7376eddf72ec'
};

// Enhanced validation without bot token exposure
function validateWithPublicKey(initData, botId) {
    // More secure validation method
    return Ed25519.verify(dataCheckString, signature, publicKey);
}
