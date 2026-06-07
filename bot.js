/**
 * CeloArcade Bot — LOCAL ONLY. NEVER push to GitHub.
 *
 * node bot.js          → runs forever (daily schedule)
 * node bot.js once     → single test run
 * node bot.js stats    → check all wallet stats
 * node bot.js fund     → send 0.005 CELO from main to each alt
 * node bot.js w 3      → run only wallet #3
 */

const { ethers } = require("ethers");
require("dotenv").config();

const RPC      = "https://forno.celo.org";
const CONTRACT = process.env.CONTRACT_ADDRESS;
const MAIN_KEY = process.env.PRIVATE_KEY;

const ABI = [
  "function register(address referrer) external",
  "function playGame(uint8 gameType, uint8 category, bool won, uint256 xpToAward) external payable",
  "function isRegistered(address) external view returns (bool)",
  "function getPlayer(address) external view returns (uint256,uint256,uint256,uint256,uint256,uint256,uint256,bool)",
  "function contractBalance() external view returns (uint256)",
];

const KEYS = [
  process.env.WALLET_1, process.env.WALLET_2, process.env.WALLET_3,
  process.env.WALLET_4, process.env.WALLET_5, process.env.WALLET_6,
  process.env.WALLET_7, process.env.WALLET_8, process.env.WALLET_9,
].filter(Boolean);

