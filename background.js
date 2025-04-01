// background.js
let activeTabsByDomain = {};

const domainStyles = {
	'google.com': { tag: '❗️' },
	'youtube.com': { tag: '📍' },
	'github.com': { tag: '🟠' },
	'chatgpt.com': { tag: '❗' },
	'default': { tag: '🏷' }
};

function getStyleForDomain(domain) {
	return domainStyles[domain] || domainStyles['default'];
}

function updateActiveDomainTab(tab) {
	const domain = new URL(tab.url).hostname;

	if (activeTabsByDomain[domain]) {
		activeTabsByDomain[domain] = {
			...activeTabsByDomain[domain],
			previousTabId: activeTabsByDomain[domain].tabId,
			tabId: tab.id,
			windowId: tab.windowId,
			url: tab.url,
			title: tab.title,
			favicon: tab.favIconUrl || '',
			lastAccessed: new Date().toISOString()
		};
	} else {
		activeTabsByDomain[domain] = {
			domain,
			tabId: tab.id,
			previousTabId: null,
			windowId: tab.windowId,
			url: tab.url,
			title: tab.title,
			favicon: tab.favIconUrl || '',
			lastAccessed: new Date().toISOString()
		};
	}

	chrome.storage.local.set({ activeTabsByDomain });
	applyHighlight(domain);
}

function applyHighlight(domain) {
	if (!activeTabsByDomain[domain]) return;
	const domainInfo = activeTabsByDomain[domain];
	const style = getStyleForDomain(domain);

	chrome.tabs.query({}, (tabs) => {
		const domainTabs = tabs.filter(tab => {
			if (!tab.url) return false;
			try {
				return new URL(tab.url).hostname === domain;
			} catch (_) {
				return false;
			}
		});

		domainTabs.forEach(tab => {
			const isActive = tab.id === domainInfo.tabId;
			chrome.scripting.executeScript({
				target: { tabId: tab.id },
				func: (tag, isActiveTab) => {
					const currentTitle = document.title;
					// 动态构建正则：匹配当前域名对应的标签符号
					const regex = new RegExp(`^${tag}\\s*`, 'u');

					// 清理历史符号（无论是否当前活动）
					const stripped = document.title.replace(regex, '');
					document.title = isActiveTab ? tag + ' ' + stripped : stripped;
				},
				args: [style.tag, isActive]
			});
		});
	});
}

function removeTabRecord(tabId) {
	for (const domain in activeTabsByDomain) {
		if (activeTabsByDomain[domain].tabId === tabId) {
			const previousId = activeTabsByDomain[domain].previousTabId;
			if (previousId) {
				chrome.tabs.get(previousId, (prevTab) => {
					if (chrome.runtime.lastError) {
						delete activeTabsByDomain[domain];
					} else {
						activeTabsByDomain[domain] = {
							...activeTabsByDomain[domain],
							tabId: prevTab.id,
							previousTabId: null,
							url: prevTab.url,
							title: prevTab.title,
							favicon: prevTab.favIconUrl || '',
							lastAccessed: new Date().toISOString()
						};
						applyHighlight(domain);
					}
					chrome.storage.local.set({ activeTabsByDomain });
				});
			} else {
				delete activeTabsByDomain[domain];
				chrome.storage.local.set({ activeTabsByDomain });
			}
			break;
		}
	}
}

chrome.tabs.onActivated.addListener(async (activeInfo) => {
	try {
		const tab = await chrome.tabs.get(activeInfo.tabId);
		if (tab.url?.startsWith('http')) {
			updateActiveDomainTab(tab);
		}
	} catch (error) {
		console.error("激活事件错误:", error);
	}
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
	if (changeInfo.status === 'complete' && tab.url?.startsWith('http')) {
		try {
			const domain = new URL(tab.url).hostname;
			let isActive = false;
			for (const d in activeTabsByDomain) {
				if (activeTabsByDomain[d].tabId === tabId) {
					isActive = true;
					if (d !== domain) {
						delete activeTabsByDomain[d];
						updateActiveDomainTab(tab);
					} else {
						activeTabsByDomain[d] = {
							...activeTabsByDomain[d],
							url: tab.url,
							title: tab.title,
							favicon: tab.favIconUrl || '',
							lastAccessed: new Date().toISOString()
						};
						chrome.storage.local.set({ activeTabsByDomain });
						applyHighlight(d);
					}
					break;
				}
			}
			if (!isActive && tab.active) updateActiveDomainTab(tab);
		} catch (err) {
			console.error("更新标签页出错:", err);
		}
	}
});

chrome.tabs.onRemoved.addListener(tabId => removeTabRecord(tabId));

chrome.runtime.onStartup.addListener(async () => {
	try {
		const { activeTabsByDomain: saved } = await chrome.storage.local.get('activeTabsByDomain');
		if (saved) {
			activeTabsByDomain = saved;
			for (const domain in activeTabsByDomain) {
				const info = activeTabsByDomain[domain];
				chrome.tabs.get(info.tabId, tab => {
					if (chrome.runtime.lastError) {
						delete activeTabsByDomain[domain];
					} else {
						applyHighlight(domain);
					}
				});
			}
			chrome.storage.local.set({ activeTabsByDomain });
		}
	} catch (err) {
		console.error("启动加载出错:", err);
	}
});

chrome.runtime.onInstalled.addListener(async () => {
	try {
		await chrome.storage.local.set({ activeTabsByDomain: {} });
		const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
		if (tabs[0]?.url?.startsWith('http')) {
			updateActiveDomainTab(tabs[0]);
		}
	} catch (err) {
		console.error("扩展初始化错误:", err);
	}
});
