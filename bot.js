/**
 * CeloArcade Bot v3 — LOCAL ONLY. NEVER push to GitHub.
 *
 * node bot.js          → runs forever (daily schedule)
 * node bot.js once     → single test run
 * node bot.js stats    → check all wallet stats  
 * node bot.js fund     → top up alt wallets
 * node bot.js w 3      → run only wallet #3
 */

const { ethers } = require("ethers");
const fs = require("fs");
require("dotenv").config();

const RPC      = "https://forno.celo.org";
const CONTRACT = process.env.CONTRACT_ADDRESS;
const MAIN_KEY = process.env.PRIVATE_KEY;

// Source wallets to spread funding from (add balances to these)
// Bot will pick different ones each day to fund new wallets
const FUNDER_KEYS = [
  process.env.FUNDER_1 || process.env.PRIVATE_KEY,
  process.env.FUNDER_2 || process.env.WALLET_1,
  process.env.FUNDER_3 || process.env.WALLET_2,
].filter(Boolean);

const ABI = [
  "function register(address referrer) external",
  "function playGame(uint8 gameType, uint8 category, bool won, uint256 xpToAward) external payable",
  "function isRegistered(address) external view returns (bool)",
  "function getPlayer(address) external view returns (uint256,uint256,uint256,uint256,uint256,uint256,uint256,bool)",
  "function contractBalance() external view returns (uint256)",
];

// ── FIXED WALLETS (9 alts) ────────────────────────────────────
const FIXED_KEYS = [
  process.env.WALLET_1, process.env.WALLET_2, process.env.WALLET_3,
  process.env.WALLET_4, process.env.WALLET_5, process.env.WALLET_6,
  process.env.WALLET_7, process.env.WALLET_8, process.env.WALLET_9,
].filter(Boolean);

// ── DYNAMIC WALLET STORE ──────────────────────────────────────
// New wallets created by bot stored here locally
const DYNAMIC_WALLET_FILE = "./dynamic-wallets.json";

function loadDynamicWallets() {
  try {
    if (fs.existsSync(DYNAMIC_WALLET_FILE)) {
      return JSON.parse(fs.readFileSync(DYNAMIC_WALLET_FILE, 'utf8'));
    }
  } catch(e) {}
  return [];
}

function saveDynamicWallets(wallets) {
  fs.writeFileSync(DYNAMIC_WALLET_FILE, JSON.stringify(wallets, null, 2));
}