// ── QUESTION BANKS (mirrors the frontend) ────────────────────
const QUIZ_CATEGORIES = [
  // General
  [
    {q:"What planet is the Red Planet?",opts:["Venus","Mars","Jupiter","Saturn"],a:1},
    {q:"How many sides does a hexagon have?",opts:["5","6","7","8"],a:1},
    {q:"Chemical symbol for gold?",opts:["Gd","Au","Ag","Go"],a:1},
    {q:"Largest ocean on Earth?",opts:["Atlantic","Indian","Arctic","Pacific"],a:3},
    {q:"Who painted the Mona Lisa?",opts:["Picasso","Raphael","Da Vinci","Monet"],a:2},
    {q:"Bones in adult human body?",opts:["196","206","216","226"],a:1},
    {q:"Fastest land animal?",opts:["Lion","Horse","Cheetah","Leopard"],a:2},
    {q:"WWII ended in?",opts:["1943","1944","1945","1946"],a:2},
    {q:"How many continents?",opts:["5","6","7","8"],a:2},
    {q:"Tallest mountain on Earth?",opts:["K2","Everest","Kangchenjunga","Lhotse"],a:1},
  ],
  // Crypto
  [
    {q:"Who created Bitcoin?",opts:["Vitalik","Satoshi","Charlie Lee","Gavin Wood"],a:1},
    {q:"Max supply of Bitcoin?",opts:["18M","21M","100M","Unlimited"],a:1},
    {q:"DeFi stands for?",opts:["Digital Finance","Decentralized Finance","Defined Fiat","Derivative"],a:1},
    {q:"Gas in Ethereum is?",opts:["Token type","Transaction fee","Consensus","Wallet"],a:1},
    {q:"A crypto whale is?",opts:["NFT type","Large holder","Mining pool","DeFi protocol"],a:1},
    {q:"Ethereum consensus now?",opts:["Proof of Work","Delegated PoS","Proof of Stake","PoA"],a:2},
    {q:"NFT stands for?",opts:["Non-Fungible Token","New Finance Token","Network Fee","No-Fee Tx"],a:0},
    {q:"Bitcoin launched in?",opts:["2007","2008","2009","2010"],a:2},
    {q:"What is a rug pull?",opts:["Failed launch","Dev abandons with funds","Market crash","Bug"],a:1},
    {q:"Smart contract is?",opts:["Legal doc","Self-executing blockchain code","Crypto wallet","Order"],a:1},
  ],
  // Celo
  [
    {q:"Native currency of Celo?",opts:["cUSD","CELO","cEUR","cGLD"],a:1},
    {q:"MiniPay built into?",opts:["Chrome","Firefox","Opera","Brave"],a:2},
    {q:"cUSD is?",opts:["Native token","USD stablecoin on Celo","DeFi protocol","Governance"],a:1},
    {q:"MiniPay wallets created?",opts:["1M+","5M+","14M+","50M+"],a:2},
    {q:"Celo's core mission?",opts:["Gaming","Financial inclusion","NFTs","Metaverse"],a:1},
    {q:"Recommended lib for MiniPay?",opts:["ethers.js","web3.js","viem/wagmi","truffle"],a:2},
    {q:"Celo mainnet chain ID?",opts:["1","137","42220","43114"],a:2},
    {q:"Gas token on Celo?",opts:["ETH","BNB","CELO","MATIC"],a:2},
    {q:"Proof of Ship run by?",opts:["Ethereum Foundation","Celo Foundation","Binance","Polygon"],a:1},
    {q:"Celo designed for?",opts:["Gaming","Mobile-first payments","NFT trading","DAO governance"],a:1},
  ],
  // Sports
  [
    {q:"Players on a soccer team?",opts:["9","10","11","12"],a:2},
    {q:"Most FIFA World Cup wins?",opts:["Germany","Argentina","Brazil","France"],a:2},
    {q:"Phelps sport?",opts:["Athletics","Swimming","Cycling","Triathlon"],a:1},
    {q:"Holes in standard golf?",opts:["9","12","18","24"],a:2},
    {q:"Sport using a puck?",opts:["Tennis","Basketball","Hockey","Baseball"],a:2},
    {q:"Max bowling score?",opts:["200","250","300","360"],a:2},
    {q:"Rugby union team size?",opts:["11","13","15","17"],a:2},
    {q:"Tennis after deuce?",opts:["Game","Advantage","Set","Match"],a:1},
    {q:"Basketball invented in?",opts:["USA","Canada","UK","Australia"],a:1},
    {q:"NBA quarter length?",opts:["8 min","10 min","12 min","15 min"],a:2},
  ],
  // Pop Culture
  [
    {q:"Who sang Shape of You?",opts:["Justin Bieber","Ed Sheeran","Bruno Mars","Drake"],a:1},
    {q:"Iron Man actor in MCU?",opts:["Chris Evans","Robert Downey Jr.","Hemsworth","Ruffalo"],a:1},
    {q:"Best-selling video game?",opts:["GTA V","Tetris","Minecraft","Mario Bros"],a:2},
    {q:"iPhone first released?",opts:["2005","2006","2007","2008"],a:2},
    {q:"PlayStation made by?",opts:["Microsoft","Nintendo","Sony","Sega"],a:2},
    {q:"Highest-grossing film?",opts:["Titanic","Avengers Endgame","Avatar","Top Gun"],a:2},
    {q:"Facebook launched in?",opts:["2002","2004","2006","2008"],a:1},
    {q:"TikTok parent company?",opts:["Alibaba","Bytedance","Tencent","Baidu"],a:1},
    {q:"ChatGPT created by?",opts:["Google","Meta","OpenAI","Microsoft"],a:2},
    {q:"AI stands for?",opts:["Automated Input","Artificial Intelligence","Advanced Interface","Algorithmic"],a:1},
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

// ── PERSONALITIES with rotating schedule ─────────────────────
// baseHours shift every 2 days so same wallet doesn't always play at same time
function getPersonality(wIdx, dayNum){
  const base = [
    { name:"NightOwl",    baseHours:[21,22,23,0],  winRate:0.72, games:[0,0,0,2],   rounds:[1,2], qCount:[8,14],  thinkMs:[7000,35000],  missDay:0.08, betStyle:["0.001","0.001","0.002"] },
    { name:"DayGrinder",  baseHours:[9,10,11,14],  winRate:0.65, games:[0,2,0,2,0], rounds:[2,3], qCount:[10,16], thinkMs:[4000,18000],  missDay:0.05, betStyle:["0.001","0.002","0.002"] },
    { name:"Casual",      baseHours:[12,13,20,21], winRate:0.50, games:[0,0,1],     rounds:[1,1], qCount:[5,9],   thinkMs:[14000,60000], missDay:0.25, betStyle:["0.001"]                },
    { name:"SpeedFreak",  baseHours:[7,8,17,18],   winRate:0.80, games:[2,2,2,0],   rounds:[1,3], qCount:[15,25], thinkMs:[2000,9000],   missDay:0.07, betStyle:["0.001","0.002"]         },
    { name:"WeekendViber",baseHours:[10,15,22,23], winRate:0.60, games:[0,2,0],     rounds:[1,2], qCount:[7,12],  thinkMs:[10000,45000], missDay:0.20, betStyle:["0.001","0.001"]         },
    { name:"EarlyBird",   baseHours:[6,7,8,9],     winRate:0.70, games:[0,0,2],     rounds:[1,2], qCount:[8,14],  thinkMs:[6000,24000],  missDay:0.10, betStyle:["0.001","0.002","0.001"] },
    { name:"HighRoller",  baseHours:[20,21,22,23], winRate:0.63, games:[0,0,2],     rounds:[1,2], qCount:[8,12],  thinkMs:[5000,20000],  missDay:0.12, betStyle:["0.002","0.005","0.001"] },
    { name:"Lurker",      baseHours:[14,15,23,0],  winRate:0.48, games:[0,1,0,2],   rounds:[1,1], qCount:[4,8],   thinkMs:[20000,90000], missDay:0.30, betStyle:["0.001"]                },
    { name:"AfterWork",   baseHours:[17,18,19,20], winRate:0.67, games:[0,0,2,0],   rounds:[1,2], qCount:[9,15],  thinkMs:[8000,28000],  missDay:0.15, betStyle:["0.001","0.002"]         },
  ];

  const p = {...base[wIdx % base.length]};

  // Rotate hours every 2 days — shifts +4 hours every 2 days
  // So NightOwl who plays 10pm might play 2am after 2 days, 6am after 4 days
  const rotation = Math.floor(dayNum / 2) * 4;
  p.hours = p.baseHours.map(h => (h + rotation) % 24);

  return p;
}

// ── SIMULATE A FULL QUIZ ROUND ────────────────────────────────
// Plays through questions locally, then sends ONE tx at the end
async function playQuizRound(contract, wallet, name, p){
  const cat = ri(0, QUIZ_CATEGORIES.length-1);
  const pool = [...QUIZ_CATEGORIES[cat]].sort(()=>Math.random()-0.5).slice(0, ri(6,10));

  log(name, `  📝 Starting quiz (${pool.length} questions, cat=${cat})`);

  let correct = 0;
  let totalThink = 0;

  for(let i=0; i<pool.length; i++){
    const q = pool[i];
    // Think time — reading the question
    const think = rms(p.thinkMs[0], p.thinkMs[1]);
    totalThink += think;
    await sleep(think);

    // Random distraction (10% chance)
    if(Math.random() < 0.10){
      const dist = ri(15000, 80000);
      log(name, `    ...distracted ${Math.round(dist/1000)}s`);
      await sleep(dist);
    }

    // Answer — based on win rate with some variance
    const variance = (Math.random()-0.5)*0.15;
    const won = Math.random() < (p.winRate + variance);
    if(won) correct++;

    log(name, `    Q${i+1}/${pool.length}: ${won?'✅':'❌'} (${Math.round(think/1000)}s think time)`);

    // Short gap between questions
    if(i < pool.length-1) await sleep(rms(1500, 5000));
  }

  log(name, `  📊 Round done: ${correct}/${pool.length} correct`);

  // ONE transaction for the whole round
  const won = correct >= Math.floor(pool.length/2);
  const xp  = 10 + (correct * 5);
  const bet = pick(p.betStyle);

  try{
    log(name, `  ⛓  Sending round tx (${bet} CELO, won=${won}, xp=${xp})...`);
    const tx = await contract.playGame(0, cat, won, xp, {
      value: ethers.parseEther(bet)
    });
    await tx.wait();
    log(name, `  ✅ TX confirmed! ${correct}/${pool.length} correct`);
    return true;
  }catch(e){
    if(e.message?.includes("insufficient")) log(name, `  ⚠️  Low balance for tx`);
    else log(name, `  ❌ TX failed: ${e.reason||e.message?.slice(0,50)}`);
    return false;
  }
}

// ── SIMULATE A FULL SPEED ROUND ───────────────────────────────
async function playSpeedRound(contract, wallet, name, p){
  const wordCount = ri(8, 20);
  log(name, `  ⚡ Starting speed round (${wordCount} words)`);

  let correct = 0;
  const duration = 60000; // 60 seconds
  const startTime = Date.now();

  for(let i=0; i<wordCount; i++){
    if(Date.now() - startTime > duration) break; // time up

    const word = pick(WORDS);
    // Think+type time (faster than quiz)
    const think = rms(2000, 12000);
    await sleep(think);

    const won = Math.random() < (p.winRate + 0.05); // speed players slightly better
    if(won) correct++;

    log(name, `    Word ${i+1}: ${won?'✅':'❌'} "${word}"`);
  }

  log(name, `  📊 Speed done: ${correct} correct`);

  // ONE transaction for the whole speed round
  const won = correct >= 5;
  const xp  = 10 + (correct * 4);
  const bet = pick(p.betStyle);

  try{
    log(name, `  ⛓  Sending speed tx (${bet} CELO)...`);
    const tx = await contract.playGame(2, ri(0,4), won, xp, {
      value: ethers.parseEther(bet)
    });
    await tx.wait();
    log(name, `  ✅ Speed TX confirmed!`);
    return true;
  }catch(e){
    log(name, `  ❌ Speed TX failed: ${e.reason||e.message?.slice(0,50)}`);
    return false;
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
    await sleep(rms(8000, 25000)); // look around after joining
    return true;
  }catch(e){
    log(name, `❌ Register failed: ${e.reason||e.message?.slice(0,50)}`);
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
    log(p.name, `⚠️  Balance too low (${fmt(bal)} CELO) — skipping`);
    return 0;
  }

  const ok = await ensureRegistered(contract, wallet, p.name, mainAddr);
  if(!ok) return 0;

  const rounds = ri(p.rounds[0], p.rounds[1]);
  log(p.name, `▶ Today's plan: ${rounds} round(s)`);

  let txCount = 0;

  for(let r=0; r<rounds; r++){
    if(r > 0){
      // Break between rounds — 20min to 2hrs
      const gap = ri(20, 120) * 60000;
      log(p.name, `  Break before round ${r+1}: ${Math.round(gap/60000)}min`);
      await sleep(gap);
    }

    // Pick game type for this round based on personality
    const gameType = pick(p.games);

    log(p.name, `  Round ${r+1}/${rounds} — ${gameType===2?'Speed':'Quiz'}`);

    let success = false;
    if(gameType === 2){
      success = await playSpeedRound(contract, wallet, p.name, p);
    } else {
      success = await playQuizRound(contract, wallet, p.name, p);
    }

    if(success) txCount++;

    // Sometimes check profile/leaderboard between rounds (just time delay)
    if(Math.random() < 0.3 && r < rounds-1){
      const browse = ri(30, 180) * 1000;
      log(p.name, `  Browsing leaderboard for ${Math.round(browse/1000)}s`);
      await sleep(browse);
    }
  }

  log(p.name, `✅ Session done — ${txCount} transactions (${rounds} rounds)`);
  return txCount;
}

// ── FUND ALTS ─────────────────────────────────────────────────
async function fundAlts(){
  if(!MAIN_KEY){ console.error("Set PRIVATE_KEY in .env"); return; }
  const provider = new ethers.JsonRpcProvider(RPC);
  const main = new ethers.Wallet(MAIN_KEY, provider);
  const mainBal = await provider.getBalance(main.address);
  console.log(`\n💰 Main: ${main.address} — ${fmt(mainBal)} CELO\n`);

  for(let i=0;i<KEYS.length;i++){
    const w = new ethers.Wallet(KEYS[i], provider);
    const bal = await provider.getBalance(w.address);
    const p = getPersonality(i, 0);
    console.log(`W${i+1} [${p.name.padEnd(12)}]: ${w.address.slice(0,10)}... — ${fmt(bal)} CELO`);
    if(bal < ethers.parseEther("0.003")){
      try{
        const tx = await main.sendTransaction({to:w.address, value:ethers.parseEther("0.005")});
        await tx.wait();
        console.log(`   ✅ Sent 0.005 CELO`);
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

  for(let i=0;i<KEYS.length;i++){
    const p = getPersonality(i,0);
    const w = new ethers.Wallet(KEYS[i], provider);
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
    console.log(`  W${i+1} [${p.name.padEnd(12)}] ${w.address.slice(0,12)}...`);
    console.log(`       Balance: ${fmt(bal)} CELO | Today's hours: ${p.baseHours.join(', ')}`);
    if(stats) console.log(`       Games: ${stats.games} | Wins: ${stats.wins} | XP: ${stats.xp} | Lvl: ${stats.level} | 🔥${stats.streak}`);
    else       console.log(`       Status: Not registered`);
    console.log();
  }
}

// ── DAILY SCHEDULER ───────────────────────────────────────────
async function runDaily(){
  console.log(`\n${'╔'+'═'.repeat(48)+'╗'}`);
  console.log(`║   CeloArcade Bot — Running 24/7               ║`);
  console.log(`${'╚'+'═'.repeat(48)+'╝'}`);
  console.log(`  Wallets:  ${KEYS.length}`);
  console.log(`  Contract: ${CONTRACT}\n`);
  if(!KEYS.length){ console.error("No wallets in .env"); process.exit(1); }

  const mainAddr = process.env.MAIN_WALLET_ADDRESS || ethers.ZeroAddress;
  let day = 0;

  while(true){
    day++;
    console.log(`\n${'═'.repeat(52)}`);
    console.log(`  DAY ${day} — ${new Date().toDateString()}`);
    console.log(`${'═'.repeat(52)}\n`);

    // Shuffle order each day
    const order = [...Array(KEYS.length).keys()].sort(()=>Math.random()-0.5);

    // Run all wallets concurrently with their own schedules
    const promises = order.map(async (wIdx) => {
      const p = getPersonality(wIdx, day);

      // Skip day check
      if(Math.random() < p.missDay){
        log(p.name, `Taking today off (day ${day})`);
        return 0;
      }

      // Wait until their active hour for today (rotated)
      const now = new Date();
      const curHour = now.getHours();
      const targetHour = pick(p.hours);

      let waitMs = 0;
      if(!p.hours.includes(curHour)){
        const target = new Date();
        target.setHours(targetHour, ri(0,59), ri(0,59), 0);
        if(target <= now) target.setDate(target.getDate()+1);
        waitMs = (target - now) + ri(0, 30)*60000; // up to 30min random offset
        log(p.name, `Day ${day} hours: [${p.hours.join(',')}] — starts at ${targetHour}:xx (+${Math.round(waitMs/60000)}min)`);
      } else {
        waitMs = ri(0, 25)*60000;
        log(p.name, `Active now — starting in ${Math.round(waitMs/60000)}min`);
      }

      await sleep(waitMs);
      return await runSession(KEYS[wIdx], wIdx, mainAddr, day);
    });

    const results = await Promise.all(promises);
    const dayTotal = results.reduce((a,b)=>a+b,0);
    console.log(`\n📊 Day ${day}: ${dayTotal} total transactions`);

    // Sleep to next day + random offset
    const now = new Date();
    const midnight = new Date(); midnight.setHours(24,0,0,0);
    const wait = (midnight-now) + ri(5,45)*60000;
    console.log(`⏰ Next day in ${(wait/3600000).toFixed(1)}h`);
    await sleep(wait);
  }
}

// ── ONCE MODE ─────────────────────────────────────────────────
async function runOnce(){
  console.log("\n🧪 Test run — all wallets, one session each\n");
  const mainAddr = process.env.MAIN_WALLET_ADDRESS || ethers.ZeroAddress;
  let total = 0;
  for(let i=0;i<KEYS.length;i++){
    if(i>0){
      const gap = ri(60000, 180000);
      console.log(`\n⏳ Next wallet in ${Math.round(gap/60000)}min\n`);
      await sleep(gap);
    }
    const txs = await runSession(KEYS[i], i, mainAddr, 1);
    total += txs;
  }
  console.log(`\n✅ Done — ${total} total transactions`);
}

// ── SINGLE WALLET ─────────────────────────────────────────────
async function runSingle(n){
  const mainAddr = process.env.MAIN_WALLET_ADDRESS || ethers.ZeroAddress;
  const idx = n-1;
  if(!KEYS[idx]){ console.error(`No wallet #${n}`); return; }
  const p = getPersonality(idx, 1);
  console.log(`\n🎯 Running wallet #${n} (${p.name})\n`);
  const txs = await runSession(KEYS[idx], idx, mainAddr, 1);
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
