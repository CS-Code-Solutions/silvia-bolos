/* ==========================================================================
   SILVIA BOLOS - LÓGICA DA VITRINE, CARRINHO WHATSAPP E PAINEL ADMIN
   ========================================================================== */

// Configuração do Firebase
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAcxCipS6-6WTVO0cWPuDO1F3DkGRWpI4E",
  authDomain: "batato-ec659.firebaseapp.com",
  projectId: "batato-ec659",
  storageBucket: "batato-ec659.firebasestorage.app",
  messagingSenderId: "367636863162",
  appId: "1:367636863162:web:91be711688c992f0350a83"
};

// Configurações da Loja (Coleção exclusiva para não conflitar com outro projeto)
const STORE_CONFIG = {
  whatsappNumber: "555192032068", // +55 51 9203-2068
  firestoreCollection: "silvia_bolos_produtos",
  bannerCollection: "silvia_bolos_banner",
  bannerDocId: "topo",
  storageCartKey: "silvia_bolos_cart_v1"
};

const DEFAULT_BANNER = {
  title: "O bolo perfeito para seus melhores momentos",
  imageBase64: "https://images.unsplash.com/photo-1578985545062-69928b1d9587?auto=format&fit=crop&w=1400&q=80"
};

// Inicialização do Firebase
if (!firebase.apps.length) {
  firebase.initializeApp(FIREBASE_CONFIG);
}
const db = firebase.firestore();
const auth = firebase.auth ? firebase.auth() : null;

// Cache local dos produtos e banner
let cachedProducts = [];
let cachedBanner = { ...DEFAULT_BANNER };
let currentUploadedBannerBase64 = "";

// Tabela Oficial de Tamanhos e Preços
const CAKE_SIZES = [
  { id: "12-red", label: "12 fatias redondo", price: 30.00 },
  { id: "15-comp", label: "15 fatias comprido", price: 70.00 },
  { id: "20-quad", label: "20 fatias quadrado", price: 95.00 },
  { id: "20-red", label: "20 fatias redondo", price: 95.00 },
  { id: "25-red", label: "25 fatias redondo", price: 100.00 },
  { id: "30-quad", label: "30 fatias quadrado", price: 105.00 },
  { id: "35-red", label: "35 fatias redondo", price: 110.00 },
  { id: "40-quad", label: "40 fatias quadrado", price: 115.00 },
  { id: "60-quad", label: "60 fatias quadrado", price: 145.00 }
];

// Lista Oficial de Recheios
const FILLINGS = [
  "Pavê",
  "Nata",
  "Branquinho",
  "Brigadeiro",
  "Mousse de chocolate",
  "Chantilly de amendoim",
  "Ovos moles",
  "Doce de leite"
];

// Lista Oficial de Complementos
const TOPPINGS = [
  "Morango",
  "Abacaxi",
  "Pêssego",
  "Coco",
  "Bombom",
  "Lasca de chocolate"
];

// Estado do Montador Personalizado
let builderState = {
  sizeIndex: 0,
  fillings: [],
  toppings: [],
  decor: "",
  audience: "Adulto"
};

// Base64 temporário no modal de produto do Admin
let currentUploadedBase64 = "";

/* ==========================================================================
   UTILITÁRIOS DE DADOS & FORMATAÇÃO
   ========================================================================== */

function formatBRL(value) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function getCart() {
  try {
    return JSON.parse(localStorage.getItem(STORE_CONFIG.storageCartKey)) || [];
  } catch {
    return [];
  }
}

function saveCart(cart) {
  localStorage.setItem(STORE_CONFIG.storageCartKey, JSON.stringify(cart));
  updateCartBadge();
}

function showToast(message) {
  const toast = document.getElementById("toast");
  const text = document.getElementById("toast-text");
  if (!toast || !text) return;

  text.textContent = message;
  toast.classList.remove("hidden");
  toast.classList.add("flex");

  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => {
    toast.classList.add("hidden");
    toast.classList.remove("flex");
  }, 2800);
}

/* ==========================================================================
   LEITURA EM TEMPO REAL DO FIRESTORE (PRODUTOS & BANNER)
   ========================================================================== */

