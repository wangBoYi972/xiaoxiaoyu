import React from 'react';
import { Tabs as AntTabs } from 'antd';
import {
  MessageOutlined,
  FileOutlined,
  DiffOutlined,
  CloseOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import { useWorkspaceStore } from '../../stores/workspace-store';
import { disposeModelFor } from '../../editor/editor-registry';

const TabBar: React.FC = () => {
  const { tabs, activeTabId, setActiveTab, removeTab } = useWorkspaceStore();

  if (tabs.length === 0) {
    return null;
  }

  const getTabIcon = (type: string) => {
    switch (type) {
      case 'chat': return <MessageOutlined />;
      case 'file': return <FileOutlined />;
      case 'diff': return <DiffOutlined />;
      default: return <FileOutlined />;
    }
  };

  /** 关标签时顺手释放 Monaco model，否则撤销栈会一直留在内存里 */
  const handleClose = (tabId: string, filePath?: string) => {
    if (filePath) disposeModelFor(filePath);
    removeTab(tabId);
  };

  const items = tabs.map(tab => ({
    key: tab.id,
    label: (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        maxWidth: '180px',
      }}>
        <span style={{ fontSize: '13px', color: tab.id === activeTabId ? 'var(--text-primary)' : 'var(--text-quaternary)' }}>{getTabIcon(tab.type)}</span>
        <span style={{
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          fontSize: '12px',
          color: tab.id === activeTabId ? 'var(--text-primary)' : 'var(--text-quaternary)',
        }}>
          {tab.title}
        </span>
        {tab.unsaved && (
          <SaveOutlined style={{ fontSize: '11px', color: 'var(--warn)' }} />
        )}
        {!tab.pinned && (
          <CloseOutlined
            style={{ fontSize: '11px', color: 'var(--text-quaternary)', marginLeft: '2px' }}
            onClick={(e) => {
              e.stopPropagation();
              handleClose(tab.id, tab.filePath);
            }}
          />
        )}
      </div>
    ),
  }));

  return (
    <div style={{
      borderBottom: '1px solid var(--g-stroke)',
      background: 'transparent',
    }}>
      <AntTabs
        type="line"
        activeKey={activeTabId || undefined}
        items={items}
        onChange={setActiveTab}
        size="small"
        style={{ margin: 0 }}
        tabBarStyle={{
          margin: 0,
          padding: '0 12px',
          height: 38,
          borderBottom: 'none',
          background: 'transparent',
        }}
      />
    </div>
  );
};

export default TabBar;