// ── QUESTION BANKS ────────────────────────────────────────────
const QUIZ_CATEGORIES = [
  [ // General
    {q:"What planet is the Red Planet?",a:1,o:["Venus","Mars","Jupiter","Saturn"]},
    {q:"How many sides does a hexagon have?",a:1,o:["5","6","7","8"]},
    {q:"Chemical symbol for gold?",a:1,o:["Gd","Au","Ag","Go"]},
    {q:"Largest ocean on Earth?",a:3,o:["Atlantic","Indian","Arctic","Pacific"]},
    {q:"Who painted the Mona Lisa?",a:2,o:["Picasso","Raphael","Da Vinci","Monet"]},
    {q:"Fastest land animal?",a:2,o:["Lion","Horse","Cheetah","Leopard"]},
    {q:"WWII ended in?",a:2,o:["1943","1944","1945","1946"]},
    {q:"How many continents?",a:2,o:["5","6","7","8"]},
    {q:"Tallest mountain on Earth?",a:1,o:["K2","Everest","Kangchenjunga","Lhotse"]},
    {q:"Smallest country in the world?",a:2,o:["Monaco","Liechtenstein","Vatican City","San Marino"]},
  ],
  [ // Crypto
    {q:"Who created Bitcoin?",a:1,o:["Vitalik","Satoshi","Charlie Lee","Gavin Wood"]},
    {q:"Max supply of Bitcoin?",a:1,o:["18M","21M","100M","Unlimited"]},
    {q:"DeFi stands for?",a:1,o:["Digital Finance","Decentralized Finance","Defined Fiat","Derivative"]},
    {q:"Gas in Ethereum is?",a:1,o:["Token type","Transaction fee","Consensus","Wallet"]},
    {q:"A crypto whale is?",a:1,o:["NFT type","Large holder","Mining pool","DeFi protocol"]},
    {q:"Ethereum consensus now?",a:2,o:["Proof of Work","Delegated PoS","Proof of Stake","PoA"]},
    {q:"NFT stands for?",a:0,o:["Non-Fungible Token","New Finance Token","Network Fee","No-Fee Tx"]},
    {q:"Bitcoin launched in?",a:2,o:["2007","2008","2009","2010"]},
    {q:"What is a rug pull?",a:1,o:["Failed launch","Dev abandons with funds","Market crash","Bug"]},
    {q:"Smart contract is?",a:1,o:["Legal doc","Self-executing blockchain code","Crypto wallet","Order"]},
  ],
  [ // Celo
    {q:"Native currency of Celo?",a:1,o:["cUSD","CELO","cEUR","cGLD"]},
    {q:"MiniPay built into?",a:2,o:["Chrome","Firefox","Opera","Brave"]},
    {q:"cUSD is?",a:1,o:["Native token","USD stablecoin on Celo","DeFi protocol","Governance"]},
    {q:"MiniPay wallets created?",a:2,o:["1M+","5M+","14M+","50M+"]},
    {q:"Celo's core mission?",a:1,o:["Gaming","Financial inclusion","NFTs","Metaverse"]},
    {q:"Recommended lib for MiniPay?",a:2,o:["ethers.js","web3.js","viem/wagmi","truffle"]},
    {q:"Celo mainnet chain ID?",a:2,o:["1","137","42220","43114"]},
    {q:"Gas token on Celo?",a:2,o:["ETH","BNB","CELO","MATIC"]},
    {q:"Proof of Ship run by?",a:1,o:["Ethereum Foundation","Celo Foundation","Binance","Polygon"]},
    {q:"Celo designed for?",a:1,o:["Gaming","Mobile-first payments","NFT trading","DAO governance"]},
  ],
  [ // Sports
    {q:"Players on a soccer team?",a:2,o:["9","10","11","12"]},
    {q:"Most FIFA World Cup wins?",a:2,o:["Germany","Argentina","Brazil","France"]},
    {q:"Phelps sport?",a:1,o:["Athletics","Swimming","Cycling","Triathlon"]},
    {q:"Holes in standard golf?",a:2,o:["9","12","18","24"]},
    {q:"Sport using a puck?",a:2,o:["Tennis","Basketball","Hockey","Baseball"]},
    {q:"Max bowling score?",a:2,o:["200","250","300","360"]},
    {q:"Rugby union team size?",a:2,o:["11","13","15","17"]},
    {q:"Tennis after deuce?",a:1,o:["Game","Advantage","Set","Match"]},
    {q:"Basketball invented in?",a:1,o:["USA","Canada","UK","Australia"]},
    {q:"NBA quarter length?",a:2,o:["8 min","10 min","12 min","15 min"]},
  ],
  [ // Pop Culture
    {q:"Who sang Shape of You?",a:1,o:["Justin Bieber","Ed Sheeran","Bruno Mars","Drake"]},
    {q:"Iron Man actor in MCU?",a:1,o:["Chris Evans","Robert Downey Jr.","Hemsworth","Ruffalo"]},
    {q:"Best-selling video game?",a:2,o:["GTA V","Tetris","Minecraft","Mario Bros"]},
    {q:"iPhone first released?",a:2,o:["2005","2006","2007","2008"]},
    {q:"PlayStation made by?",a:2,o:["Microsoft","Nintendo","Sony","Sega"]},
    {q:"Highest-grossing film?",a:2,o:["Titanic","Avengers Endgame","Avatar","Top Gun"]},
    {q:"Facebook launched in?",a:1,o:["2002","2004","2006","2008"]},
    {q:"TikTok parent company?",a:1,o:["Alibaba","Bytedance","Tencent","Baidu"]},
    {q:"ChatGPT created by?",a:2,o:["Google","Meta","OpenAI","Microsoft"]},
    {q:"AI stands for?",a:1,o:["Automated Input","Artificial Intelligence","Advanced Interface","Algorithmic"]},
  ],
];

const WORDS = ["BITCOIN","CELO","ARCADE","CRYPTO","WALLET","LEDGER","BLOCK","CHAIN","TOKEN","STAKE","YIELD","TRADE","SMART","DEFI","NODE","HASH","MINT","BURN","SWAP","GAME","SCORE","LEVEL","QUEST","BONUS"];

