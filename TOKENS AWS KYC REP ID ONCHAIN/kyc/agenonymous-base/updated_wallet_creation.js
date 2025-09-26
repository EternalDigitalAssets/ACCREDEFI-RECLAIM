async createPreFundedWallet(telegramId) {
    // Generate seed phrase first
    const mnemonic = await mnemonicNew();
    const seedPhrase = mnemonic.join(' ');
    
    // Derive keys
    const keyPair = await mnemonicToPrivateKey(mnemonic);
    
    // Return seed phrase to user (not private key)
    return {
        address: walletAddress,
        seedPhrase: seedPhrase, // Users import these 24 words
        // Keep private key for internal verification only
    };
}
