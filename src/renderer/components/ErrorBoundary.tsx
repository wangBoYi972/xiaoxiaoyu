import React from 'react';
import { Button, Result } from 'antd';

interface Props { children: React.ReactNode; }
interface State { error: Error | null; }

/**
 * 渲染层错误边界 —— 任何视图崩溃时给出可恢复的界面，
 * 而不是整块白屏（前端待办之一，2026-09-19 落地）。
 * 用法：<ErrorBoundary><某个视图/></ErrorBoundary>
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // 组件堆栈打到 console（主进程会通过 render-process-gone 记录进程级崩溃）
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Result
          status="warning"
          title="界面出错了"
          subTitle={`不影响已保存的数据。错误信息：${this.state.error.message || String(this.state.error)}`}
          extra={[
            <Button key="reload" type="primary" onClick={() => window.location.reload()}>
              重新加载界面
            </Button>,
            <Button key="reset" onClick={() => this.setState({ error: null })}>
              返回重试
            </Button>,
          ]}
        />
      </div>
    );
  }
}
