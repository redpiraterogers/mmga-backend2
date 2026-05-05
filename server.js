require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { ethers } = require('ethers');

const app = express();
app.use(cors());
app.use(express.json());

// Try multiple Polygon RPCs (free public endpoints)
const RPC_URLS = [
  'https://polygon-rpc.com',
  'https://rpc-mainnet.maticvigil.com',
  'https://rpc-mainnet.matic.network',
  'https://matic-mainnet.chainstacklabs.com',
  'https://polygon-mainnet.public.blastapi.io'
];

let provider;
let wallet;
let contract;

async function initProvider() {
  for (const rpcUrl of RPC_URLS) {
    try {
      console.log(`🔄 Trying RPC: ${rpcUrl}`);
      const testProvider = new ethers.JsonRpcProvider(rpcUrl);
      await testProvider.getNetwork(); // Test connection
      provider = testProvider;
      console.log(`✅ Connected to: ${rpcUrl}`);
      break;
    } catch (e) {
      console.log(`❌ Failed: ${rpcUrl}`);
    }
  }
  
  if (!provider) {
    console.error('❌ All RPC endpoints failed!');
    process.exit(1);
  }
  
  // Initialize wallet and contract
  wallet = new ethers.Wallet(process.env.BACKEND_PRIVATE_KEY, provider);
  console.log('🔑 Backend wallet:', wallet.address);
  
  const contractABI = [
    "function mint(address to, uint256 amount) public",
    "function mintTo(address to, uint256 amount) public",
    "function balanceOf(address account) public view returns (uint256)",
    "function decimals() public view returns (uint8)"
  ];
  
  contract = new ethers.Contract(
    process.env.TOKEN_CONTRACT_ADDRESS,
    contractABI,
    wallet
  );
}

initProvider();

const mintHistory = new Map();
const MAX_MINTS_PER_HOUR = 60;

app.post('/api/mint-monk', async (req, res) => {
  if (!contract) {
    return res.status(503).json({ error: 'Backend initializing, try again in a moment' });
  }

  const { walletAddress, amount, sessionData } = req.body;
  
  if (!walletAddress || !amount || !sessionData) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  if (!sessionData.eyesClosed || !sessionData.spineCorrect) {
    return res.status(400).json({ 
      error: 'Invalid meditation data',
      message: 'Both eyes closed and spine erect required'
    });
  }
  
  const now = Date.now();
  const userHistory = mintHistory.get(walletAddress) || [];
  const recentMints = userHistory.filter(time => now - time < 3600000);
  
  if (recentMints.length >= MAX_MINTS_PER_HOUR) {
    return res.status(429).json({ 
      error: 'Rate limit exceeded',
      message: 'Maximum 60 mints per hour'
    });
  }
  
  try {
    console.log(`\n🔄 Minting ${amount} $MONK to ${walletAddress}...`);
    
    let tx;
    try {
      tx = await contract.mintTo(walletAddress, amount);
    } catch (e) {
      console.log('mintTo failed, trying mint...');
      tx = await contract.mint(walletAddress, amount);
    }
    
    console.log('⏳ Waiting for confirmation...');
    const receipt = await tx.wait();
    
    recentMints.push(now);
    mintHistory.set(walletAddress, recentMints);
    
    console.log(`✅ Success! Minted ${amount} $MONK`);
    console.log(`📜 Transaction: ${receipt.hash}`);
    console.log(`🔗 https://polygonscan.com/tx/${receipt.hash}\n`);
    
    res.json({
      success: true,
      transactionHash: receipt.hash,
      amount: amount,
      explorerUrl: `https://polygonscan.com/tx/${receipt.hash}`,
      message: `Successfully minted ${amount} $MONK tokens!`
    });
    
  } catch (error) {
    console.error('❌ Mint error:', error.message);
    
    let errorMsg = error.message;
    if (error.message.includes('insufficient funds')) {
      errorMsg = 'Backend wallet needs more MATIC for gas';
    } else if (error.message.includes('execution reverted')) {
      errorMsg = 'Contract rejected transaction - check permissions';
    }
    
    res.status(500).json({ 
      error: 'Minting failed',
      message: errorMsg
    });
  }
});

app.get('/api/balance/:walletAddress', async (req, res) => {
  if (!contract) {
    return res.status(503).json({ error: 'Backend initializing' });
  }

  const { walletAddress } = req.params;
  
  try {
    const balance = await contract.balanceOf(walletAddress);
    const decimals = await contract.decimals();
    const formatted = ethers.formatUnits(balance, decimals);
    
    console.log(`💰 Balance: ${walletAddress} has ${formatted} $MONK`);
    
    res.json({
      walletAddress,
      balance: formatted,
      formatted: `${formatted} $MONK`
    });
    
  } catch (error) {
    console.error('Balance error:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch balance',
      message: error.message 
    });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok',
    contract: process.env.TOKEN_CONTRACT_ADDRESS,
    network: 'polygon',
    backendWallet: wallet ? wallet.address : 'initializing'
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 MMGA BACKEND RUNNING (ETHERS.JS)');
  console.log('='.repeat(60));
  console.log(`📡 Port: ${PORT}`);
  console.log(`⛓️  Network: Polygon`);
  console.log(`💰 Contract: ${process.env.TOKEN_CONTRACT_ADDRESS}`);
  console.log(`✅ Server started!\n`);
});
