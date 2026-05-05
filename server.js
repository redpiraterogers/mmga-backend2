require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { ThirdwebSDK } = require('@thirdweb-dev/sdk');

const app = express();
app.use(cors());
app.use(express.json());

const sdk = new ThirdwebSDK('polygon', {
  secretKey: process.env.THIRDWEB_SECRET_KEY
});

let tokenContract;

async function initContract() {
  try {
    tokenContract = await sdk.getContract(process.env.TOKEN_CONTRACT_ADDRESS);
    console.log('✅ Connected to contract:', process.env.TOKEN_CONTRACT_ADDRESS);
  } catch (error) {
    console.error('❌ Failed to load contract:', error.message);
  }
}
initContract();

const mintHistory = new Map();
const MAX_MINTS_PER_HOUR = 60;

app.post('/api/mint-monk', async (req, res) => {
  const { walletAddress, amount, sessionData } = req.body;
  
  if (!walletAddress || !amount || !sessionData) {
    return res.status(400).json({ error: 'Missing fields' });
  }
  
  if (!sessionData.eyesClosed || !sessionData.spineCorrect) {
    return res.status(400).json({ error: 'Invalid meditation data' });
  }
  
  const now = Date.now();
  const userHistory = mintHistory.get(walletAddress) || [];
  const recentMints = userHistory.filter(time => now - time < 3600000);
  
  if (recentMints.length >= MAX_MINTS_PER_HOUR) {
    return res.status(429).json({ error: 'Rate limit exceeded' });
  }
  
  try {
    console.log(`🔄 Minting ${amount} $MONK to ${walletAddress}...`);
    const tx = await tokenContract.erc20.mintTo(walletAddress, amount);
    recentMints.push(now);
    mintHistory.set(walletAddress, recentMints);
    console.log(`✅ Success! Tx: ${tx.receipt.transactionHash}`);
    
    res.json({
      success: true,
      transactionHash: tx.receipt.transactionHash,
      amount: amount,
      explorerUrl: `https://polygonscan.com/tx/${tx.receipt.transactionHash}`
    });
  } catch (error) {
    console.error('❌ Mint error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/balance/:walletAddress', async (req, res) => {
  try {
    const balance = await tokenContract.erc20.balanceOf(req.params.walletAddress);
    res.json({
      walletAddress: req.params.walletAddress,
      balance: balance.displayValue
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok',
    contract: process.env.TOKEN_CONTRACT_ADDRESS,
    network: 'polygon'
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('\n🚀 MMGA BACKEND RUNNING');
  console.log(`📡 Port: ${PORT}`);
  console.log(`💰 Contract: ${process.env.TOKEN_CONTRACT_ADDRESS}\n`);
});