// ── HELPERS ───────────────────────────────────────────────────
const ri    = (a,b) => Math.floor(Math.random()*(b-a+1))+a;
const rms   = (a,b) => ri(a,b);
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const fmt   = n => parseFloat(ethers.formatEther(n)).toFixed(4);
const pick  = arr => arr[ri(0,arr.length-1)];

function log(name, msg){
  const t = new Date().toLocaleTimeString('en-US',{hour12:false});
  console.log(`[${t}] [${name.padEnd(12)}] ${msg}`);
}

// ── PERSONALITIES ─────────────────────────────────────────────
function getPersonality(wIdx, dayNum){
  const base = [
    {name:"NightOwl",    baseHours:[21,22,23,0],  winRate:0.72, games:[0,0,0,2],   rounds:[1,2], qCount:[8,14],  thinkMs:[7000,35000],  missDay:0.08, betStyle:["0.001","0.001","0.002"]},
    {name:"DayGrinder",  baseHours:[9,10,11,14],  winRate:0.65, games:[0,2,0,2,0], rounds:[2,3], qCount:[10,16], thinkMs:[4000,18000],  missDay:0.05, betStyle:["0.001","0.002","0.002"]},
    {name:"Casual",      baseHours:[12,13,20,21], winRate:0.50, games:[0,0,1],     rounds:[1,1], qCount:[5,9],   thinkMs:[14000,60000], missDay:0.25, betStyle:["0.001"]},
    {name:"SpeedFreak",  baseHours:[7,8,17,18],   winRate:0.80, games:[2,2,2,0],   rounds:[1,3], qCount:[15,25], thinkMs:[2000,9000],   missDay:0.07, betStyle:["0.001","0.002"]},
    {name:"WeekendViber",baseHours:[10,15,22,23], winRate:0.60, games:[0,2,0],     rounds:[1,2], qCount:[7,12],  thinkMs:[10000,45000], missDay:0.20, betStyle:["0.001","0.001"]},
    {name:"EarlyBird",   baseHours:[6,7,8,9],     winRate:0.70, games:[0,0,2],     rounds:[1,2], qCount:[8,14],  thinkMs:[6000,24000],  missDay:0.10, betStyle:["0.001","0.002","0.001"]},
    {name:"HighRoller",  baseHours:[20,21,22,23], winRate:0.63, games:[0,0,2],     rounds:[1,2], qCount:[8,12],  thinkMs:[5000,20000],  missDay:0.12, betStyle:["0.002","0.005","0.001"]},
    {name:"Lurker",      baseHours:[14,15,23,0],  winRate:0.48, games:[0,1,0,2],   rounds:[1,1], qCount:[4,8],   thinkMs:[20000,90000], missDay:0.30, betStyle:["0.001"]},
    {name:"AfterWork",   baseHours:[17,18,19,20], winRate:0.67, games:[0,0,2,0],   rounds:[1,2], qCount:[9,15],  thinkMs:[8000,28000],  missDay:0.15, betStyle:["0.001","0.002"]},
    // Extra personalities for dynamic wallets
    {name:"NewUser",     baseHours:[11,12,19,20], winRate:0.55, games:[0,0,2],     rounds:[1,2], qCount:[6,12],  thinkMs:[10000,40000], missDay:0.20, betStyle:["0.001"]},
    {name:"Explorer",    baseHours:[15,16,21,22], winRate:0.62, games:[0,2,0],     rounds:[1,2], qCount:[7,13],  thinkMs:[8000,35000],  missDay:0.15, betStyle:["0.001","0.002"]},
    {name:"Grinder2",    baseHours:[8,9,18,19],   winRate:0.68, games:[0,0,0,2,0], rounds:[2,3], qCount:[9,15],  thinkMs:[5000,22000],  missDay:0.10, betStyle:["0.001","0.002"]},
  ];

  const p = {...base[wIdx % base.length]};
  // Rotate hours every 2 days
  const rotation = Math.floor(dayNum / 2) * 4;
  p.hours = p.baseHours.map(h => (h + rotation) % 24);
  return p;
}

