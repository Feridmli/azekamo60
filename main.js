import { Buffer } from "buffer";
window.Buffer = window.Buffer || Buffer;

import { ethers } from "ethers";
import { Seaport } from "@opensea/seaport-js";

// ==========================================
// 1. KONFIQURASIYA
// ==========================================

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "https://azekamo50.onrender.com";
const NFT_CONTRACT_ADDRESS = import.meta.env.VITE_NFT_CONTRACT || "0x54a88333F6e7540eA982261301309048aC431eD5";
const SEAPORT_CONTRACT_ADDRESS = "0x0000000000000068F116a894984e2DB1123eB395";

const APECHAIN_ID = 33139;
const APECHAIN_ID_HEX = "0x8173";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

// Qlobal Dəyişənlər
let provider = null;
let signer = null;
let seaport = null;
let userAddress = null;

// Seçilmiş NFT-lərin ID-lərini saxlayan anbar
let selectedTokens = new Set();

// HTML Elementləri (Index.html ilə uyğunlaşdırıldı)
const connectWalletBtn = document.getElementById("connect-wallet");
const nftContainer = document.getElementById("nft-container");
const listBtn = document.getElementById("list-btn"); // HTML-dəki "Listələ" düyməsi
const selectAllCheckbox = document.getElementById("select-all-checkbox"); // Hamısını seç qutusu

// ==========================================
// 2. KÖMƏKÇİ FUNKSİYALAR
// ==========================================

function resolveIPFS(url) {
  if (!url) return "https://via.placeholder.com/300?text=No+Image";
  const GATEWAY = "https://cloudflare-ipfs.com/ipfs/";
  if (url.startsWith("ipfs://")) return url.replace("ipfs://", GATEWAY);
  if (url.startsWith("Qm") && url.length >= 46) return `${GATEWAY}${url}`;
  return url;
}

// Seaport Order təmizləyici
function cleanOrder(orderData) {
  try {
    const order = orderData.order || orderData;
    const { parameters, signature } = order;
    if (!parameters) return null;
    const safeStr = (val) => (val !== undefined && val !== null) ? val.toString() : "0";
    return {
      parameters: {
        offerer: parameters.offerer,
        zone: parameters.zone,
        offer: parameters.offer.map(item => ({
          itemType: Number(item.itemType),
          token: item.token,
          identifierOrCriteria: safeStr(item.identifierOrCriteria),
          startAmount: safeStr(item.startAmount),
          endAmount: safeStr(item.endAmount)
        })),
        consideration: parameters.consideration.map(item => ({
          itemType: Number(item.itemType),
          token: item.token,
          identifierOrCriteria: safeStr(item.identifierOrCriteria),
          startAmount: safeStr(item.startAmount),
          endAmount: safeStr(item.endAmount),
          recipient: item.recipient
        })),
        orderType: Number(parameters.orderType),
        startTime: safeStr(parameters.startTime),
        endTime: safeStr(parameters.endTime),
        zoneHash: parameters.zoneHash,
        salt: safeStr(parameters.salt),
        conduitKey: parameters.conduitKey,
        totalOriginalConsiderationItems: Number(parameters.totalOriginalConsiderationItems)
      },
      signature: signature
    };
  } catch (e) { return null; }
}

function orderToJsonSafe(obj) {
  return JSON.parse(JSON.stringify(obj, (k, v) => {
    if (v && typeof v === "object") {
      if (ethers.BigNumber.isBigNumber(v)) return v.toString();
      if (v._hex) return ethers.BigNumber.from(v._hex).toString();
    }
    return v;
  }));
}

// ==========================================
// 3. CÜZDAN QOŞULMASI
// ==========================================

async function connectWallet() {
  try {
    if (!window.ethereum) return alert("Metamask tapılmadı!");
    provider = new ethers.providers.Web3Provider(window.ethereum, "any");
    await provider.send("eth_requestAccounts", []);
    
    const network = await provider.getNetwork();
    if (network.chainId !== APECHAIN_ID) {
      try {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [{
            chainId: APECHAIN_ID_HEX,
            chainName: "ApeChain Mainnet",
            nativeCurrency: { name: "APE", symbol: "APE", decimals: 18 },
            rpcUrls: ["https://rpc.apechain.com"],
            blockExplorerUrls: ["https://apescan.io"],
          }],
        });
        provider = new ethers.providers.Web3Provider(window.ethereum, "any");
      } catch (e) { return alert("Şəbəkə xətası. Zəhmət olmasa ApeChain-i seçin."); }
    }

    signer = provider.getSigner();
    userAddress = (await signer.getAddress()).toLowerCase();
    seaport = new Seaport(signer, { overrides: { contractAddress: SEAPORT_CONTRACT_ADDRESS } });
    
    // Düymənin yazısını dəyiş
    if(connectWalletBtn) connectWalletBtn.textContent = `${userAddress.slice(0, 6)}...${userAddress.slice(-4)}`;
    
    console.log("Cüzdan qoşuldu:", userAddress);
    await loadNFTs();

  } catch (err) { console.error(err); alert("Connect xətası: " + err.message); }
}

