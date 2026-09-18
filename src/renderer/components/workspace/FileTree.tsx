import React, { useState } from 'react';
import { message } from 'antd';
import {
  FolderOutlined,
  FolderOpenOutlined,
  FileOutlined,
  FileTextOutlined,
  CodeOutlined,
  FileImageOutlined,
  FileMarkdownOutlined,
  VideoCameraOutlined,
  AudioOutlined,
  FilePdfOutlined,
  FileZipOutlined,
} from '@ant-design/icons';
import { useWorkspaceStore, FileNode, tabId } from '../../stores/workspace-store';

const FileTree: React.FC = () => {
  const { workspace, expandedDirs, toggleDirExpanded, loadDirChildren, addTab } = useWorkspaceStore();
  const [hoveredPath, setHoveredPath] = useState<string | null>(null);

  if (!workspace) {
    return (
      <div style={{ padding: '16px', color: 'var(--text-quaternary)', textAlign: 'center', fontSize: 12 }}>
        未打开工作区
      </div>
    );
  }

  const getFileIcon = (name: string, type: string, nodePath?: string) => {
    if (type === 'directory') {
      return expandedDirs.has(nodePath ?? name) ? <FolderOpenOutlined style={{ color: '#f59e0b' }} /> : <FolderOutlined style={{ color: '#f59e0b' }} />;
    }

    const ext = name.split('.').pop()?.toLowerCase();
    const iconMap: Record<string, React.ReactNode> = {
      'ts': <CodeOutlined style={{ color: '#3178c6' }} />,
      'tsx': <CodeOutlined style={{ color: '#3178c6' }} />,
      'js': <CodeOutlined style={{ color: '#f7df1e' }} />,
      'jsx': <CodeOutlined style={{ color: '#61dafb' }} />,
      'py': <CodeOutlined style={{ color: '#3776ab' }} />,
      'java': <CodeOutlined style={{ color: '#007396' }} />,
      'go': <CodeOutlined style={{ color: '#00add8' }} />,
      'rs': <CodeOutlined style={{ color: '#ce422b' }} />,
      'md': <FileMarkdownOutlined style={{ color: '#755838' }} />,
      'txt': <FileTextOutlined />,
      'json': <FileTextOutlined style={{ color: '#f59e0b' }} />,
      'yaml': <FileTextOutlined style={{ color: '#cb171e' }} />,
      'yml': <FileTextOutlined style={{ color: '#cb171e' }} />,
      'png': <FileImageOutlined style={{ color: '#10b981' }} />,
      'jpg': <FileImageOutlined style={{ color: '#10b981' }} />,
      'jpeg': <FileImageOutlined style={{ color: '#10b981' }} />,
      'gif': <FileImageOutlined style={{ color: '#10b981' }} />,
      'svg': <FileImageOutlined style={{ color: '#10b981' }} />,
      'mp4': <VideoCameraOutlined style={{ color: '#8b5cf6' }} />,
      'mp3': <AudioOutlined style={{ color: '#ec4899' }} />,
      'wav': <AudioOutlined style={{ color: '#ec4899' }} />,
      'pdf': <FilePdfOutlined style={{ color: '#ef4444' }} />,
      'zip': <FileZipOutlined style={{ color: '#f59e0b' }} />,
    };

    return iconMap[ext || ''] || <FileOutlined />;
  };

  const getGitStatusColor = (status?: string | null) => {
    switch (status) {
      case 'modified': return '#f59e0b';
      case 'added': return '#10b981';
      case 'deleted': return '#ef4444';
      case 'untracked': return '#6b7280';
      default: return undefined;
    }
  };

  const handleNodeClick = async (node: FileNode) => {
    if (node.type === 'directory') {
      if (expandedDirs.has(node.path)) {
        // 已展开 → 收起
        toggleDirExpanded(node.path);
      } else if (node.children && node.children.length > 0) {
        // 递归全量扫描已带回子项 → 直接展开
        toggleDirExpanded(node.path);
      } else {
        // 兜底：空目录或旧数据 → 懒加载一次（空目录返回空，之后记住状态）
        await loadDirChildren(node.path);
      }
    } else {
      try {
        const result = await window.electronAPI.file.readText(node.path);
        if (result.success) {
          addTab({
            id: tabId(),
            type: 'file',
            title: node.name,
            filePath: node.path,
            content: result.content,
          });
        } else {
          message.error(result?.error || '打开文件失败');
        }
      } catch (error) {
        console.error('打开文件失败:', error);
      }
    }
  };

  const renderNode = (node: FileNode, level: number = 0): React.ReactNode => {
    const isExpanded = expandedDirs.has(node.path);
    const isHovered = hoveredPath === node.path;
    const gitColor = getGitStatusColor(node.gitStatus);

    return (
      <div key={node.path}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '3px 8px',
            paddingLeft: `${8 + level * 14}px`,
            cursor: 'pointer',
            backgroundColor: isHovered ? 'var(--g-hover)' : 'transparent',
            color: gitColor || 'var(--text-secondary)',
            transition: 'background-color 0.12s',
          }}
          onMouseEnter={() => setHoveredPath(node.path)}
          onMouseLeave={() => setHoveredPath(null)}
          onClick={() => handleNodeClick(node)}
        >
          <span style={{ marginRight: '8px', fontSize: 13, flexShrink: 0 }}>
            {getFileIcon(node.name, node.type, node.path)}
          </span>
          <span style={{ fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.name}</span>
          {node.gitStatus && (
            <span style={{ fontSize: 10, opacity: 0.7, marginLeft: 4 }}>
              {node.gitStatus[0].toUpperCase()}
            </span>
          )}
        </div>
        {node.type === 'directory' && isExpanded && node.children && (
          <div>
            {node.children.map(child => renderNode(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="g-scroll" style={{
      height: '100%',
      overflow: 'auto',
      background: 'transparent',
      color: 'var(--text-secondary)',
    }}>
      <div style={{
        padding: '10px 14px',
        borderBottom: '1px solid var(--g-stroke)',
        fontSize: 12,
        fontWeight: 600,
        color: 'var(--text-tertiary)',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
      }}>
        {workspace.name}
      </div>
      <div style={{ padding: '6px 0' }}>
        {workspace.fileTree.map(node => renderNode(node))}
      </div>
    </div>
  );
};

export default FileTree;
