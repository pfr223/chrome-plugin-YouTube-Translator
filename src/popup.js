const form = {
  enabled: document.querySelector("#enabled"),
  provider: document.querySelector("#provider"),
  apiKey: document.querySelector("#apiKey"),
  popupWebTranslationTargetLanguage: document.querySelector("#popupWebTranslationTargetLanguage"),
  popupWebTranslationDisplayMode: document.querySelector("#popupWebTranslationDisplayMode"),
  popupWebTranslationScope: document.querySelector("#popupWebTranslationScope"),
  status: document.querySelector("#status"),
  save: document.querySelector("#save"),
  openOptions: document.querySelector("#openOptions"),
  translatePage: document.querySelector("#translatePage"),
  clearPageTranslations: document.querySelector("#clearPageTranslations"),
};

function runtimeErrorMessage(error, fallback = "操作失败") {
  const message = String(
    typeof error === "string" ? error : error?.message || "",
  )
    .replace(/\s+/g, " ")
    .trim();
  if (
    /extension context invalidated|receiving end does not exist|context invalidated/i
      .test(message)
  ) {
    return "扩展已重新加载，请刷新页面后继续使用。";
  }
  return message || fallback;
}

function sendMessage(message) {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(message, (response) => {
        const lastError = chrome.runtime.lastError;
        if (lastError) {
          reject(new Error(runtimeErrorMessage(lastError, "扩展通信失败")));
          return;
        }
        resolve(response);
      });
    } catch (error) {
      reject(new Error(runtimeErrorMessage(error, "扩展通信失败")));
    }
  });
}

function setStatus(message, kind) {
  form.status.textContent = message || "";
  form.status.dataset.kind = kind || "";
}

function webTranslationSettingsFromPopup() {
  const displayMode =
    form.popupWebTranslationDisplayMode.value === "translation"
      ? "translation"
      : "bilingual";
  const scope =
    form.popupWebTranslationScope.value === "viewport" ? "viewport" : "page";
  return {
    webTranslationTargetLanguage:
      form.popupWebTranslationTargetLanguage.value.trim() || "zh-CN",
    webTranslationDisplayMode: displayMode,
    webTranslationScope: scope,
  };
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
  form.popupWebTranslationTargetLanguage.value =
    response.settings.webTranslationTargetLanguage || "zh-CN";
  form.popupWebTranslationDisplayMode.value =
    response.settings.webTranslationDisplayMode || "bilingual";
  form.popupWebTranslationScope.value = response.settings.webTranslationScope || "page";
}

async function saveSettings(options = {}) {
  if (!options.silent) {
    setStatus("保存中...");
  }
  const settings = {
    enabled: form.enabled.checked,
    provider: form.provider.value,
    ...webTranslationSettingsFromPopup(),
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
  if (!options.silent) {
    setStatus("已保存");
  }
}

async function translateCurrentPage() {
  await saveSettings({ silent: true });
  setStatus("启动网页翻译...");
  const response = await sendMessage({ type: "YTCT_START_WEB_PAGE_TRANSLATION" });
  if (!response?.ok) {
    throw new Error(response?.error || "网页翻译启动失败");
  }
  if (response.result?.skipped) {
    setStatus("网页翻译未启动：扩展或网页翻译已关闭", "error");
    return;
  }
  setStatus("已启动网页翻译");
}

async function clearPageTranslations() {
  setStatus("清除中...");
  const response = await sendMessage({ type: "YTCT_CLEAR_WEB_PAGE_TRANSLATION" });
  if (!response?.ok) {
    throw new Error(response?.error || "清除网页译文失败");
  }
  setStatus(response.result?.cleared ? "网页译文已清除" : "当前页没有活动网页译文");
}

form.save.addEventListener("click", () => {
  saveSettings().catch((error) => setStatus(error.message, "error"));
});

form.openOptions.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

form.translatePage.addEventListener("click", () => {
  translateCurrentPage().catch((error) => setStatus(error.message, "error"));
});

form.clearPageTranslations.addEventListener("click", () => {
  clearPageTranslations().catch((error) => setStatus(error.message, "error"));
});

loadSettings().catch((error) => setStatus(error.message, "error"));
