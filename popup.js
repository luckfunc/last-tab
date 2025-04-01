// popup.js
// 当前选择的高亮颜色
let selectedColor = "#E8F0FE"; // 默认为浅蓝色

document.addEventListener('DOMContentLoaded', async () => {
	const container = document.getElementById('domains-container');
	const colorPicker = document.getElementById('color-picker');
	const clearAllButton = document.getElementById('clear-all-btn');

	try {
		// 加载当前选择的颜色
		const colorData = await chrome.storage.local.get('highlightColor');
		if (colorData.highlightColor) {
			selectedColor = colorData.highlightColor;

			// 更新颜色选择器中的选中状态
			const colorOptions = colorPicker.querySelectorAll('.color-option');
			colorOptions.forEach(option => {
				if (option.dataset.color === selectedColor) {
					option.classList.add('selected');
				} else {
					option.classList.remove('selected');
				}
			});
		} else {
			// 如果没有保存的颜色，选中默认颜色
			const defaultOption = colorPicker.querySelector(`.color-option[data-color="${selectedColor}"]`);
			if (defaultOption) {
				defaultOption.classList.add('selected');
			}
		}

		// 从存储中获取活跃的域名标签页
		const data = await chrome.storage.local.get('activeTabsByDomain');
		const activeTabsByDomain = data.activeTabsByDomain || {};

		// 检查是否有活跃的域名
		const domains = Object.keys(activeTabsByDomain);
		if (domains.length === 0) {
			container.innerHTML = '<div class="no-domains">还没有标记任何标签页</div>';
			return;
		}

		// 创建域名列表
		const domainList = document.createElement('div');
		domainList.className = 'domain-list';

		// 对域名按照最后访问时间排序
		domains.sort((a, b) => {
			const timeA = new Date(activeTabsByDomain[a].lastAccessed).getTime();
			const timeB = new Date(activeTabsByDomain[b].lastAccessed).getTime();
			return timeB - timeA; // 最近的在前面
		});

		// 为每个域名创建一个项目
		domains.forEach(domain => {
			const tabInfo = activeTabsByDomain[domain];

			// 格式化时间
			const lastAccessed = new Date(tabInfo.lastAccessed);
			const now = new Date();
			let timeDisplay = '';

			const diffInSeconds = Math.floor((now - lastAccessed) / 1000);

			if (diffInSeconds < 60) {
				timeDisplay = '刚刚';
			} else if (diffInSeconds < 3600) {
				timeDisplay = `${Math.floor(diffInSeconds / 60)} 分钟前`;
			} else if (diffInSeconds < 86400) {
				timeDisplay = `${Math.floor(diffInSeconds / 3600)} 小时前`;
			} else {
				timeDisplay = `${Math.floor(diffInSeconds / 86400)} 天前`;
			}

			// 创建域名项目
			const domainItem = document.createElement('div');
			domainItem.className = 'domain-item';

			// 创建HTML内容
			domainItem.innerHTML = `
        <div class="domain-header">
          <img class="favicon" src="${tabInfo.favicon || 'images/default-favicon.png'}" 
               onerror="this.src='images/default-favicon.png'">
          <div class="domain-name">
            <span class="color-indicator" style="background-color: ${selectedColor}"></span>
            ${escapeHTML(domain)}
          </div>
        </div>
        <div class="tab-info">
          <div class="tab-title">${escapeHTML(tabInfo.title)}</div>
          <div class="tab-url">${escapeHTML(tabInfo.url)}</div>
          <div class="timestamp">最后访问: ${timeDisplay}</div>
          <div class="action-buttons">
            <button class="goto-btn" data-tab-id="${tabInfo.tabId}" data-window-id="${tabInfo.windowId}">
              跳转到标签页
            </button>
            <button class="clear-btn" data-domain="${domain}">
              清除标记
            </button>
          </div>
        </div>
      `;

			domainList.appendChild(domainItem);
		});

		container.innerHTML = '';
		container.appendChild(domainList);

		// 添加跳转按钮事件
		const gotoButtons = document.querySelectorAll('.goto-btn');
		gotoButtons.forEach(button => {
			button.addEventListener('click', async () => {
				const tabId = parseInt(button.dataset.tabId);
				const windowId = parseInt(button.dataset.windowId);

				try {
					// 尝试获取标签页信息
					await chrome.tabs.get(tabId)
					.then(tab => {
						// 激活标签页和窗口
						chrome.tabs.update(tabId, { active: true });
						chrome.windows.update(windowId, { focused: true });
					})
					.catch(error => {
						// 如果标签页不存在，显示错误信息
						alert('标签页已关闭或不存在');
						// 刷新弹出窗口
						window.location.reload();
					});
				} catch (error) {
					console.error("跳转到标签页时出错:", error);
				}

				// 关闭弹出窗口
				window.close();
			});
		});

		// 添加清除按钮事件
		const clearButtons = document.querySelectorAll('.clear-btn[data-domain]');
		clearButtons.forEach(button => {
			button.addEventListener('click', async () => {
				const domain = button.dataset.domain;

				try {
					// 获取当前域名的标签页信息
					const tabInfo = activeTabsByDomain[domain];

					if (tabInfo) {
						// 移除标签页的高亮
						chrome.scripting.executeScript({
							target: { tabId: tabInfo.tabId },
							func: function() {
								// 移除之前添加的边框
								if (document.body.classList.contains('tab-highlighter-active')) {
									document.body.classList.remove('tab-highlighter-active');

									// 移除之前添加的样式
									const existingStyle = document.getElementById('tab-highlighter-style');
									if (existingStyle) {
										existingStyle.remove();
									}
								}
							}
						}).catch(err => console.log("无法执行清除脚本:", err));

						// 从存储中删除这个域名
						delete activeTabsByDomain[domain];
						await chrome.storage.local.set({ activeTabsByDomain });

						// 刷新弹出窗口
						window.location.reload();
					}
				} catch (error) {
					console.error("清除标记时出错:", error);
				}
			});
		});

		// 添加颜色选择事件
		const colorOptions = colorPicker.querySelectorAll('.color-option');
		colorOptions.forEach(option => {
			option.addEventListener('click', async () => {
				// 获取选择的颜色
				selectedColor = option.dataset.color;

				// 更新选中状态
				colorOptions.forEach(opt => {
					if (opt === option) {
						opt.classList.add('selected');
					} else {
						opt.classList.remove('selected');
					}
				});

				// 保存选择的颜色
				await chrome.storage.local.set({ highlightColor: selectedColor });

				// 更新所有域名项目中的颜色指示器
				const indicators = document.querySelectorAll('.color-indicator');
				indicators.forEach(indicator => {
					indicator.style.backgroundColor = selectedColor;
				});

				// 重新应用高亮到所有活跃标签页
				for (const domain in activeTabsByDomain) {
					const tabInfo = activeTabsByDomain[domain];

					// 应用新颜色
					chrome.scripting.executeScript({
						target: { tabId: tabInfo.tabId },
						func: function(color) {
							// 先移除已有的高亮
							if (document.body.classList.contains('tab-highlighter-active')) {
								document.body.classList.remove('tab-highlighter-active');

								// 移除之前添加的样式
								const existingStyle = document.getElementById('tab-highlighter-style');
								if (existingStyle) {
									existingStyle.remove();
								}
							}

							// 添加新样式
							const style = document.createElement('style');
							style.id = 'tab-highlighter-style';
							style.textContent = `
                body.tab-highlighter-active {
                  position: relative;
                }
                body.tab-highlighter-active::before {
                  content: "";
                  position: fixed;
                  top: 0;
                  left: 0;
                  right: 0;
                  height: 5px;
                  background-color: ${color};
                  z-index: 9999;
                  box-shadow: 0 0 5px rgba(0,0,0,0.2);
                }
              `;
							document.head.appendChild(style);

							// 应用高亮类
							document.body.classList.add('tab-highlighter-active');
						},
						args: [selectedColor]
					}).catch(err => console.log("无法更新高亮颜色:", err));
				}
			});
		});

		// 添加清除所有按钮事件
		clearAllButton.addEventListener('click', async () => {
			try {
				// 移除所有标签页的高亮
				for (const domain in activeTabsByDomain) {
					const tabInfo = activeTabsByDomain[domain];

					chrome.scripting.executeScript({
						target: { tabId: tabInfo.tabId },
						func: function() {
							// 移除之前添加的边框
							if (document.body.classList.contains('tab-highlighter-active')) {
								document.body.classList.remove('tab-highlighter-active');

								// 移除之前添加的样式
								const existingStyle = document.getElementById('tab-highlighter-style');
								if (existingStyle) {
									existingStyle.remove();
								}
							}
						}
					}).catch(err => console.log("无法执行清除脚本:", err));
				}

				// 清空存储
				await chrome.storage.local.set({ activeTabsByDomain: {} });

				// 刷新弹出窗口
				window.location.reload();
			} catch (error) {
				console.error("清除所有标记时出错:", error);
			}
		});
	} catch (error) {
		container.innerHTML = `<div class="no-domains">加载标记的标签页时出错: ${error.message}</div>`;
		console.error("加载标记的标签页时出错:", error);
	}
});

// 辅助函数：转义HTML以防止XSS攻击
function escapeHTML(str) {
	if (!str) return '';
	return str
	.replace(/&/g, '&amp;')
	.replace(/</g, '&lt;')
	.replace(/>/g, '&gt;')
	.replace(/"/g, '&quot;')
	.replace(/'/g, '&#039;');
}
