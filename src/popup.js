const form = {
  enabled: document.querySelector("#enabled"),
  provider: document.querySelector("#provider"),
  apiKey: document.querySelector("#apiKey"),
  status: document.querySelector("#status"),
  save: document.querySelector("#save"),
  openOptions: document.querySelector("#openOptions"),
};

function sendMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(new Error(lastError.message));
        return;
      }
      resolve(response);
    });
  });
}

function setStatus(message, kind) {
  form.status.textContent = message || "";
  form.status.dataset.kind = kind || "";
}

async function loadSettings() {
  const response = await sendMessage({ type: "YTCT_GET_SETTINGS" });
  if (!response?.ok) {
    throw new Error(response?.error || "读取设置失败");
  }

  form.enabled.checked = response.settings.enabled;
  form.provider.value = response.settings.provider;
  form.apiKey.placeholder = response.settings.hasApiKey
    ? "已配置，留空表示不修改"
    : "保存在本机 Chrome";
}

async function saveSettings() {
  setStatus("保存中...");
  const settings = {
    enabled: form.enabled.checked,
    provider: form.provider.value,
  };
  if (form.apiKey.value.trim()) {
    settings.apiKey = form.apiKey.value.trim();
  }

  const response = await sendMessage({
    type: "YTCT_SAVE_SETTINGS",
    settings,
  });
  if (!response?.ok) {
    throw new Error(response?.error || "保存失败");
  }

  form.apiKey.value = "";
  form.apiKey.placeholder = response.settings.hasApiKey
    ? "已配置，留空表示不修改"
    : "保存在本机 Chrome";
  setStatus("已保存");
}

form.save.addEventListener("click", () => {
  saveSettings().catch((error) => setStatus(error.message, "error"));
});

form.openOptions.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

loadSettings().catch((error) => setStatus(error.message, "error"));
