import { t } from '../shared/i18n';
import { Component, Suspense, useEffect, useState, type ReactNode } from 'react';
import type { ToolSession } from './tool-session';
import { errorText } from './common';

interface Props {
  session: ToolSession;
  children: ReactNode;
  onReady: () => void;
  onError: (error: Error) => void;
  onBack: () => void;
}

class LoadErrorBoundary extends Component<Props, { error: Error | null; session: ToolSession }> {
  state = { error: null as Error | null, session: this.props.session };
  static getDerivedStateFromProps(props: Props, state: { session: ToolSession }) {
    return props.session === state.session ? null : { session: props.session, error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    this.props.onError(error);
  }
  render() {
    if (this.state.error)
      return (
        <div className="loading-screen" role="alert">
          <p>
            {t('工具加载失败：')}
            {errorText(this.state.error)}
          </p>
          <button className="button" onClick={this.props.onBack}>
            {t('返回首页')}
          </button>
        </div>
      );
    return this.props.children;
  }
}

// This component commits only after the lazy child resolves. Child effects first
// register their restore work; a second commit acknowledges its completed state.
function MountedTool({ session, children, onReady }: Props) {
  const [restored, setRestored] = useState<ToolSession | null>(null);
  const [failure, setFailure] = useState<{ session: ToolSession; error: unknown } | null>(null);
  useEffect(() => {
    let live = true;
    void Promise.all([...session.restores]).then(
      () => {
        if (live) setRestored(session);
      },
      (error) => {
        if (live) setFailure({ session, error });
      },
    );
    return () => {
      live = false;
    };
  }, [session]);
  useEffect(() => {
    if (restored === session) onReady();
  }, [restored, session, onReady]);
  if (failure?.session === session) throw failure.error;
  return children;
}

export function ToolBoundary(props: Props) {
  return (
    <LoadErrorBoundary {...props}>
      <Suspense
        fallback={
          <div className="loading-screen" role="status">
            {t('正在加载工具…')}
          </div>
        }
      >
        <MountedTool {...props} />
      </Suspense>
    </LoadErrorBoundary>
  );
}