function subscribeProducts(onUpdateCallback) {
  db.collection(STORE_CONFIG.firestoreCollection)
    .orderBy("createdAt", "desc")
    .onSnapshot(
      (snapshot) => {
        cachedProducts = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data()
        }));
        if (onUpdateCallback) onUpdateCallback(cachedProducts);
      },
      (error) => {
        console.error("Erro ao carregar produtos do Firestore:", error);
        if (onUpdateCallback) onUpdateCallback([]);
      }
    );
}

function subscribeBanner() {
  db.collection(STORE_CONFIG.bannerCollection)
    .doc(STORE_CONFIG.bannerDocId)
    .onSnapshot(
      (doc) => {
        if (doc.exists) {
          cachedBanner = {
            ...DEFAULT_BANNER,
            ...doc.data()
          };
        } else {
          cachedBanner = { ...DEFAULT_BANNER };
        }
        applyBannerToPage(cachedBanner);
      },
      (error) => {
        console.error("Erro ao carregar banner:", error);
        applyBannerToPage(DEFAULT_BANNER);
      }
    );
}

function applyBannerToPage(bannerData) {
  const imgEl = document.getElementById("top-banner-img");
  const h1El = document.querySelector("#top-banner-img")?.closest("section")?.querySelector("h1");

  if (imgEl && bannerData.imageBase64) {
    imgEl.src = bannerData.imageBase64;
  }
  if (h1El && bannerData.title) {
    h1El.textContent = bannerData.title;
  }
}

/* ==========================================================================
   INICIALIZAÇÃO AUTOMÁTICA DA PÁGINA
   ========================================================================== */

document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("sizes-grid")) {
    subscribeBanner();
    renderBuilderOptions();
    updateBuilderSummary();
    updateCartBadge();
    renderCartDrawer();
    renderShowcaseLoading();
    subscribeProducts(renderShowcase);
  }

  if (document.getElementById("admin-login-view")) {
    subscribeBanner();
    initAdminPage();
  }

  if (window.lucide) {
    lucide.createIcons();
  }
});

/* ==========================================================================
   LÓGICA DA VITRINE E MONTADOR (INDEX.HTML)
   ========================================================================== */

function renderBuilderOptions() {
  const sizesGrid = document.getElementById("sizes-grid");
  sizesGrid.innerHTML = CAKE_SIZES.map((item, index) => `
    <button
      type="button"
      onclick="selectSize(${index})"
      class="size-card ${index === builderState.sizeIndex ? "active" : ""} text-left p-3.5 rounded-2xl border border-[#E6D5C3] bg-white flex items-center justify-between gap-2 cursor-pointer"
    >
      <span class="text-xs sm:text-sm font-semibold text-[#3B2823]">${item.label}</span>
      <span class="text-xs font-bold text-[#BE3E5B] whitespace-nowrap">${formatBRL(item.price)}</span>
    </button>
  `).join("");

  const fillingsList = document.getElementById("fillings-list");
  fillingsList.innerHTML = FILLINGS.map(filling => {
    const isSelected = builderState.fillings.includes(filling);
    return `
      <button
        type="button"
        onclick="toggleFilling('${filling}')"
        class="choice-pill ${isSelected ? "active" : ""} px-3.5 py-2 rounded-full border border-[#E4D3C3] text-xs font-semibold text-[#4E3831] cursor-pointer"
      >
        ${filling}
      </button>
    `;
  }).join("");

  const toppingsList = document.getElementById("toppings-list");
  toppingsList.innerHTML = TOPPINGS.map(topping => {
    const isSelected = builderState.toppings.includes(topping);
    return `
      <button
        type="button"
        onclick="toggleTopping('${topping}')"
        class="choice-pill ${isSelected ? "active" : ""} px-3.5 py-2 rounded-full border border-[#E4D3C3] text-xs font-semibold text-[#4E3831] cursor-pointer"
      >
        ${topping}
      </button>
    `;
  }).join("");
}

function selectSize(index) {
  builderState.sizeIndex = index;
  renderBuilderOptions();
  updateBuilderSummary();
}

function toggleFilling(filling) {
  const idx = builderState.fillings.indexOf(filling);
  if (idx > -1) {
    builderState.fillings.splice(idx, 1);
  } else {
    builderState.fillings.push(filling);
  }
  renderBuilderOptions();
  updateBuilderSummary();
}