// ── CREATE NEW WALLET ─────────────────────────────────────────
async function createAndFundWallet(dayNum) {
  const provider = new ethers.JsonRpcProvider(RPC);

  // Create fresh wallet
  const newWallet = ethers.Wallet.createRandom();
  log("NewWallet", `Created: ${newWallet.address.slice(0,12)}...`);

  // Pick a random funder wallet (spread funding across different sources)
  const funderKey = pick(FUNDER_KEYS);
  const funder = new ethers.Wallet(funderKey, provider);
  const funderBal = await provider.getBalance(funder.address);

  const fundAmount = ethers.parseEther("0.02"); // 0.02 CELO per new wallet

  if (funderBal < fundAmount) {
    log("NewWallet", `⚠️  Funder ${funder.address.slice(0,10)} too low — skipping`);
    return null;
  }

  try {
    // Random delay before funding (looks organic)
    await sleep(rms(5000, 30000));

    const tx = await funder.sendTransaction({
      to: newWallet.address,
      value: fundAmount
    });
    await tx.wait();
    log("NewWallet", `✅ Funded with 0.02 CELO from ${funder.address.slice(0,10)}...`);

    // Save to dynamic wallets file
    const dynamicWallets = loadDynamicWallets();
    dynamicWallets.push({
      address: newWallet.address,
      privateKey: newWallet.privateKey,
      createdDay: dayNum,
      firstPlayDay: dayNum + ri(0, 1), // plays same day or next day
      personalityIdx: ri(9, 11), // uses extra personality types
    });
    saveDynamicWallets(dynamicWallets);

    log("NewWallet", `💾 Saved to dynamic-wallets.json`);
    return { key: newWallet.privateKey, address: newWallet.address };
  } catch(e) {
    log("NewWallet", `❌ Funding failed: ${e.message?.slice(0,60)}`);
    return null;
  }
}

// ── REGISTER ──────────────────────────────────────────────────
async function ensureRegistered(contract, wallet, name, mainAddr){
  const reg = await contract.isRegistered(wallet.address);
  if(reg) return true;

  log(name, `New here — registering...`);
  await sleep(rms(3000, 12000));

  try{
    const tx = await contract.register(mainAddr||ethers.ZeroAddress);
    await tx.wait();
    log(name, `✅ Registered! Welcome bonus received`);
    await sleep(rms(8000, 25000));
    return true;
  }catch(e){
    log(name, `❌ Register failed: ${e.reason||e.message?.slice(0,50)}`);
    return false;
  }
}

// ── PLAY QUIZ ROUND ───────────────────────────────────────────
async function playQuizRound(contract, wallet, name, p){
  const cat = ri(0, QUIZ_CATEGORIES.length-1);
  const pool = [...QUIZ_CATEGORIES[cat]].sort(()=>Math.random()-0.5).slice(0, ri(6,10));
  log(name, `  📝 Quiz (${pool.length} questions, cat=${cat})`);

  let correct = 0;
  for(let i=0; i<pool.length; i++){
    const think = rms(p.thinkMs[0], p.thinkMs[1]);
    await sleep(think);
    if(Math.random() < 0.10){
      const dist = ri(15000, 80000);
      log(name, `    ...distracted ${Math.round(dist/1000)}s`);
      await sleep(dist);
    }
    const variance = (Math.random()-0.5)*0.15;
    const won = Math.random() < (p.winRate + variance);
    if(won) correct++;
    log(name, `    Q${i+1}/${pool.length}: ${won?'✅':'❌'} (${Math.round(think/1000)}s)`);
    if(i < pool.length-1) await sleep(rms(1500, 5000));
  }

  log(name, `  📊 ${correct}/${pool.length} correct`);
  const won = correct >= Math.floor(pool.length/2);
  const xp  = 10 + (correct * 5);
  const bet = pick(p.betStyle);

  try{
    log(name, `  ⛓  Sending tx (${bet} CELO, won=${won}, xp=${xp})...`);
    const tx = await contract.playGame(0, cat, won, xp, {value: ethers.parseEther(bet)});
    await tx.wait();
    log(name, `  ✅ TX confirmed!`);
    return true;
  }catch(e){
    log(name, `  ❌ TX failed: ${e.reason||e.message?.slice(0,50)}`);
    return false;
  }
}

