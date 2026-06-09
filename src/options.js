const DEFAULT_PROVIDER = "gemini";
const DEFAULT_OVERLAY_POSITION = {
  overlayXPercent: 50,
  overlayYPercent: 86,
};
const DISPLAY_SAVE_DEBOUNCE_MS = 250;

const form = {
  enabled: document.querySelector("#enabled"),
  providerTabs: Array.from(document.querySelectorAll("[data-provider-tab]")),
  providerPages: Array.from(document.querySelectorAll("[data-provider-page]")),
  geminiApiKey: document.querySelector("#geminiApiKey"),
  geminiKeyHint: document.querySelector("#geminiKeyHint"),
  geminiModel: document.querySelector("#geminiModel"),
  deepseekApiKey: document.querySelector("#deepseekApiKey"),
  deepseekKeyHint: document.querySelector("#deepseekKeyHint"),
  deepseekModel: document.querySelector("#deepseekModel"),
  openrouterApiKey: document.querySelector("#openrouterApiKey"),
  openrouterKeyHint: document.querySelector("#openrouterKeyHint"),
  openrouterModel: document.querySelector("#openrouterModel"),
  contextItems: document.querySelector("#contextItems"),
  customInstructions: document.querySelector("#customInstructions"),
  userGlossary: document.querySelector("#userGlossary"),
  overlayOpacityPercent: document.querySelector("#overlayOpacityPercent"),
  overlayOpacityValue: document.querySelector("#overlayOpacityValue"),
  overlayFontScalePercent: document.querySelector("#overlayFontScalePercent"),
  overlayFontScaleValue: document.querySelector("#overlayFontScaleValue"),
  resetOverlayPosition: document.querySelector("#resetOverlayPosition"),
  status: document.querySelector("#status"),
  save: document.querySelector("#save"),
  test: document.querySelector("#test"),
};