function toggleTopping(topping) {
  const idx = builderState.toppings.indexOf(topping);
  if (idx > -1) {
    builderState.toppings.splice(idx, 1);
  } else {
    builderState.toppings.push(topping);
  }
  renderBuilderOptions();
  updateBuilderSummary();
}

function selectAudience(audience) {
  builderState.audience = audience;
  const btnAdulto = document.getElementById("btn-audience-adulto");
  const btnCrianca = document.getElementById("btn-audience-crianca");

  btnAdulto.classList.toggle("active", audience === "Adulto");
  btnCrianca.classList.toggle("active", audience === "Criança");
  updateBuilderSummary();
}

function updateBuilderSummary() {
  const sizeObj = CAKE_SIZES[builderState.sizeIndex];
  const decorInput = document.getElementById("builder-decor");
  builderState.decor = decorInput ? decorInput.value.trim() : "";

  document.getElementById("summary-size").textContent = sizeObj.label;
  document.getElementById("summary-fillings").textContent =
    builderState.fillings.length > 0 ? builderState.fillings.join(", ") : "Nenhum selecionado";
  document.getElementById("summary-toppings").textContent =
    builderState.toppings.length > 0 ? builderState.toppings.join(", ") : "Nenhum";
  document.getElementById("summary-decor").textContent =
    builderState.decor || "A combinar";
  document.getElementById("summary-audience").textContent = builderState.audience;
  document.getElementById("summary-price").textContent = formatBRL(sizeObj.price);
}

function addCustomCakeToCart() {
  if (builderState.fillings.length === 0) {
    showToast("Escolha pelo menos 1 recheio para o seu bolo!");
    return;
  }

  const sizeObj = CAKE_SIZES[builderState.sizeIndex];
  const cart = getCart();

  cart.push({
    id: "item-" + Date.now(),
    title: `Bolo Personalizado (${sizeObj.label})`,
    size: sizeObj.label,
    fillings: [...builderState.fillings],
    toppings: [...builderState.toppings],
    decor: builderState.decor || "A combinar",
    audience: builderState.audience,
    price: sizeObj.price
  });

  saveCart(cart);
  renderCartDrawer();
  showToast("Bolo adicionado à sua encomenda!");
  openCart();
}

function renderShowcaseLoading() {
  const grid = document.getElementById("showcase-grid");
  if (!grid) return;
  grid.innerHTML = `
    <div class="col-span-full text-center py-10 text-xs text-[#8A6D64]">
      Carregando bolos da vitrine...
    </div>
  `;
}