// ── PLAY SPEED ROUND ──────────────────────────────────────────
async function playSpeedRound(contract, wallet, name, p){
  const wordCount = ri(8, 20);
  log(name, `  ⚡ Speed (${wordCount} words)`);

  let correct = 0;
  const start = Date.now();
  for(let i=0; i<wordCount; i++){
    if(Date.now() - start > 60000) break;
    const word = pick(WORDS);
    const think = rms(2000, 12000);
    await sleep(think);
    const won = Math.random() < (p.winRate + 0.05);
    if(won) correct++;
    log(name, `    Word ${i+1}: ${won?'✅':'❌'} "${word}"`);
  }

  log(name, `  📊 ${correct} correct`);
  const won = correct >= 5;
  const xp  = 10 + (correct * 4);
  const bet = pick(p.betStyle);

  try{
    log(name, `  ⛓  Sending speed tx (${bet} CELO)...`);
    const tx = await contract.playGame(2, ri(0,4), won, xp, {value: ethers.parseEther(bet)});
    await tx.wait();
    log(name, `  ✅ Speed TX confirmed!`);
    return true;
  }catch(e){
    log(name, `  ❌ Speed TX failed: ${e.reason||e.message?.slice(0,50)}`);
    return false;
  }
}

// ── WALLET SESSION ────────────────────────────────────────────
async function runSession(key, wIdx, mainAddr, dayNum=0){
  const p        = getPersonality(wIdx, dayNum);
  const provider = new ethers.JsonRpcProvider(RPC);
  const wallet   = new ethers.Wallet(key, provider);
  const contract = new ethers.Contract(CONTRACT, ABI, wallet);

  const bal = await provider.getBalance(wallet.address);
  if(bal < ethers.parseEther("0.002")){
    log(p.name, `⚠️  Balance too low (${fmt(bal)} CELO)`);
    return 0;
  }

  const ok = await ensureRegistered(contract, wallet, p.name, mainAddr);
  if(!ok) return 0;

  const rounds = ri(p.rounds[0], p.rounds[1]);
  log(p.name, `▶ Today: ${rounds} round(s)`);

  let txCount = 0;
  for(let r=0; r<rounds; r++){
    if(r > 0){
      const gap = ri(20, 120) * 60000;
      log(p.name, `  Break before round ${r+1}: ${Math.round(gap/60000)}min`);
      await sleep(gap);
    }
    const gameType = pick(p.games);
    const success  = gameType === 2
      ? await playSpeedRound(contract, wallet, p.name, p)
      : await playQuizRound(contract, wallet, p.name, p);

    if(success) txCount++;

    if(Math.random() < 0.3 && r < rounds-1){
      const browse = ri(30, 180) * 1000;
      log(p.name, `  Browsing for ${Math.round(browse/1000)}s`);
      await sleep(browse);
    }
  }

  log(p.name, `✅ Done — ${txCount} tx (${rounds} rounds)`);
  return txCount;
}

// ── DAILY NEW WALLET CREATION ─────────────────────────────────
// Schedule: days 1-10, create 1-3 wallets per day randomly
const NEW_WALLET_SCHEDULE = [
  2, // Day 1: create 2
  1, // Day 2: create 1
  3, // Day 3: create 3
  1, // Day 4: create 1
  2, // Day 5: create 2
  1, // Day 6: create 1
  3, // Day 7: create 3
  2, // Day 8: create 2
  1, // Day 9: create 1
  1, // Day 10: create 1
  0, // Day 11+: stop creating
];

async function createNewWalletsForDay(dayNum, mainAddr) {
  const count = NEW_WALLET_SCHEDULE[dayNum - 1] || 0;
  if(count === 0) return [];

  console.log(`\n  👥 Creating ${count} new wallet(s) today...\n`);
  const created = [];

  for(let i=0; i<count; i++){
    // Random delay between wallet creations (30min - 2hr gap)
    if(i > 0) await sleep(ri(30, 120) * 60000);
    const result = await createAndFundWallet(dayNum);
    if(result) created.push(result);
  }

  return created;
}

