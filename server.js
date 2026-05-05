require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { ThirdwebSDK } = require('@thirdweb-dev/sdk');

const app = express();
app.use(cors());
app.use(express.json());

console.log('🔑 Initializing SDK with private key...');

const sdk = ThirdwebSDK.fromPrivateKey(
  process.env.BACKEND_PRIVATE_KEY,
  'polygon'
);

let tokenContract;
let contractReady = false;

async function initContract() {
  try {
    console.log('🔄 Loading contract:', process.env.TOKEN_CONTRACT_ADDRESS);
    tokenContract = await sdk.getContract(process.env.TOKEN_CONTRACT_ADDRESS);
    contractReady = true;
    console.log('✅ Contract ready:', process.env.TOKEN_CONTRACT_ADDRESS);
  } catch (error) {
    console.error('❌ Failed to load contract:', error.message);
    console.error('Full error:', error);
  }
}

initContract();

const mintHistory = new Map();
const MAX_MINTS_PER_HOUR = 60;

app.post('/api/mint-monk', async (req, res) => {
  // Check if contract is ready
  if (!contractReady || !tokenContract) {
    console.log('⚠️ Contract not ready yet');
    return res.status(503).json({ 
      error: 'Contract not ready',
      message: 'Backend is still initializing, please try again in a moment'
    });
  }

  const { walletAddress, amount, sessionData } = req.body;
  
  if (!walletAddress || !amount || !sessionData) {
    return res.status(400).json({ 
      error: 'Missing required fields'
    });
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
    
    const tx = await tokenContract.erc20.mintTo(walletAddress, amount);
    
    recentMints.push(now);
    mintHistory.set(walletAddress, recentMints);
    
    console.log(`✅ Success! Minted ${amount} $MONK`);
    console.log(`📜 Transaction: ${tx.receipt.transactionHash}`);
    console.log(`🔗 https://polygonscan.com/tx/${tx.receipt.transactionHash}\n`);
    
    res.json({
      success: true,
      transactionHash: tx.receipt.transactionHash,
      amount: amount,
      explorerUrl: `https://polygonscan.com/tx/${tx.receipt.transactionHash}`,
      message: `Successfully minted ${amount} $MONK tokens!`
    });
    
  } catch (error) {
    console.error('❌ Mint error:', error.message);
    console.error('Full error:', error);
    res.status(500).json({ 
      error: 'Server error during minting',
      message: error.message
    });
  }
});

app.get('/api/balance/:walletAddress', async (req, res) => {
  if (!contractReady || !tokenContract) {
    return res.status(503).json({ 
      error: 'Contract not ready'
    });
  }

  const { walletAddress } = req.params;
  
  try {
    const balance = await tokenContract.erc20.balanceOf(walletAddress);
    
    console.log(`💰 Balance: ${walletAddress} has ${balance.displayValue} $MONK`);
    
    res.json({
      walletAddress,
      balance: balance.displayValue,
      formatted: `${balance.displayValue} $MONK`
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
    contractReady: contractReady
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 MMGA BACKEND RUNNING!');
  console.log('='.repeat(60));
  console.log(`📡 Port: ${PORT}`);
  console.log(`⛓️  Network: Polygon`);
  console.log(`💰 Contract: ${process.env.TOKEN_CONTRACT_ADDRESS}`);
  console.log(`✅ Server ready!\n`);
});