function renderShowcase(products) {
  const grid = document.getElementById("showcase-grid");
  if (!grid) return;

  if (!products || products.length === 0) {
    grid.innerHTML = `
      <div class="col-span-full text-center py-10 px-4 bg-white rounded-3xl border border-dashed border-[#E4D3C3]">
        <p class="text-sm font-semibold text-[#3B2823]">Em breve novidades na vitrine!</p>
        <p class="text-xs text-[#8A6D64] mt-1">Você já pode montar seu bolo personalizado acima.</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = products.map(prod => {
    const sizeObj = CAKE_SIZES[prod.sizeIndex] || CAKE_SIZES[0];
    return `
      <article class="bg-white rounded-3xl border border-[#EFE2D6] overflow-hidden shadow-sm hover:shadow-md transition flex flex-col">
        <div class="aspect-[4/3] w-full overflow-hidden bg-[#FAF3EB]">
          <img src="${prod.imageBase64}" alt="${prod.name}" class="w-full h-full object-cover hover:scale-105 transition-transform duration-500" />
        </div>
        <div class="p-5 flex-1 flex flex-col justify-between space-y-4">
          <div>
            <div class="flex items-start justify-between gap-2">
              <h3 class="font-serif-title text-lg font-bold text-[#3B2823] leading-snug">${prod.name}</h3>
              <span class="text-xs font-bold px-2.5 py-1 rounded-full bg-[#FDF2F4] text-[#BE3E5B] whitespace-nowrap">
                ${formatBRL(sizeObj.price)}
              </span>
            </div>
            <p class="text-xs text-[#785B52] mt-2 leading-relaxed">
              <strong class="text-[#3B2823]">Recheio:</strong> ${prod.filling}
            </p>
            <p class="text-[11px] text-[#9C7B70] mt-1">Base: ${sizeObj.label}</p>
          </div>

          <button
            type="button"
            onclick="addShowcaseProductToCart('${prod.id}')"
            class="w-full py-2.5 px-4 rounded-xl bg-[#FDF2F4] hover:bg-[#BE3E5B] text-[#BE3E5B] hover:text-white font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer"
          >
            <i data-lucide="shopping-bag" class="w-4 h-4"></i>
            Adicionar à Encomenda
          </button>
        </div>
      </article>
    `;
  }).join("");

  if (window.lucide) lucide.createIcons();
}

function addShowcaseProductToCart(productId) {
  const prod = cachedProducts.find(p => p.id === productId);
  if (!prod) return;

  const sizeObj = CAKE_SIZES[prod.sizeIndex] || CAKE_SIZES[0];
  const cart = getCart();

  cart.push({
    id: "item-" + Date.now(),
    title: prod.name,
    size: sizeObj.label,
    fillings: [prod.filling],
    toppings: [],
    decor: "Padrão da vitrine (ou enviar inspiração no WhatsApp)",
    audience: "Adulto",
    price: sizeObj.price
  });

  saveCart(cart);
  renderCartDrawer();
  showToast(`"${prod.name}" adicionado!`);
  openCart();
}

/* ==========================================================================
   CARRINHO E CHECKOUT WHATSAPP
   ========================================================================== */

function updateCartBadge() {
  const badge = document.getElementById("cart-badge");
  if (!badge) return;
  badge.textContent = getCart().length;
}

function openCart() {
  const backdrop = document.getElementById("cart-backdrop");
  const drawer = document.getElementById("cart-drawer");
  if (!backdrop || !drawer) return;

  renderCartDrawer();
  backdrop.classList.remove("hidden");
  requestAnimationFrame(() => {
    backdrop.classList.remove("opacity-0");
    drawer.classList.remove("translate-x-full");
  });
}

function closeCart() {
  const backdrop = document.getElementById("cart-backdrop");
  const drawer = document.getElementById("cart-drawer");
  if (!backdrop || !drawer) return;

  backdrop.classList.add("opacity-0");
  drawer.classList.add("translate-x-full");
  setTimeout(() => {
    backdrop.classList.add("hidden");
  }, 280);
}

function removeCartItem(index) {
  const cart = getCart();
  cart.splice(index, 1);
  saveCart(cart);
  renderCartDrawer();
}

function renderCartDrawer() {
  const container = document.getElementById("cart-items-container");
  const totalEl = document.getElementById("cart-total");
  const formSection = document.getElementById("checkout-form-section");
  const previewBox = document.getElementById("whatsapp-preview-box");

  if (!container) return;

  const cart = getCart();

  if (cart.length === 0) {
    container.innerHTML = `
      <div class="text-center py-8 px-4 bg-white rounded-2xl border border-dashed border-[#E4D3C3]">
        <p class="text-sm font-semibold text-[#3B2823]">Sua encomenda está vazia</p>
        <p class="text-xs text-[#8A6D64] mt-1">Monte seu bolo acima ou escolha uma opção da vitrine.</p>
      </div>
    `;
    totalEl.textContent = formatBRL(0);
    if (formSection) formSection.classList.add("hidden");
    if (previewBox) previewBox.classList.add("hidden");
    return;
  }

  if (formSection) formSection.classList.remove("hidden");
  if (previewBox) previewBox.classList.remove("hidden");

  let total = 0;

  container.innerHTML = cart.map((item, idx) => {
    total += item.price;
    const toppingsText = item.toppings && item.toppings.length > 0
      ? `<p class="text-[11px] text-[#785B52]"><strong>Complementos:</strong> ${item.toppings.join(", ")}</p>`
      : "";

    return `
      <div class="bg-white p-3.5 rounded-2xl border border-[#EFE2D6] flex items-start justify-between gap-3">
        <div class="space-y-1 text-xs">
          <p class="font-bold text-[#3B2823]">${item.title}</p>
          <p class="text-[11px] text-[#785B52]"><strong>Recheios:</strong> ${item.fillings.join(", ")}</p>
          ${toppingsText}
          <p class="text-[11px] text-[#785B52]"><strong>Decoração:</strong> ${item.decor} (${item.audience})</p>
          <p class="text-xs font-bold text-[#BE3E5B] pt-0.5">${formatBRL(item.price)}</p>
        </div>
        <button type="button" onclick="removeCartItem(${idx})" title="Remover item" class="p-1.5 rounded-lg text-[#9C7B70] hover:text-red-600 hover:bg-red-50 transition cursor-pointer">
          <i data-lucide="trash-2" class="w-4 h-4"></i>
        </button>
      </div>
    `;
  }).join("");

  totalEl.textContent = formatBRL(total);
  refreshWhatsAppPreview();
  if (window.lucide) lucide.createIcons();
}

function buildWhatsAppOrderText() {
  const cart = getCart();
  const name = document.getElementById("order-name")?.value.trim() || "Não informado";
  const rawDate = document.getElementById("order-date")?.value || "";
  const time = document.getElementById("order-time")?.value || "Não informado";
  const payment = document.getElementById("order-payment")?.value || "Pix";

  let formattedDate = "Não informada";
  if (rawDate) {
    const [y, m, d] = rawDate.split("-");
    formattedDate = `${d}/${m}/${y}`;
  }

  let total = 0;
  const itemsFormatted = cart.map((item, i) => {
    total += item.price;
    const compLine = item.toppings && item.toppings.length > 0
      ? `\nComplementos: ${item.toppings.join(", ")}`
      : "";

    const prefix = cart.length > 1 ? `\n*Bolo ${i + 1}:*\n` : "\n";
    return `${prefix}Tamanho: ${item.size}\nRecheios: ${item.fillings.join(", ")}${compLine}\nCor / decoração: ${item.decor}\nAdulto ou criança: ${item.audience}\nValor: ${formatBRL(item.price)}`;
  }).join("\n");

  return `*Encomenda - Silvia Bolos* 🍰

Nome: ${name}
Data de retirada: ${formattedDate}
Horário: ${time}
Forma de pagamento: ${payment}
${itemsFormatted}

*Total Estimado: ${formatBRL(total)}*
_(Encaminhando foto de inspiração em seguida, se houver 📸)_`;
}

function refreshWhatsAppPreview() {
  const previewEl = document.getElementById("whatsapp-message-preview");
  if (!previewEl) return;
  previewEl.textContent = buildWhatsAppOrderText();
}

function copyOrderText() {
  const text = buildWhatsAppOrderText();
  navigator.clipboard.writeText(text).then(() => {
    showToast("Texto da encomenda copiado!");
  });
}

function sendOrderToWhatsApp() {
  const cart = getCart();
  if (cart.length === 0) {
    showToast("Adicione pelo menos um bolo antes de finalizar.");
    return;
  }

  const name = document.getElementById("order-name")?.value.trim();
  const date = document.getElementById("order-date")?.value;
  const time = document.getElementById("order-time")?.value;

  if (!name || !date || !time) {
    showToast("Preencha Nome, Data e Horário de retirada!");
    return;
  }

  const message = encodeURIComponent(buildWhatsAppOrderText());
  const url = `https://wa.me/${STORE_CONFIG.whatsappNumber}?text=${message}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

/* ==========================================================================
   PAINEL ADMINISTRATIVO (ADMIN.HTML) - FIREBASE AUTH & FIRESTORE
   ========================================================================== */

let adminSubscriptionStarted = false;

function setAdminViewAuthenticated(isAuthenticated) {
  const loginView = document.getElementById("admin-login-view");
  const dashView = document.getElementById("admin-dashboard-view");
  const btnLogout = document.getElementById("btn-logout");

  if (!loginView || !dashView || !btnLogout) return;

  if (isAuthenticated) {
    loginView.classList.add("hidden");
    dashView.classList.remove("hidden");
    btnLogout.classList.remove("hidden");
    populateAdminSizeSelect();

    if (!adminSubscriptionStarted) {
      adminSubscriptionStarted = true;
      subscribeProducts(renderAdminProducts);
    }
  } else {
    loginView.classList.remove("hidden");
    dashView.classList.add("hidden");
    btnLogout.classList.add("hidden");
  }
}

function initAdminPage() {
  if (!auth) return;
  auth.onAuthStateChanged((user) => {
    setAdminViewAuthenticated(Boolean(user));
  });
}

async function handleAdminLogin(event) {
  event.preventDefault();
  const email = document.getElementById("login-email").value.trim();
  const pass = document.getElementById("login-pass").value;
  const errorEl = document.getElementById("login-error");
  const submitBtn = document.getElementById("btn-login-submit");

  errorEl.classList.add("hidden");
  submitBtn.disabled = true;
  submitBtn.textContent = "Entrando...";

  try {
    await auth.signInWithEmailAndPassword(email, pass);
    showToast("Login realizado com sucesso!");
  } catch (err) {
    errorEl.textContent = "E-mail ou senha inválidos.";
    errorEl.classList.remove("hidden");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Entrar no Painel";
  }
}

async function handleAdminLogout() {
  if (auth) {
    await auth.signOut();
  }
  setAdminViewAuthenticated(false);
}

/* --- Modal Editar Banner --- */
function openBannerModal() {
  const modal = document.getElementById("banner-modal");
  currentUploadedBannerBase64 = cachedBanner.imageBase64 || DEFAULT_BANNER.imageBase64;
  document.getElementById("banner-title-input").value = cachedBanner.title || DEFAULT_BANNER.title;
  document.getElementById("banner-image-file").value = "";

  const preview = document.getElementById("banner-image-preview");
  const placeholder = document.getElementById("banner-upload-placeholder");

  if (currentUploadedBannerBase64) {
    preview.src = currentUploadedBannerBase64;
    preview.classList.remove("hidden");
    placeholder.classList.add("hidden");
  } else {
    preview.src = "";
    preview.classList.add("hidden");
    placeholder.classList.remove("hidden");
  }

  modal.classList.remove("hidden");
  modal.classList.add("flex");
}

function closeBannerModal() {
  const modal = document.getElementById("banner-modal");
  modal.classList.add("hidden");
  modal.classList.remove("flex");
}

function handleBannerImageBase64(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    const img = new Image();
    img.onload = function() {
      const canvas = document.createElement("canvas");
      const maxWidth = 1200;
      const scale = Math.min(1, maxWidth / img.width);
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;

      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      currentUploadedBannerBase64 = canvas.toDataURL("image/jpeg", 0.8);

      const preview = document.getElementById("banner-image-preview");
      const placeholder = document.getElementById("banner-upload-placeholder");
      preview.src = currentUploadedBannerBase64;
      preview.classList.remove("hidden");
      placeholder.classList.add("hidden");
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

async function saveBannerConfig(event) {
  event.preventDefault();
  const title = document.getElementById("banner-title-input").value.trim() || DEFAULT_BANNER.title;
  const imageBase64 = currentUploadedBannerBase64 || DEFAULT_BANNER.imageBase64;
  const saveBtn = document.getElementById("btn-save-banner");

  saveBtn.disabled = true;
  saveBtn.textContent = "Salvando...";

  try {
    await db.collection(STORE_CONFIG.bannerCollection)
      .doc(STORE_CONFIG.bannerDocId)
      .set({
        title,
        imageBase64,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });

    cachedBanner = { title, imageBase64 };
    applyBannerToPage(cachedBanner);
    closeBannerModal();
    showToast("Banner atualizado!");
  } catch (err) {
    console.error("Erro ao salvar banner:", err);
    showToast("Erro ao salvar banner.");
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = "Salvar Banner";
  }
}

/* --- Produtos --- */
function populateAdminSizeSelect() {
  const select = document.getElementById("prod-size-index");
  if (!select) return;
  select.innerHTML = CAKE_SIZES.map((s, idx) =>
    `<option value="${idx}">${s.label} — ${formatBRL(s.price)}</option>`
  ).join("");
}

function renderAdminProducts(products) {
  const container = document.getElementById("admin-products-list");
  if (!container) return;

  if (!products || products.length === 0) {
    container.innerHTML = `
      <div class="col-span-full text-center py-12 bg-white rounded-3xl border border-dashed border-[#E4D3C3]">
        <p class="text-sm font-semibold text-[#3B2823]">Nenhum bolo cadastrado na vitrine.</p>
        <p class="text-xs text-[#8A6D64] mt-1">Clique em "Novo Produto" para adicionar o primeiro.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = products.map(prod => {
    const sizeObj = CAKE_SIZES[prod.sizeIndex] || CAKE_SIZES[0];
    return `
      <div class="bg-white rounded-3xl border border-[#EFE2D6] overflow-hidden shadow-sm flex flex-col">
        <div class="aspect-[4/3] w-full bg-[#FAF3EB] overflow-hidden">
          <img src="${prod.imageBase64}" alt="${prod.name}" class="w-full h-full object-cover" />
        </div>
        <div class="p-5 flex-1 flex flex-col justify-between space-y-3">
          <div>
            <div class="flex items-start justify-between gap-2">
              <h3 class="font-serif-title font-bold text-base text-[#3B2823]">${prod.name}</h3>
              <span class="text-xs font-bold text-[#BE3E5B] whitespace-nowrap">${formatBRL(sizeObj.price)}</span>
            </div>
            <p class="text-xs text-[#785B52] mt-1.5 line-clamp-2">${prod.filling}</p>
            <p class="text-[11px] text-[#9C7B70] mt-1">Tamanho base: ${sizeObj.label}</p>
          </div>

          <button
            type="button"
            onclick="deleteAdminProduct('${prod.id}')"
            class="w-full py-2 px-3 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
          >
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            Remover da Vitrine
          </button>
        </div>
      </div>
    `;
  }).join("");

  if (window.lucide) lucide.createIcons();
}

function openProductModal() {
  const modal = document.getElementById("product-modal");
  currentUploadedBase64 = "";
  document.getElementById("prod-name").value = "";
  document.getElementById("prod-filling").value = "";
  document.getElementById("prod-image-file").value = "";

  const preview = document.getElementById("prod-image-preview");
  const placeholder = document.getElementById("prod-upload-placeholder");
  preview.src = "";
  preview.classList.add("hidden");
  placeholder.classList.remove("hidden");

  modal.classList.remove("hidden");
  modal.classList.add("flex");
}

function closeProductModal() {
  const modal = document.getElementById("product-modal");
  modal.classList.add("hidden");
  modal.classList.remove("flex");
}

function handleImageBase64(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    const img = new Image();
    img.onload = function() {
      const canvas = document.createElement("canvas");
      const maxWidth = 800;
      const scale = Math.min(1, maxWidth / img.width);
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;

      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      currentUploadedBase64 = canvas.toDataURL("image/jpeg", 0.8);

      const preview = document.getElementById("prod-image-preview");
      const placeholder = document.getElementById("prod-upload-placeholder");
      preview.src = currentUploadedBase64;
      preview.classList.remove("hidden");
      placeholder.classList.add("hidden");
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

async function saveNewProduct(event) {
  event.preventDefault();

  if (!currentUploadedBase64) {
    showToast("Selecione uma imagem para o bolo!");
    return;
  }

  const name = document.getElementById("prod-name").value.trim();
  const filling = document.getElementById("prod-filling").value.trim();
  const sizeIndex = parseInt(document.getElementById("prod-size-index").value, 10) || 0;
  const saveBtn = document.getElementById("btn-save-product");

  saveBtn.disabled = true;
  saveBtn.textContent = "Salvando...";

  try {
    await db.collection(STORE_CONFIG.firestoreCollection).add({
      name,
      filling,
      sizeIndex,
      imageBase64: currentUploadedBase64,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    closeProductModal();
    showToast("Novo bolo salvo na vitrine!");
  } catch (err) {
    console.error("Erro ao salvar bolo:", err);
    showToast("Erro ao salvar. Verifique as regras do Firestore.");
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = "Salvar na Vitrine";
  }
}

async function deleteAdminProduct(id) {
  try {
    await db.collection(STORE_CONFIG.firestoreCollection).doc(id).delete();
    showToast("Produto removido da vitrine.");
  } catch (err) {
    console.error("Erro ao remover bolo:", err);
    showToast("Erro ao remover produto.");
  }
}