// ── FUND ALTS ─────────────────────────────────────────────────
async function fundAlts(){
  if(!MAIN_KEY){ console.error("Set PRIVATE_KEY in .env"); return; }
  const provider = new ethers.JsonRpcProvider(RPC);
  const main = new ethers.Wallet(MAIN_KEY, provider);
  const mainBal = await provider.getBalance(main.address);
  console.log(`\n💰 Main: ${main.address} — ${fmt(mainBal)} CELO\n`);

  for(let i=0;i<FIXED_KEYS.length;i++){
    const w = new ethers.Wallet(FIXED_KEYS[i], provider);
    const bal = await provider.getBalance(w.address);
    const p = getPersonality(i, 0);
    console.log(`W${i+1} [${p.name.padEnd(12)}]: ${w.address.slice(0,10)}... — ${fmt(bal)} CELO`);
    if(bal < ethers.parseEther("0.02")){
      try{
        const tx = await main.sendTransaction({to:w.address, value:ethers.parseEther("0.02")});
        await tx.wait();
        console.log(`   ✅ Topped up with 0.02 CELO`);
      }catch(e){ console.log(`   ❌ ${e.message?.slice(0,60)}`); }
      await sleep(2000);
    } else {
      console.log(`   ✅ OK`);
    }
  }
  console.log(`\n✅ Done`);
}

// ── STATS ─────────────────────────────────────────────────────
async function showStats(){
  const provider = new ethers.JsonRpcProvider(RPC);
  console.log(`\n${'═'.repeat(62)}`);
  console.log(`  CELOARCADE BOT — WALLET STATS`);
  console.log(`${'═'.repeat(62)}\n`);
  try{
    const c = new ethers.Contract(CONTRACT, ABI, provider);
    const cb = await c.contractBalance();
    console.log(`  CONTRACT: ${fmt(cb)} CELO\n`);
  }catch(e){}

  const allKeys = [...FIXED_KEYS];
  const dynamicWallets = loadDynamicWallets();
  dynamicWallets.forEach(w => allKeys.push(w.privateKey));

  for(let i=0;i<allKeys.length;i++){
    const p = i < FIXED_KEYS.length ? getPersonality(i,0) : {name:`Dynamic-${i-FIXED_KEYS.length+1}`};
    const w = new ethers.Wallet(allKeys[i], provider);
    const c = new ethers.Contract(CONTRACT, ABI, provider);
    const bal = await provider.getBalance(w.address);
    let stats = null;
    try{
      const reg = await c.isRegistered(w.address);
      if(reg){
        const s = await c.getPlayer(w.address);
        stats = {games:Number(s[0]),wins:Number(s[1]),xp:Number(s[3]),level:Number(s[4]),streak:Number(s[5])};
      }
    }catch(e){}
    const label = i < FIXED_KEYS.length ? `W${i+1}` : `D${i-FIXED_KEYS.length+1}`;
    console.log(`  ${label} [${(p.name||'').padEnd(12)}] ${w.address.slice(0,12)}...`);
    console.log(`       Balance: ${fmt(bal)} CELO`);
    if(stats) console.log(`       Games: ${stats.games} | Wins: ${stats.wins} | XP: ${stats.xp} | Lvl: ${stats.level} | 🔥${stats.streak}`);
    else       console.log(`       Status: Not registered`);
    console.log();
  }

  console.log(`  Dynamic wallets created: ${dynamicWallets.length}`);
}

