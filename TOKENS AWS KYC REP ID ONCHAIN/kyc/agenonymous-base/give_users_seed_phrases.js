const mnemonic = generateMnemonic(); // 24 words
const keyPair = await mnemonicToPrivateKey(mnemonic);

// Give user the seed phrase to import
walletDetails = {
    seedPhrase: mnemonic.join(' '), // 24 words they can import
    address: walletAddress
}