const state = {
  provider: DEFAULT_PROVIDER,
  overlayXPercent: DEFAULT_OVERLAY_POSITION.overlayXPercent,
  overlayYPercent: DEFAULT_OVERLAY_POSITION.overlayYPercent,
  displaySaveTimer: 0,
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

function activateProvider(provider) {
  state.provider =
    provider === "deepseek" || provider === "openrouter" ? provider : DEFAULT_PROVIDER;
  form.providerTabs.forEach((tab) => {
    const isActive = tab.dataset.providerTab === state.provider;
    tab.classList.toggle("active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
  });
  form.providerPages.forEach((page) => {
    page.hidden = page.dataset.providerPage !== state.provider;
  });
}

function keyHint(hasKey) {
  return hasKey
    ? "API key 已配置在本机。输入新 key 后保存会覆盖。"
    : "API key 仅保存在本机 Chrome storage，不会同步。";
}

function updateKeyHints(settings) {
  form.geminiApiKey.placeholder = settings.geminiHasApiKey
    ? "已配置，留空表示不修改"
    : "";
  form.deepseekApiKey.placeholder = settings.deepseekHasApiKey
    ? "已配置，留空表示不修改"
    : "";
  form.openrouterApiKey.placeholder = settings.openrouterHasApiKey
    ? "已配置，留空表示不修改"
    : "";
  form.geminiKeyHint.textContent = keyHint(settings.geminiHasApiKey);
  form.deepseekKeyHint.textContent = keyHint(settings.deepseekHasApiKey);
  form.openrouterKeyHint.textContent = keyHint(settings.openrouterHasApiKey);
}

function updateRangeOutputs() {
  form.overlayOpacityValue.value = `${form.overlayOpacityPercent.value}%`;
  form.overlayFontScaleValue.value = `${form.overlayFontScalePercent.value}%`;
}

function getDisplaySettings() {
  return {
    overlayOpacityPercent: form.overlayOpacityPercent.value,
    overlayFontScalePercent: form.overlayFontScalePercent.value,
    overlayXPercent: state.overlayXPercent,
    overlayYPercent: state.overlayYPercent,
  };
}

async function loadSettings() {
  const response = await sendMessage({ type: "YTCT_GET_SETTINGS" });
  if (!response?.ok) {
    throw new Error(response?.error || "读取设置失败");
  }
  const settings = response.settings;

  form.enabled.checked = settings.enabled;
  activateProvider(settings.provider);
  form.geminiModel.value = settings.geminiModel;
  form.deepseekModel.value = settings.deepseekModel;
  form.openrouterModel.value = settings.openrouterModel;
  form.contextItems.value = settings.contextItems;
  form.customInstructions.value = settings.customInstructions || "";
  form.userGlossary.value = settings.userGlossary || "";
  form.overlayOpacityPercent.value = settings.overlayOpacityPercent;
  form.overlayFontScalePercent.value = settings.overlayFontScalePercent;
  state.overlayXPercent = settings.overlayXPercent;
  state.overlayYPercent = settings.overlayYPercent;
  updateKeyHints(settings);
  updateRangeOutputs();
}

async function saveSettings() {
  setStatus("保存中...");
  const settings = {
    enabled: form.enabled.checked,
    provider: state.provider,
    geminiModel: form.geminiModel.value,
    deepseekModel: form.deepseekModel.value,
    openrouterModel: form.openrouterModel.value,
    contextItems: form.contextItems.value,
    customInstructions: form.customInstructions.value,
    userGlossary: form.userGlossary.value,
    overlayOpacityPercent: form.overlayOpacityPercent.value,
    overlayFontScalePercent: form.overlayFontScalePercent.value,
    overlayXPercent: state.overlayXPercent,
    overlayYPercent: state.overlayYPercent,
  };

  if (form.geminiApiKey.value.trim()) {
    settings.geminiApiKey = form.geminiApiKey.value.trim();
  }
  if (form.deepseekApiKey.value.trim()) {
    settings.deepseekApiKey = form.deepseekApiKey.value.trim();
  }
  if (form.openrouterApiKey.value.trim()) {
    settings.openrouterApiKey = form.openrouterApiKey.value.trim();
  }

  const response = await sendMessage({
    type: "YTCT_SAVE_SETTINGS",
    settings,
  });
  if (!response?.ok) {
    throw new Error(response?.error || "保存失败");
  }

  form.geminiApiKey.value = "";
  form.deepseekApiKey.value = "";
  form.openrouterApiKey.value = "";
  updateKeyHints(response.settings);
  setStatus("已保存");
}

async function saveDisplaySettings() {
  const response = await sendMessage({
    type: "YTCT_SAVE_SETTINGS",
    settings: getDisplaySettings(),
  });
  if (!response?.ok) {
    throw new Error(response?.error || "保存字幕显示设置失败");
  }
  setStatus("字幕显示已更新");
}

function scheduleDisplaySettingsSave() {
  window.clearTimeout(state.displaySaveTimer);
  state.displaySaveTimer = window.setTimeout(() => {
    saveDisplaySettings().catch((error) => setStatus(error.message, "error"));
  }, DISPLAY_SAVE_DEBOUNCE_MS);
}

async function testTranslation() {
  await saveSettings();
  setStatus("测试中...");
  const response = await sendMessage({ type: "YTCT_TEST_TRANSLATION" });
  if (!response?.ok) {
    throw new Error(response?.error || "测试失败");
  }
  setStatus(`测试成功：${response.result.translation}`);
}

form.providerTabs.forEach((tab) => {
  tab.addEventListener("click", () => activateProvider(tab.dataset.providerTab));
});

[
  form.overlayOpacityPercent,
  form.overlayFontScalePercent,
].forEach((input) => {
  input.addEventListener("input", () => {
    updateRangeOutputs();
    scheduleDisplaySettingsSave();
  });
});

form.resetOverlayPosition.addEventListener("click", () => {
  state.overlayXPercent = DEFAULT_OVERLAY_POSITION.overlayXPercent;
  state.overlayYPercent = DEFAULT_OVERLAY_POSITION.overlayYPercent;
  saveDisplaySettings()
    .then(() => setStatus("位置已重置"))
    .catch((error) => setStatus(error.message, "error"));
});

form.save.addEventListener("click", () => {
  saveSettings().catch((error) => setStatus(error.message, "error"));
});

form.test.addEventListener("click", () => {
  testTranslation().catch((error) => setStatus(error.message, "error"));
});

loadSettings().catch((error) => setStatus(error.message, "error"));
