res.json({
    success: true,
    message: "🎁 Free TON sent to your verification wallet!",
    wallet: {
        address: preFundedWallet.address,
        seedPhrase: preFundedWallet.seedPhrase, // Users import these 24 words
        balance: "0.02 TON",
        instruction: "Import seed phrase into any TON wallet, send back 0.001 TON"
    },
    returnAddress: process.env.AGENONYMOUS_TON_WALLET
});