if(connectWalletBtn) connectWalletBtn.onclick = connectWallet;

// ==========================================
// 4. NFT YÜKLƏMƏ VƏ HTML YARATMA
// ==========================================

async function loadNFTs() {
  nftContainer.innerHTML = "<p style='text-align:center; width:100%;'>Yüklənir...</p>";
  selectedTokens.clear(); // Siyahını təmizlə

  try {
    const res = await fetch(`${BACKEND_URL}/api/nfts`);
    const data = await res.json();
    const allNFTs = data.nfts || [];
    nftContainer.innerHTML = "";

    if (allNFTs.length === 0) {
      nftContainer.innerHTML = "<p>Hələ NFT yoxdur.</p>";
      return;
    }

    for (const nft of allNFTs) {
      const tokenid = nft.tokenid;
      const name = nft.name || `Ape #${tokenid}`;
      const image = resolveIPFS(nft.image);
      const isListed = (nft.price && parseFloat(nft.price) > 0);
      const priceText = isListed ? `${nft.price} APE` : "Satışda deyil";

      // Sahibi yoxlayırıq (Sadəlik üçün burada sadəcə seller_address yoxlanılır)
      const isSeller = (userAddress && nft.seller_address && userAddress.toLowerCase() === nft.seller_address.toLowerCase());
      
      // Kart HTML-i
      const card = document.createElement("div");
      card.className = "nft-card";
      
      // Checkbox (yalnız öz NFT-lərimiz və ya hamısı üçün görünə bilər, ssenariyə uyğun)
      // Burada hər kəsə göstəririk, amma list logic-də yoxlayacağıq
      const checkboxHTML = `<input type="checkbox" class="card-checkbox" data-id="${tokenid}">`;

      // Button Logic
      let actionBtnHTML = "";
      if (isListed) {
          // Əgər mənimdirsə Update, deyilsə Buy
          if (isSeller) {
              actionBtnHTML = `<button class="btn" style="background:#f39c12; color:white; width:100%; margin-top:10px;">Qiyməti Dəyiş</button>`; 
          } else {
              actionBtnHTML = `<button class="btn btn-buy" onclick="buyNFT('${tokenid}', '${nft.order_hash}')" style="width:100%; margin-top:10px;">Al: ${priceText}</button>`;
          }
      } else {
          // Listələnməyib
           actionBtnHTML = `<div style="text-align:center; color:#888; margin-top:10px; font-size:12px;">Seçib Listələyin</div>`;
      }

      card.innerHTML = `
        ${checkboxHTML}
        <img src="${image}" class="nft-image" alt="${name}">
        <div class="nft-info">
            <div class="nft-name">${name}</div>
            <div class="nft-price">${priceText}</div>
            ${actionBtnHTML}
        </div>
      `;
      
      nftContainer.appendChild(card);
    }

    // Checkbox hadisələri
    document.querySelectorAll('.card-checkbox').forEach(box => {
        box.addEventListener('change', (e) => {
            const tid = e.target.getAttribute('data-id');
            if (e.target.checked) selectedTokens.add(tid);
            else selectedTokens.delete(tid);
            console.log("Seçildi:", Array.from(selectedTokens));
        });
    });

  } catch (err) {
    console.error(err);
    nftContainer.innerHTML = "<p>Yüklənmə xətası.</p>";
  }
}

// ==========================================
// 5. HAMISINI SEÇMƏ (SELECT ALL)
// ==========================================

if (selectAllCheckbox) {
    selectAllCheckbox.addEventListener('change', (e) => {
        const isChecked = e.target.checked;
        const allBoxes = document.querySelectorAll('.card-checkbox');
        
        allBoxes.forEach(box => {
            box.checked = isChecked;
            const tid = box.getAttribute('data-id');
            if (isChecked) selectedTokens.add(tid);
            else selectedTokens.delete(tid);
        });
    });
}

// ==========================================
// 6. TOPLU LISTƏLƏMƏ (BULK LIST)
// ==========================================

if (listBtn) {
    listBtn.onclick = async () => {
        if (!signer) return alert("Zəhmət olmasa əvvəl cüzdanı qoşun.");
        if (selectedTokens.size === 0) return alert("Heç bir NFT seçilməyib!");

        // Qiyməti soruşuruq (Sadə və effektiv yol)
        const priceInput = prompt(`Seçilmiş ${selectedTokens.size} NFT üçün qiyməti daxil edin (APE ilə):`);
        if (!priceInput) return;

        const priceWei = ethers.utils.parseEther(priceInput);
        const tokensArray = Array.from(selectedTokens);

        await bulkListNFTs(tokensArray, priceWei);
    };
}

