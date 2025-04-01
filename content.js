// content.js - 在页面加载时检查是否需要应用高亮

// 通知后台脚本页面已加载，可能需要应用高亮
chrome.runtime.sendMessage({ action: "pageLoaded", url: window.location.href }, (response) => {
	// 后台脚本会处理高亮逻辑
});
