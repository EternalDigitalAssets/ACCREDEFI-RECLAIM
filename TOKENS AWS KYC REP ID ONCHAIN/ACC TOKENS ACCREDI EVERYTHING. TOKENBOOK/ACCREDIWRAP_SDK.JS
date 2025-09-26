// Deploy the complete ecosystem
const sdk = new AccrediWrapSDK(NetworkType.TON_TESTNET);
await sdk.initialize(mnemonic);

// Deploy factory
const factoryTx = await sdk.deployAccrediMint(factoryCode);

// Deploy native token
const nativeToken = await sdk.deployAccrediCoin(factoryAddress, {
  metadata: { name: "Property Token", symbol: "PROP" },
  networkType: NetworkType.TON,
  isNativeToken: false, // Will be true on XDC subnet
  initialSupply: sdk.toNano(1000000)
});

// Deploy wrapper (condom) 
const wrapper = await sdk.deployAccrediWrap(factoryAddress, {
  baseTokenAddress: "EQA...", // Existing USDT
  metadata: { name: "Compliant USDT", symbol: "cUSDT" }
});

// Deploy compliance system
const compliance = await sdk.deployComplianceGate(gateCode);