async function bulkListNFTs(tokenIds, priceWei) {
    try {
        const seller = await signer.getAddress();
        console.log("Toplu satış başlayır...", tokenIds);

        // 1. Approve Yoxlanışı (Contract səviyyəsində)
        const nftContract = new ethers.Contract(NFT_CONTRACT_ADDRESS, 
            ["function isApprovedForAll(address,address) view returns(bool)", "function setApprovalForAll(address,bool)"], signer);
        
        const isApproved = await nftContract.isApprovedForAll(seller, SEAPORT_CONTRACT_ADDRESS);
        if (!isApproved) {
            const tx = await nftContract.setApprovalForAll(SEAPORT_CONTRACT_ADDRESS, true);
            await tx.wait();
            console.log("Approve verildi.");
        }

        // 2. Order Inputs Hazırlanması (Hər biri eyni qiymətə)
        const orderInputs = tokenIds.map(tokenStr => {
            return {
                offer: [{ 
                    itemType: 2, // ERC721
                    token: NFT_CONTRACT_ADDRESS, 
                    identifier: tokenStr 
                }],
                consideration: [{ 
                    itemType: 0, // Native Token (APE)
                    token: ZERO_ADDRESS, 
                    identifier: "0", 
                    amount: priceWei.toString(),
                    recipient: seller 
                }],
                startTime: (Math.floor(Date.now()/1000)).toString(),
                endTime: (Math.floor(Date.now()/1000) + 2592000).toString(), // 30 gün
            };
        });

        // 3. Tək İmza ilə Order Yaratmaq
        const { executeAllActions } = await seaport.createBulkOrders(orderInputs, seller);
        const signedOrders = await executeAllActions(); 

        // 4. Backendə göndərmək
        for (const order of signedOrders) {
            const offerItem = order.parameters.offer[0];
            const tokenStr = offerItem.identifierOrCriteria; // NFT ID
            const orderHash = seaport.getOrderHash(order.parameters);
            const plainOrder = orderToJsonSafe(order);

            await fetch(`${BACKEND_URL}/api/order`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    tokenid: tokenStr,
                    price: ethers.utils.formatEther(priceWei),
                    seller_address: seller,
                    seaport_order: plainOrder,
                    order_hash: orderHash,
                    status: "active"
                }),
            });
        }

        alert("Uğurlu! NFT-lər satışa çıxarıldı.");
        window.location.reload();

    } catch (err) {
        console.error(err);
        alert("Xəta baş verdi: " + err.message);
    }
}

// ==========================================
// 7. BUY FUNCTION (SATIN ALMAQ)
// ==========================================

// Global funksiya kimi təyin edirik ki, HTML-dən onclick ilə çağırıla bilsin
window.buyNFT = async (tokenid, orderHash) => {
    if (!signer) return alert("Cüzdan qoşulmayıb!");
    
    try {
        // Backend-dən order məlumatını alırıq (Order Hash ilə)
        // QEYD: Sizdə order_hash ilə birbaşa orderi qaytaran API olmalıdır
        // Və ya nfts siyahısında order məlumatı gəlməlidir.
        // Gəlin siyahıdan tapaq (sadəlik üçün allNFTs array-i global edə bilərik, amma burda fetch edək)
        
        const res = await fetch(`${BACKEND_URL}/api/nfts`);
        const data = await res.json();
        const nftRecord = data.nfts.find(n => n.tokenid == tokenid);

        if (!nftRecord || !nftRecord.seaport_order) return alert("Order tapılmadı.");

        const buyerAddress = await signer.getAddress();
        let rawJson = nftRecord.seaport_order;
        if (typeof rawJson === "string") rawJson = JSON.parse(rawJson);

        const cleanOrd = cleanOrder(rawJson);
        const { actions } = await seaport.fulfillOrder({ order: cleanOrd, accountAddress: buyerAddress });
        
        const txRequest = await actions[0].transactionMethods.buildTransaction();
        const tx = await signer.sendTransaction(txRequest); // Metamask açılır
        await tx.wait();

        // Backend-ə satıldığını bildir
        await fetch(`${BACKEND_URL}/api/buy`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ 
                tokenid: tokenid, 
                order_hash: nftRecord.order_hash, 
                buyer_address: buyerAddress 
            }),
        });

        alert("Təbrik edirik! NFT alındı.");
        window.location.reload();

    } catch (err) {
        console.error(err);
        alert("Buy Xətası: " + err.message);
    }
};

// Səhifə açılanda yüklə
window.addEventListener('DOMContentLoaded', loadNFTs);