// ── DAILY SCHEDULER ───────────────────────────────────────────
async function runDaily(){
  console.log(`\n${'╔'+'═'.repeat(48)+'╗'}`);
  console.log(`║   CeloArcade Bot v3 — Running 24/7            ║`);
  console.log(`${'╚'+'═'.repeat(48)+'╝'}`);
  console.log(`  Fixed wallets:  ${FIXED_KEYS.length}`);
  console.log(`  Contract: ${CONTRACT}\n`);
  if(!FIXED_KEYS.length){ console.error("No wallets in .env"); process.exit(1); }

  const mainAddr = process.env.MAIN_WALLET_ADDRESS || ethers.ZeroAddress;
  let day = 0;

  while(true){
    day++;
    console.log(`\n${'═'.repeat(52)}`);
    console.log(`  DAY ${day} — ${new Date().toDateString()}`);
    console.log(`${'═'.repeat(52)}\n`);

    // Load dynamic wallets that should play today
    const dynamicWallets = loadDynamicWallets();
    const todayDynamic = dynamicWallets.filter(w => w.firstPlayDay <= day);

    // All keys to run today
    const allKeys = [...FIXED_KEYS];
    todayDynamic.forEach(w => allKeys.push(w.privateKey));

    console.log(`  Players today: ${allKeys.length} (${FIXED_KEYS.length} fixed + ${todayDynamic.length} dynamic)\n`);

    // Shuffle order
    const order = [...Array(allKeys.length).keys()].sort(()=>Math.random()-0.5);

    // Start new wallet creation for today (runs in background)
    // Stagger it — create wallets at random times during the day
    const newWalletDelay = ri(2, 8) * 3600000; // 2-8 hours into the day
    setTimeout(async () => {
      await createNewWalletsForDay(day, mainAddr);
    }, newWalletDelay);

    // Run all wallet sessions concurrently with their own schedules
    const promises = order.map(async (idx) => {
      const key = allKeys[idx];
      const pIdx = idx < FIXED_KEYS.length ? idx : (dynamicWallets[idx - FIXED_KEYS.length]?.personalityIdx || idx);
      const p = getPersonality(pIdx, day);

      if(Math.random() < p.missDay){
        log(p.name, `Taking today off`);
        return 0;
      }

      // Schedule for their active hour
      const now = new Date();
      const curHour = now.getHours();
      const targetHour = pick(p.hours);

      let waitMs = 0;
      if(!p.hours.includes(curHour)){
        const target = new Date();
        target.setHours(targetHour, ri(0,59), ri(0,59), 0);
        if(target <= now) target.setDate(target.getDate()+1);
        waitMs = (target - now) + ri(0, 30)*60000;
        log(p.name, `Day ${day} — starts at ${targetHour}:xx (+${Math.round(waitMs/60000)}min)`);
      } else {
        waitMs = ri(0, 25)*60000;
        log(p.name, `Active — starting in ${Math.round(waitMs/60000)}min`);
      }

      await sleep(waitMs);
      return await runSession(key, pIdx, mainAddr, day);
    });

    const results = await Promise.all(promises);
    const dayTotal = results.reduce((a,b)=>a+b,0);
    console.log(`\n📊 Day ${day}: ${dayTotal} total transactions`);
    console.log(`   Dynamic wallets total: ${loadDynamicWallets().length}`);

    // Sleep to next day
    const now = new Date();
    const midnight = new Date(); midnight.setHours(24,0,0,0);
    const wait = (midnight-now) + ri(5,45)*60000;
    console.log(`⏰ Next day in ${(wait/3600000).toFixed(1)}h`);
    await sleep(wait);
  }
}

// ── ONCE MODE ─────────────────────────────────────────────────
async function runOnce(){
  console.log("\n🧪 Test run — all wallets\n");
  const mainAddr = process.env.MAIN_WALLET_ADDRESS || ethers.ZeroAddress;
  let total = 0;
  for(let i=0;i<FIXED_KEYS.length;i++){
    if(i>0){
      const gap = ri(60000, 180000);
      console.log(`\n⏳ Next wallet in ${Math.round(gap/60000)}min\n`);
      await sleep(gap);
    }
    const txs = await runSession(FIXED_KEYS[i], i, mainAddr, 1);
    total += txs;
  }
  console.log(`\n✅ Done — ${total} total transactions`);
}

// ── SINGLE WALLET ─────────────────────────────────────────────
async function runSingle(n){
  const mainAddr = process.env.MAIN_WALLET_ADDRESS || ethers.ZeroAddress;
  const idx = n-1;
  if(!FIXED_KEYS[idx]){ console.error(`No wallet #${n}`); return; }
  const p = getPersonality(idx, 1);
  console.log(`\n🎯 Running wallet #${n} (${p.name})\n`);
  const txs = await runSession(FIXED_KEYS[idx], idx, mainAddr, 1);
  console.log(`\n✅ Done — ${txs} transactions`);
}

// ── ENTRY ─────────────────────────────────────────────────────
const mode = process.argv[2];
const arg3 = parseInt(process.argv[3]);
if      (mode==='fund')  fundAlts().catch(console.error);
else if (mode==='stats') showStats().catch(console.error);
else if (mode==='once')  runOnce().catch(console.error);
else if (mode==='w')     runSingle(arg3).catch(console.error);
else                     runDaily().catch(console.error);
