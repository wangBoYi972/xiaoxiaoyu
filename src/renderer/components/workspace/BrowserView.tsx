import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeftOutlined,
  ArrowRightOutlined,
  GlobalOutlined,
  ReloadOutlined,
  CloseOutlined,
  PlusOutlined,
  ArrowUpOutlined,
  MessageOutlined,
} from '@ant-design/icons';
import { Input, Tooltip } from 'antd';

interface BrowserTab {
  id: number;
  address: string;
  loadedUrl: string;
  title: string;
}

/** 轻量内置浏览器外壳：地址栏和页面预览都在工作区内完成。 */
const BrowserView: React.FC = () => {
  const [tabs, setTabs] = useState<BrowserTab[]>([{ id: 1, address: '', loadedUrl: '', title: '新标签页' }]);
  const [activeTabId, setActiveTabId] = useState(1);
  const activeTab = tabs.find((tab) => tab.id === activeTabId) || tabs[0];
  const webviewRef = useRef<any>(null);
  const isElectron = !!(window as any).electronAPI;

  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview) return;
    const syncAddress = (event: any) => {
      const url = event?.url || webview.getURL?.();
      if (!url) return;
      let title = '网页';
      try { title = new URL(url).hostname || '网页'; } catch {}
      updateActiveTab({ address: url, title });
    };
    webview.addEventListener('did-navigate', syncAddress);
    webview.addEventListener('did-navigate-in-page', syncAddress);
    return () => {
      webview.removeEventListener('did-navigate', syncAddress);
      webview.removeEventListener('did-navigate-in-page', syncAddress);
    };
  }, [isElectron, activeTab?.loadedUrl, activeTabId]);

  const updateActiveTab = (patch: Partial<BrowserTab>) => {
    setTabs((current) => current.map((tab) => tab.id === activeTabId ? { ...tab, ...patch } : tab));
  };

  const navigate = () => {
    const value = (activeTab?.address || '').trim();
    if (!value) {
      updateActiveTab({ address: '', loadedUrl: '', title: '新标签页' });
      return;
    }
    const normalized = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    updateActiveTab({ address: normalized, loadedUrl: normalized });
    try {
      updateActiveTab({ title: new URL(normalized).hostname || '网页' });
    } catch {
      updateActiveTab({ title: '网页' });
    }
  };

  const goBack = () => {
    const webview = webviewRef.current;
    if (isElectron && webview?.canGoBack?.()) webview.goBack();
  };

  const goForward = () => {
    const webview = webviewRef.current;
    if (isElectron && webview?.canGoForward?.()) webview.goForward();
  };

  const reload = () => {
    if (isElectron && webviewRef.current?.reload) {
      webviewRef.current.reload();
      return;
    }
    const address = activeTab?.address || '';
    updateActiveTab({ loadedUrl: '' });
    window.setTimeout(() => updateActiveTab({ loadedUrl: address }), 0);
  };

  const closeTab = (event?: React.MouseEvent) => {
    event?.preventDefault();
    event?.stopPropagation();
    setTabs((current) => {
      const next = current.filter((tab) => tab.id !== activeTabId);
      if (next.length === 0) {
        setActiveTabId(0);
        return [];
      }
      setActiveTabId(next[next.length - 1].id);
      return next;
    });
  };

  const newTab = (event?: React.MouseEvent) => {
    event?.preventDefault();
    event?.stopPropagation();
    const id = Date.now();
    setTabs((current) => [...current, { id, address: '', loadedUrl: '', title: '新标签页' }]);
    setActiveTabId(id);
  };

  return (
    <div className="browser-root">
      <div className="browser-tabs">
        {tabs.map((tab) => (
          <div key={tab.id} className={`browser-tab ${tab.id === activeTabId ? 'active' : ''}`} onClick={() => setActiveTabId(tab.id)}>
            <GlobalOutlined />
            <span>{tab.title}</span>
            <button type="button" className="browser-tab-close" onClick={(event) => { event.stopPropagation(); closeTab(event); }} aria-label="关闭标签页" title="关闭标签页">
              <CloseOutlined />
            </button>
          </div>
        ))}
        <button className="browser-tab-add" type="button" onClick={newTab} title="新建标签页" aria-label="新建标签页">
          <PlusOutlined />
        </button>
      </div>
      <div className="browser-toolbar">
        <button type="button" className="browser-nav-btn" title="后退" onClick={goBack}><ArrowLeftOutlined /></button>
        <button type="button" className="browser-nav-btn" title="前进" onClick={goForward}><ArrowRightOutlined /></button>
        <button type="button" className="browser-nav-btn" title="刷新" onClick={reload}><ReloadOutlined /></button>
        <Input
          value={activeTab?.address || ''}
          onChange={(event) => updateActiveTab({ address: event.target.value })}
          onPressEnter={navigate}
          prefix={<GlobalOutlined />}
          suffix={<ArrowUpOutlined rotate={45} />}
          placeholder={tabs.length ? '搜索或输入网址' : '点击右侧 + 新建标签页'}
          disabled={!activeTab}
          className="browser-address"
          aria-label="搜索或输入网址"
        />
        <Tooltip title="浏览器工具">
          <button type="button" className="browser-nav-btn"><MessageOutlined /></button>
        </Tooltip>
      </div>
      <div className="browser-page">
        {activeTab?.loadedUrl ? (
          isElectron ? React.createElement('webview' as any, {
            ref: webviewRef,
            src: activeTab.loadedUrl,
            className: 'browser-webview',
            allowpopups: 'true',
            webpreferences: 'contextIsolation=yes, nodeIntegration=no, sandbox=yes',
          }) : <iframe title={activeTab.title} src={activeTab.loadedUrl} sandbox="allow-forms allow-modals allow-popups allow-scripts allow-same-origin" />
        ) : (
          <div className="browser-empty">
            <GlobalOutlined className="browser-empty-icon" />
            <strong>开始浏览</strong>
            <span>输入 URL 以打开页面</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default BrowserView;
